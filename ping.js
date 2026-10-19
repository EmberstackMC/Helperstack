'use strict';
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { baseEmbed } = require('../../../src/core/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check that the bot is awake'),

  async execute(ctx, interaction) {
    const embed = baseEmbed(interaction.guildId)
      .setTitle('Pong')
      .setDescription(`Gateway latency: **${Math.round(ctx.client.ws.ping)} ms**`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
