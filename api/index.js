/**
 * Stock Portfolio P&L Tracker — Vercel Serverless API (Turso/SQLite)
 *
 * Endpoints:
 *   GET    /api    → { capital, entries }
 *   PUT    /api    → Update capital  { capital: N }
 *   POST   /api    → Add entry       { date, amount }
 *   DELETE /api    → Delete entry    { date, amount }
 *   DELETE /api?reset=1 → Reset all data
 */

import { createClient } from '@libsql/client';

const dbUrl = process.env.TURSO_DB_URL || 'file:./db/local.db';

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_DB_TOKEN || undefined,
});

// ─── Schema init (runs once per cold start) ───
async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS capital (
      id     INTEGER PRIMARY KEY DEFAULT 1,
      amount REAL    NOT NULL DEFAULT 0
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS entries (
      date   TEXT PRIMARY KEY,
      amount REAL NOT NULL
    )
  `);
  // Ensure the capital row exists
  const row = await db.execute('SELECT COUNT(*) AS cnt FROM capital WHERE id = 1');
  if (row.rows[0].cnt === 0) {
    await db.execute('INSERT INTO capital (id, amount) VALUES (1, 0)');
  }
}

// ─── Helpers ───
function jsonResponse(res, status, data) {
  res.status(status).json(data);
}

function parseBody(req) {
  if (typeof req.body === 'object') return req.body;
  return {};
}

async function getState() {
  const capRow = await db.execute('SELECT amount FROM capital WHERE id = 1');
  const capital = capRow.rows[0]?.amount ?? 0;
  const entryRows = await db.execute('SELECT date, amount FROM entries ORDER BY date ASC');
  const entries = entryRows.rows.map(r => ({
    date: r.date,
    amount: r.amount,
  }));
  return { capital, entries };
}

// ─── Vercel serverless handler ───
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Ensure schema exists
  try {
    await initSchema();
  } catch (e) {
    console.error('Schema init error:', e);
    return jsonResponse(res, 500, { success: false, error: 'Database init failed: ' + e.message });
  }

  try {
    switch (req.method) {

      // ── GET ──
      case 'GET': {
        const state = await getState();
        return jsonResponse(res, 200, { success: true, ...state });
      }

      // ── PUT: Update capital ──
      case 'PUT': {
        const data = parseBody(req);
        if (data.capital === undefined || typeof data.capital !== 'number' || data.capital < 0) {
          return jsonResponse(res, 400, { success: false, error: 'Valid capital amount required' });
        }
        const amount = Math.round(data.capital * 100) / 100;
        await db.execute({
          sql: 'UPDATE capital SET amount = ? WHERE id = 1',
          args: [amount],
        });
        return jsonResponse(res, 200, { success: true, capital: amount });
      }

      // ── POST: Add entry ──
      case 'POST': {
        const data = parseBody(req);
        if (!data.date || data.amount === undefined || typeof data.amount !== 'number') {
          return jsonResponse(res, 400, { success: false, error: 'Valid date and amount required' });
        }
        const date = data.date;
        const amount = Math.round(data.amount * 100) / 100;

        // Check for duplicate
        const check = await db.execute({ sql: 'SELECT COUNT(*) AS cnt FROM entries WHERE date = ?', args: [date] });
        if (check.rows[0].cnt > 0) {
          return jsonResponse(res, 409, { success: false, error: `An entry for ${date} already exists` });
        }

        await db.execute({ sql: 'INSERT INTO entries (date, amount) VALUES (?, ?)', args: [date, amount] });
        return jsonResponse(res, 201, { success: true, entry: { date, amount } });
      }

      // ── DELETE: Delete entry or reset ──
      case 'DELETE': {
        // Reset all
        if (req.query.reset !== undefined) {
          await db.execute('UPDATE capital SET amount = 0 WHERE id = 1');
          await db.execute('DELETE FROM entries');
          return jsonResponse(res, 200, { success: true, message: 'All data reset' });
        }

        // Delete single entry
        const data = parseBody(req);
        if (!data.date || data.amount === undefined) {
          return jsonResponse(res, 400, { success: false, error: 'Valid date and amount required' });
        }
        const date = data.date;
        const amount = Math.round(data.amount * 100) / 100;

        const result = await db.execute({
          sql: 'DELETE FROM entries WHERE date = ? AND ABS(amount - ?) < 0.001',
          args: [date, amount],
        });
        if (result.rowsAffected === 0) {
          return jsonResponse(res, 404, { success: false, error: 'Entry not found' });
        }
        return jsonResponse(res, 200, { success: true, message: 'Entry deleted' });
      }

      default:
        return jsonResponse(res, 405, { success: false, error: 'Method not allowed' });
    }
  } catch (e) {
    console.error('API error:', e);
    return jsonResponse(res, 500, { success: false, error: 'Server error: ' + e.message });
  }
}