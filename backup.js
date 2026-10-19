'use strict';
/**
 * Makes a safe, compressed copy of the database (works while the bot is running).
 *   npm run backup
 * Writes backups/emberstack-YYYY-MM-DD-HH-MM-SS.db.gz and deletes backups older than BACKUP_KEEP_DAYS (default 14).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });

const dbPath = path.resolve(root, process.env.DATABASE_PATH || './data/emberstack.db');
const dir = path.resolve(root, process.env.BACKUP_DIR || './backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);

async function main() {
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found at ${dbPath}. Has the bot run at least once?`);
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-'); // 2026-10-18-04-00-01
  const plain = path.join(dir, `emberstack-${stamp}.db`);
  const target = `${plain}.gz`;

  // SQLite's online backup API gives a consistent snapshot even while the bot is writing.
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    await db.backup(plain);
  } finally {
    db.close();
  }

  // Make the copy a standalone single file (no -wal/-shm side files) and check it is healthy before trusting it.
  const copy = new Database(plain);
  copy.pragma('journal_mode = DELETE');
  const result = copy.pragma('integrity_check', { simple: true });
  copy.close();
  fs.rmSync(`${plain}-wal`, { force: true });
  fs.rmSync(`${plain}-shm`, { force: true });
  if (result !== 'ok') {
    fs.rmSync(plain, { force: true });
    throw new Error(`Backup failed its integrity check (${result}). Nothing was saved.`);
  }

  await pipeline(fs.createReadStream(plain), zlib.createGzip({ level: 9 }), fs.createWriteStream(target));
  fs.rmSync(plain, { force: true });

  let removed = 0;
  const cutoff = Date.now() - keepDays * 86400000;
  for (const file of fs.readdirSync(dir)) {
    if (!/^emberstack-.*\.db\.gz$/.test(file)) continue;
    const full = path.join(dir, file);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.rmSync(full);
      removed += 1;
    }
  }
  const kb = Math.round(fs.statSync(target).size / 1024);
  console.log(`Backup saved: ${target} (${kb} KB)${removed ? `, removed ${removed} old backup${removed === 1 ? '' : 's'}` : ''}`);
}

main().catch((err) => {
  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
});
