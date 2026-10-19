'use strict';
/**
 * SQLite database (better-sqlite3) plus a tiny migration runner.
 *
 * Every module can ship SQL files in modules/<name>/database/migrations/ (001_init.sql, 002_xxx.sql ...).
 * Each file runs exactly once, in filename order, and is recorded in the _migrations table.
 *
 * Moving to PostgreSQL later: see MIGRATING_TO_POSTGRES.md (coming in the hosting part).
 * All tables store guild_id so the bot is ready for more than one server.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('./logger').forModule('database');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL'); // safer and faster for a bot + dashboard sharing one file
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000'); // wait up to 5s instead of throwing "database is locked"

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id   TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, key)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    data    TEXT    NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);
  CREATE TABLE IF NOT EXISTS _migrations (
    module     TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    applied_at INTEGER NOT NULL,
    PRIMARY KEY (module, name)
  );
`);

/** Apply any new .sql files from a module's migrations folder. */
function runMigrations(moduleName, dir) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const isApplied = db.prepare('SELECT 1 FROM _migrations WHERE module = ? AND name = ?');
  const record = db.prepare('INSERT INTO _migrations (module, name, applied_at) VALUES (?, ?, ?)');
  let applied = 0;

  for (const file of files) {
    if (isApplied.get(moduleName, file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(moduleName, file, Date.now());
    })();
    logger.info(`Applied migration ${moduleName}/${file}`);
    applied += 1;
  }
  return applied;
}

module.exports = { db, runMigrations };
