'use strict';
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const typesSvc = require('../services/types');
const ticketSvc = require('../services/tickets');
const settingsSvc = require('../services/settings');
const { baseEmbed } = require('../../../src/core/embeds');
const { slug, padNumber, PRIORITIES } = require('../services/util');

const ephemeral = MessageFlags.Ephemeral;
const say = (interaction, content) => interaction.reply({ content, flags: ephemeral });
const PERMS_ON = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket channel you are in')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('add').setDescription('Add a person to this ticket').addUserOption((o) => o.setName('user').setDescription('Who to add').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a person from this ticket').addUserOption((o) => o.setName('user').setDescription('Who to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('rename').setDescription('Rename this ticket channel').addStringOption((o) => o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(80)))
    .addSubcommand((s) =>
      s.setName('priority').setDescription('Set how urgent this ticket is').addStringOption((o) =>
        o.setName('level').setDescription('Priority').setRequired(true).addChoices(...Object.entries(PRIORITIES).map(([value, p]) => ({ name: p.label, value })))
      )
    )
    .addSubcommand((s) => s.setName('close').setDescription('Close this ticket').addStringOption((o) => o.setName('reason').setDescription('Why it is being closed').setMaxLength(500)))
    .addSubcommand((s) => s.setName('info').setDescription('Show details about this ticket')),

  async execute(ctx, interaction) {
    const ticket = ticketSvc.getByChannel(interaction.channelId);
    if (!ticket || ticket.guild_id !== interaction.guildId) return say(interaction, 'Use this command inside a ticket channel.');

    const type = typesSvc.get(interaction.guildId, ticket.type_id);
    const staff = typesSvc.canManage(interaction.member, type);
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel;

    if (sub === 'info') {
      const created = Math.floor(ticket.created_at / 1000);
      const embed = baseEmbed(interaction.guildId)
        .setTitle(`Ticket #${padNumber(ticket.number)}`)
        .addFields(
          { name: 'Type', value: ticket.type_name, inline: true },
          { name: 'Status', value: ticket.status, inline: true },
          { name: 'Priority', value: `${PRIORITIES[ticket.priority].emoji} ${PRIORITIES[ticket.priority].label}`, inline: true },
          { name: 'Opened by', value: `<@${ticket.user_id}>`, inline: true },
          { name: 'Claimed by', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Nobody', inline: true },
          { name: 'Opened', value: `<t:${created}:R>`, inline: true }
        );
      return interaction.reply({ embeds: [embed], flags: ephemeral });
    }

    if (sub === 'close') {
      const canClose = staff || (settingsSvc.get(interaction.guildId).allowUserClose && ticket.user_id === interaction.user.id);
      if (!canClose) return say(interaction, 'Only staff can close this ticket.');
      await interaction.deferReply({ flags: ephemeral });
      const result = await ticketSvc.closeTicket({ guild: interaction.guild, ticket, closedBy: interaction.user.id, reason: interaction.options.getString('reason') || '' });
      return interaction.editReply(result.ok ? 'Ticket closed.' : result.error);
    }

    if (!staff) return say(interaction, 'Only staff can use this command.');
    if (ticket.status !== 'open') return say(interaction, 'This ticket is closed. Reopen it first.');

    if (sub === 'add') {
      const user = interaction.options.getUser('user');
      if (user.id === ticket.user_id) return say(interaction, 'That person already opened this ticket.');
      await channel.permissionOverwrites.edit(user.id, PERMS_ON);
      await interaction.reply({ embeds: [baseEmbed(interaction.guildId).setDescription(`<@${user.id}> was added to this ticket by <@${interaction.user.id}>.`)], allowedMentions: { users: [user.id] } });
      return;
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      if (user.id === ticket.user_id) return say(interaction, 'You cannot remove the person who opened the ticket. Close the ticket instead.');
      await channel.permissionOverwrites.delete(user.id);
      await interaction.reply({ embeds: [baseEmbed(interaction.guildId).setDescription(`<@${user.id}> was removed from this ticket by <@${interaction.user.id}>.`)], allowedMentions: { parse: [] } });
      return;
    }

    if (sub === 'rename') {
      const name = slug(interaction.options.getString('name'));
      if (!name) return say(interaction, 'Use letters, numbers or dashes for the new name.');
      await interaction.deferReply({ flags: ephemeral });
      try {
        await channel.setName(name);
        await interaction.editReply(`Renamed to **${name}**.`);
      } catch (err) {
        await interaction.editReply('Discord limits channel renames to twice every 10 minutes. Try again shortly.');
      }
      return;
    }

    if (sub === 'priority') {
      const level = interaction.options.getString('level');
      await ticketSvc.setPriority({ guild: interaction.guild, ticket, level, byId: interaction.user.id });
      await interaction.reply({ content: 'Priority updated.', flags: ephemeral });
    }
  },
};
