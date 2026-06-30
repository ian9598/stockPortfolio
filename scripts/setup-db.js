/**
 * Database setup script
 *
 * Usage:
 *   npm run setup-db              → Uses TURSO_DB_URL env or local file
 *   TURSO_DB_URL=... npm run setup-db  → Uses remote Turso database
 *
 * For Turso (production):
 *   1. Create a Turso account at https://turso.tech
 *   2. Create a database via the dashboard
 *   3. Get the URL and auth token
 *   4. Run: TURSO_DB_URL=libsql://... TURSO_DB_TOKEN=... npm run setup-db
 *
 * For local development:
 *   Just run: npm run setup-db
 *   It uses a local SQLite file (db/local.db)
 */

import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.TURSO_DB_URL || `file:${path.join(__dirname, '..', 'db', 'local.db')}`;

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_DB_TOKEN || undefined,
});

console.log(`Connecting to: ${dbUrl}`);

try {
  // Create tables
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

  // Ensure capital row exists
  const row = await db.execute('SELECT COUNT(*) AS cnt FROM capital WHERE id = 1');
  if (row.rows[0].cnt === 0) {
    await db.execute('INSERT INTO capital (id, amount) VALUES (1, 0)');
  }

  console.log('✅ Database schema created successfully');
  console.log(`   - capital table (1 row: starting capital)`);
  console.log(`   - entries table (date, amount)`);
  process.exit(0);
} catch (e) {
  console.error('❌ Failed to initialize database:', e.message);
  process.exit(1);
}