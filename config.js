'use strict';
/**
 * Central configuration. Reads the .env file once, validates it, and exports a frozen object.
 * If something is missing the app stops immediately with a clear message instead of failing later.
 */
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(rootDir, '.env'), quiet: true });

const env = (key, fallback = '') => String(process.env[key] ?? fallback).trim();

function fail(message) {
  console.error(`\n[Emberstack] Configuration problem:\n  ${message}\n\nSee SETUP.md and .env.example.\n`);
  process.exit(1);
}

const required = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'GUILD_ID',
  'BASE_URL',
  'SESSION_SECRET',
];
const missing = required.filter((key) => !env(key));
if (missing.length) {
  fail(`These values are missing in your .env file:\n  - ${missing.join('\n  - ')}`);
}

if (env('SESSION_SECRET').length < 32) {
  fail('SESSION_SECRET must be at least 32 characters long. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}

let baseUrl;
try {
  baseUrl = new URL(env('BASE_URL'));
} catch {
  fail('BASE_URL is not a valid URL. Example: http://localhost:3000 or https://dashboard.example.com');
}
if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  fail('BASE_URL must start with http:// or https://');
}

function parseTrustProxy(value) {
  if (value === '') return 1;
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value; // e.g. "loopback" or a list of subnets - passed straight to Express
}

const publicUrl = baseUrl.origin; // no trailing slash, no path

const config = {
  rootDir,
  token: env('DISCORD_TOKEN'),
  clientId: env('DISCORD_CLIENT_ID'),
  clientSecret: env('DISCORD_CLIENT_SECRET'),
  guildId: env('GUILD_ID'),
  // Multi-server later: add more IDs here (or load them from the database).
  allowedGuildIds: [env('GUILD_ID')],

  baseUrl: publicUrl,
  redirectUri: `${publicUrl}/auth/callback`,
  secureCookies: baseUrl.protocol === 'https:',
  sessionSecret: env('SESSION_SECRET'),
  port: parseInt(env('PORT', '3000'), 10) || 3000,
  trustProxy: parseTrustProxy(env('TRUST_PROXY')),

  adminIds: new Set(
    env('DASHBOARD_ADMIN_IDS')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  ),

  databasePath: path.resolve(rootDir, env('DATABASE_PATH', './data/emberstack.db')),
  logDir: path.resolve(rootDir, env('LOG_DIR', './logs')),
  logLevel: env('LOG_LEVEL', 'info'),
  isProd: env('NODE_ENV') === 'production',
};

module.exports = Object.freeze(config);
