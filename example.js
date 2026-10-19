'use strict';
const { MessageFlags } = require('discord.js');

module.exports = {
  id: '__NAME__:example', // matches customId "__NAME__:example" and anything starting with "__NAME__:example:"

  async execute(ctx, interaction) {
    await interaction.reply({ content: 'The button works.', flags: MessageFlags.Ephemeral });
  },
};
