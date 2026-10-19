'use strict';
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { baseEmbed } = require('../../../src/core/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('__NAME___hello').setDescription('Example command from the __LABEL__ module'),

  async execute(ctx, interaction) {
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM __NAME___items WHERE guild_id = ?').get(interaction.guildId);
    const embed = baseEmbed(interaction.guildId).setTitle('__LABEL__').setDescription(`There are **${n}** items saved on the dashboard.`);
    // customId "__NAME__:example" is routed to interactions/example.js
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('__NAME__:example').setLabel('Press me').setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};
