'use strict';
/**
 * The shared "context" object. Modules receive it as the first argument of every command,
 * event and interaction handler, and as the second argument of dashboard route files.
 * Services inside a module can also require it directly:
 *     const ctx = require('../../../src/core/context');
 */
const config = require('../config');
const logger = require('./logger');
const { db } = require('./database');
const settings = require('./settings');

const ctx = {
  config,
  logger,
  db,
  settings,
  client: null, // set in src/index.js
  modules: [], // set in src/index.js (list of loaded modules)
  startedAt: Date.now(),
  registerCommands: async () => {}, // set in src/index.js
  isGuildAllowed: (guildId) => config.allowedGuildIds.includes(String(guildId)),
};

module.exports = ctx;
