'use strict';
/**
 * Receives every Discord interaction and sends it to the right module handler.
 * Handles errors in one place so a bug in one feature never crashes the bot.
 */
const { MessageFlags } = require('discord.js');

async function safeReply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    /* the interaction expired - nothing more we can do */
  }
}

async function handleInteraction(ctx, interaction) {
  const { client, logger } = ctx;
  try {
    // Single-server mode: ignore other servers. (Remove this check to go multi-server.)
    if (interaction.guildId && !ctx.isGuildAllowed(interaction.guildId)) {
      return safeReply(interaction, 'This bot is not set up for this server.');
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      if (command.guildOnly !== false && !interaction.inGuild()) {
        return safeReply(interaction, 'This command only works inside the server.');
      }
      return await command.execute(ctx, interaction);
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(ctx, interaction);
      return;
    }

    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
      const id = interaction.customId;
      const handler = client.interactionHandlers.find((h) => id === h.id || id.startsWith(`${h.id}:`));
      if (!handler) {
        logger.debug(`No handler for customId "${id}"`);
        return;
      }
      return await handler.execute(ctx, interaction);
    }
  } catch (err) {
    logger.error(`Interaction failed (${interaction.commandName || interaction.customId || interaction.type}): ${err.stack || err}`);
    await safeReply(interaction, 'Something went wrong while handling that. The team has been notified in the logs.');
  }
}

module.exports = { handleInteraction, safeReply };
