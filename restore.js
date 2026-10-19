'use strict';
/**
 * Restores the database from a backup. STOP THE BOT FIRST (pm2 stop emberstack, or docker compose stop emberstack).
 *   npm run restore -- backups/emberstack-2026-10-18-04-00-01.db.gz
 *   npm run restore -- backups/emberstack-2026-10-18-04-00-01.db.gz --yes     (skip the question)
 * The current database is kept next to it as *.before-restore-<time>, so a restore can itself be undone.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const dbPath = path.resolve(root, process.env.DATABASE_PATH || './data/emberstack.db');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const assumeYes = args.includes('--yes');

const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });

async function main() {
  if (!file) throw new Error('Tell me which backup to restore, for example:\n  npm run restore -- backups/emberstack-2026-10-18-04-00-01.db.gz');
  const source = path.resolve(process.cwd(), file);
  if (!fs.existsSync(source)) throw new Error(`Backup file not found: ${source}`);

  const raw = source.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(source)) : fs.readFileSync(source);
  const temp = `${dbPath}.restoring`;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(temp, raw);

  try {
    const check = new Database(temp);
    check.pragma('journal_mode = DELETE'); // keeps the restored file a single clean file
    const verdict = check.pragma('integrity_check', { simple: true });
    const hasSettings = check.prepare("SELECT name FROM sqlite_master WHERE name = 'settings'").get();
    check.close();
    fs.rmSync(`${temp}-wal`, { force: true });
    fs.rmSync(`${temp}-shm`, { force: true });
    if (verdict !== 'ok' || !hasSettings) throw new Error('That file is not a healthy Emberstack database. Nothing was changed.');
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }

  if (!assumeYes) {
    const answer = await ask(`This replaces the live database at ${dbPath}.\nIs the bot stopped? Type "yes" to continue: `);
    if (answer !== 'yes') {
      fs.rmSync(temp, { force: true });
      console.log('Cancelled. Nothing was changed.');
      return;
    }
  }

  if (fs.existsSync(dbPath)) {
    const keep = `${dbPath}.before-restore-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}`;
    fs.renameSync(dbPath, keep);
    console.log(`Old database kept as ${keep}`);
  }
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.renameSync(temp, dbPath);
  console.log('Restore complete. Start the bot again (pm2 start emberstack, or docker compose start emberstack).');
}

main().catch((err) => {
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
});
