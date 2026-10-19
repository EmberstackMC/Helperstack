'use strict';
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const permissions = require('../../../src/core/permissions');
const { baseEmbed } = require('../../../src/core/embeds');

const mentionList = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(' ') : '*Nobody yet*');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Show which roles are admins and ticket staff, and link to the dashboard'),

  async execute(ctx, interaction) {
    if (!permissions.isAdminMember(interaction.member)) {
      return interaction.reply({ content: 'Only admins can use /setup.', flags: MessageFlags.Ephemeral });
    }
    const roles = permissions.getRoleConfig(interaction.guildId);
    const embed = baseEmbed(interaction.guildId)
      .setTitle('Emberstack setup')
      .setDescription(`Change any of this on the dashboard: ${ctx.config.baseUrl}/roles`)
      .addFields(
        { name: 'Full admins', value: mentionList(roles.admin) },
        { name: 'Ticket staff', value: mentionList(roles.staff) },
        { name: 'Optional specialist roles', value: mentionList(roles.specialist) },
        { name: 'Never staff', value: mentionList(roles.blocked) }
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
