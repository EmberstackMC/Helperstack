'use strict';
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

/**
 * Creates the Discord client.
 * Privileged intents (must be switched on in the Developer Portal, see SETUP.md):
 *   - GuildMembers   : check dashboard access, fetch members for tickets
 *   - MessageContent : write ticket transcripts
 */
function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.commands = new Collection(); // name -> { data, execute }
  client.interactionHandlers = []; // [{ id, execute }] for buttons, menus and modals
  return client;
}

module.exports = { createClient };
