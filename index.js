'use strict';
/**
 * Emberstack Bot - entry point.
 * Starts: database -> Discord client -> modules -> dashboard -> Discord login.
 */
const config = require('./config');
const logger = require('./core/logger');
const ctx = require('./core/context');
const { createClient } = require('./core/discord');
const { loadModules } = require('./core/moduleLoader');
const { handleInteraction } = require('./core/interactionRouter');
const { createDashboard } = require('./dashboard/server');
const { REST, Routes } = require('discord.js');
const { db } = require('./core/database');

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason?.stack || reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception, shutting down so the process manager can restart cleanly: ${err.stack || err}`);
  setTimeout(() => process.exit(1), 500);
});

async function registerCommands() {
  const body = [...ctx.client.commands.values()].map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);
  for (const guildId of config.allowedGuildIds) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
    logger.info(`Registered ${body.length} slash commands in guild ${guildId}`);
  }
}

async function main() {
  logger.info('Starting Emberstack Bot...');

  const client = createClient();
  ctx.client = client;
  ctx.registerCommands = registerCommands;

  client.on('error', (err) => logger.error(`Discord client error: ${err.stack || err}`));
  client.on('warn', (msg) => logger.warn(`Discord warning: ${msg}`));
  client.on('interactionCreate', (interaction) => handleInteraction(ctx, interaction));

  ctx.modules = loadModules(ctx);

  client.once('clientReady', async () => {
    logger.info(`Logged in to Discord as ${client.user.tag}`);
    try {
      await registerCommands();
    } catch (err) {
      logger.error(`Could not register slash commands: ${err.stack || err}`);
    }
  });

  // Dashboard first, so the health check responds even while Discord is connecting.
  const dashboard = createDashboard(ctx);
  const server = dashboard.listen(config.port, () => {
    logger.info(`Dashboard listening on port ${config.port} (public URL: ${config.baseUrl})`);
  });
  server.on('error', (err) => {
    logger.error(
      err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Stop the other program or change PORT in .env.`
        : `Dashboard server error: ${err.stack || err}`
    );
    process.exit(1);
  });

  try {
    await client.login(config.token);
  } catch (err) {
    logger.error(`Discord login failed. Check DISCORD_TOKEN in .env and that the intents are enabled. (${err.message})`);
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received - shutting down`);
    try {
      server.close();
      await client.destroy();
      db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.stack || err}`);
  process.exit(1);
});
