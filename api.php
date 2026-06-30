<?php
/**
 * Stock Portfolio P&L Tracker — REST API (SQLite backend)
 *
 * Endpoints:
 *   GET    /api.php          → { capital, entries }
 *   PUT    /api.php          → Update capital  { capital: N }
 *   POST   /api.php          → Add entry       { date, amount }
 *   DELETE /api.php          → Delete entry    { date, amount }
 *   DELETE /api.php?reset=1  → Reset all data
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── Database setup ───
$dbPath = __DIR__ . '/portfolio.db';
try {
    $db = new PDO("sqlite:$dbPath");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Create tables if they don't exist
    $db->exec("
        CREATE TABLE IF NOT EXISTS capital (
            id     INTEGER PRIMARY KEY DEFAULT 1,
            amount REAL    NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS entries (
            date   TEXT PRIMARY KEY,
            amount REAL NOT NULL
        );
    ");

    // Ensure the capital row exists
    $stmt = $db->query("SELECT COUNT(*) AS cnt FROM capital WHERE id = 1");
    if ((int)$stmt->fetchColumn() === 0) {
        $db->exec("INSERT INTO capital (id, amount) VALUES (1, 0)");
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    exit;
}

// ─── Helper functions ───

function getState(PDO $db): array {
    $capital = $db->query("SELECT amount FROM capital WHERE id = 1")->fetchColumn();
    $entries = $db->query("SELECT date, amount FROM entries ORDER BY date ASC")->fetchAll();
    return [
        'capital' => (float)($capital ?: 0),
        'entries' => $entries ?: []
    ];
}

function jsonInput(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
        exit;
    }
    return $data;
}

function jsonResponse(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// ─── Routing ───
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {

        // ── GET: Fetch all state ──
        case 'GET':
            $state = getState($db);
            jsonResponse(200, ['success' => true] + $state);
            break;

        // ── PUT: Update capital ──
        case 'PUT':
            $data = jsonInput();
            if (!isset($data['capital']) || !is_numeric($data['capital']) || $data['capital'] < 0) {
                jsonResponse(400, ['success' => false, 'error' => 'Valid capital amount required']);
            }
            $amount = round((float)$data['capital'], 2);
            $stmt = $db->prepare("UPDATE capital SET amount = ? WHERE id = 1");
            $stmt->execute([$amount]);
            jsonResponse(200, ['success' => true, 'capital' => $amount]);
            break;

        // ── POST: Add an entry ──
        case 'POST':
            $data = jsonInput();
            if (empty($data['date']) || !isset($data['amount']) || !is_numeric($data['amount'])) {
                jsonResponse(400, ['success' => false, 'error' => 'Valid date and amount required']);
            }
            $date   = $data['date'];
            $amount = round((float)$data['amount'], 2);

            // Check for duplicate date
            $check = $db->prepare("SELECT COUNT(*) FROM entries WHERE date = ?");
            $check->execute([$date]);
            if ((int)$check->fetchColumn() > 0) {
                jsonResponse(409, ['success' => false, 'error' => "An entry for {$date} already exists"]);
            }

            $stmt = $db->prepare("INSERT INTO entries (date, amount) VALUES (?, ?)");
            $stmt->execute([$date, $amount]);
            jsonResponse(201, ['success' => true, 'entry' => ['date' => $date, 'amount' => $amount]]);
            break;

        // ── DELETE: Delete entry or reset all ──
        case 'DELETE':
            // Reset all data
            if (isset($_GET['reset'])) {
                $db->exec("UPDATE capital SET amount = 0 WHERE id = 1");
                $db->exec("DELETE FROM entries");
                jsonResponse(200, ['success' => true, 'message' => 'All data reset']);
                break;
            }

            // Delete single entry
            $data = jsonInput();
            if (empty($data['date']) || !isset($data['amount'])) {
                jsonResponse(400, ['success' => false, 'error' => 'Valid date and amount required']);
            }
            $date   = $data['date'];
            $amount = round((float)$data['amount'], 2);

            $stmt = $db->prepare("DELETE FROM entries WHERE date = ? AND ABS(amount - ?) < 0.001");
            $stmt->execute([$date, $amount]);

            if ($stmt->rowCount() === 0) {
                jsonResponse(404, ['success' => false, 'error' => 'Entry not found']);
            }
            jsonResponse(200, ['success' => true, 'message' => 'Entry deleted']);
            break;

        default:
            jsonResponse(405, ['success' => false, 'error' => 'Method not allowed']);
    }
} catch (PDOException $e) {
    jsonResponse(500, ['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}