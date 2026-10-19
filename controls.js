'use strict';
/** Buttons inside a ticket channel: close, close with reason, claim, reopen, delete. */
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const typesSvc = require('../services/types');
const ticketSvc = require('../services/tickets');
const settingsSvc = require('../services/settings');
const permissions = require('../../../src/core/permissions');
const { baseEmbed } = require('../../../src/core/embeds');

const ephemeral = MessageFlags.Ephemeral;
const say = (interaction, content) => interaction.reply({ content, flags: ephemeral });

/** Finds the ticket for this channel and works out what this person may do. Replies and returns null if not a ticket. */
async function load(interaction) {
  const ticket = ticketSvc.getByChannel(interaction.channelId);
  if (!ticket || ticket.guild_id !== interaction.guildId) {
    await say(interaction, 'This is not a ticket channel.');
    return null;
  }
  const type = typesSvc.get(interaction.guildId, ticket.type_id);
  const staff = typesSvc.canManage(interaction.member, type);
  const settings = settingsSvc.get(interaction.guildId);
  const canClose = staff || (settings.allowUserClose && interaction.user.id === ticket.user_id);
  return { ticket, type, staff, canClose };
}

const confirmRow = (confirmId) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel('Yes, continue').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tickets:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

module.exports = [
  // ---- Close (with confirmation) ----
  {
    id: 'tickets:close',
    async execute(ctx, interaction) {
      const c = await load(interaction);
      if (!c) return;
      if (c.ticket.status !== 'open') return say(interaction, 'This ticket is already closed.');
      if (!c.canClose) return say(interaction, 'Only staff can close this ticket.');
      await interaction.reply({
        embeds: [baseEmbed(interaction.guildId).setTitle('Close this ticket?').setDescription('The channel will be locked and a transcript saved. Staff can reopen it afterwards.')],
        components: [confirmRow('tickets:closeconfirm')],
        flags: ephemeral,
      });
    },
  },
  {
    id: 'tickets:closeconfirm',
    async execute(ctx, interaction) {
      await interaction.deferUpdate();
      const ticket = ticketSvc.getByChannel(interaction.channelId);
      const type = ticket && typesSvc.get(interaction.guildId, ticket.type_id);
      const allowed = ticket && (typesSvc.canManage(interaction.member, type) || (settingsSvc.get(interaction.guildId).allowUserClose && ticket.user_id === interaction.user.id));
      if (!ticket || !allowed) return interaction.editReply({ content: 'You cannot close this ticket.', embeds: [], components: [] });
      const result = await ticketSvc.closeTicket({ guild: interaction.guild, ticket, closedBy: interaction.user.id });
      await interaction.editReply({ content: result.ok ? 'Ticket closed.' : result.error, embeds: [], components: [] });
    },
  },
  {
    id: 'tickets:cancel',
    async execute(ctx, interaction) {
      await interaction.update({ content: 'Cancelled. Nothing was changed.', embeds: [], components: [] });
    },
  },

  // ---- Close with reason (the modal acts as the confirmation) ----
  {
    id: 'tickets:closereason',
    async execute(ctx, interaction) {
      const c = await load(interaction);
      if (!c) return;
      if (c.ticket.status !== 'open') return say(interaction, 'This ticket is already closed.');
      if (!c.canClose) return say(interaction, 'Only staff can close this ticket.');
      const modal = new ModalBuilder().setCustomId('tickets:closemodal').setTitle('Close ticket').addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
        )
      );
      await interaction.showModal(modal);
    },
  },
  {
    id: 'tickets:closemodal',
    async execute(ctx, interaction) {
      const c = await load(interaction);
      if (!c) return;
      if (!c.canClose) return say(interaction, 'Only staff can close this ticket.');
      await interaction.deferReply({ flags: ephemeral });
      const reason = interaction.fields.getTextInputValue('reason').trim();
      const result = await ticketSvc.closeTicket({ guild: interaction.guild, ticket: c.ticket, closedBy: interaction.user.id, reason });
      await interaction.editReply({ content: result.ok ? 'Ticket closed.' : result.error });
    },
  },

  // ---- Claim / release ----
  {
    id: 'tickets:claim',
    async execute(ctx, interaction) {
      const c = await load(interaction);
      if (!c) return;
      if (c.ticket.status !== 'open') return say(interaction, 'This ticket is closed.');
      if (!c.staff) return say(interaction, 'Only staff can claim tickets.');
      const isAdmin = permissions.isAdminMember(interaction.member);
      const outcome = ticketSvc.claim({ guild: interaction.guild, ticket: c.ticket, member: interaction.member, isAdmin });
      if (outcome.result === 'denied') return say(interaction, `This ticket is already claimed by <@${outcome.by}>.`);

      const claimedName = outcome.result === 'claimed' ? interaction.member.displayName : '';
      await interaction.update({ components: [ticketSvc.controlsRow(c.type, claimedName)] });
      await ticketSvc.announceClaim({ guild: interaction.guild, channel: interaction.channel, ticket: outcome.ticket, member: interaction.member, result: outcome.result });
    },
  },

  // ---- Reopen / delete (staff only) ----
  {
    id: 'tickets:reopen',
    async execute(ctx, interaction) {
      const c = await load(interaction);
      if (!c) return;
      if (!c.staff) return say(interaction, 'Only staff can reopen tickets.');
      await interaction.deferReply({ flags: ephemeral });
      const result = await ticketSvc.reopenTicket({ guild: interaction.guild, ticket: c.ticket, byId: interaction.user.id });
      await interaction.editReply({ content: result.ok ? 'Ticket reopened.' : result.error });
    },
  },
  {
    id: 'tickets:delete',
    async execute(ctx, interaction) {
      const c = await load(interaction);
      if (!c) return;
      if (!c.staff) return say(interaction, 'Only staff can delete tickets.');
      await interaction.reply({
        embeds: [baseEmbed(interaction.guildId).setTitle('Delete this ticket?').setDescription('The channel is removed from Discord. The transcript stays available on the dashboard.')],
        components: [confirmRow('tickets:deleteconfirm')],
        flags: ephemeral,
      });
    },
  },
  {
    id: 'tickets:deleteconfirm',
    async execute(ctx, interaction) {
      await interaction.deferUpdate();
      const ticket = ticketSvc.getByChannel(interaction.channelId);
      const type = ticket && typesSvc.get(interaction.guildId, ticket.type_id);
      if (!ticket || !typesSvc.canManage(interaction.member, type)) return interaction.editReply({ content: 'Only staff can delete tickets.', embeds: [], components: [] });
      await interaction.editReply({ content: 'Deleting...', embeds: [], components: [] }).catch(() => {});
      await ticketSvc.deleteTicket({ guild: interaction.guild, ticket, byId: interaction.user.id });
    },
  },
];
