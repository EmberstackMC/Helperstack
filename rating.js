'use strict';
/** Star rating after a ticket closes: five buttons, then an optional comment box. Works from DMs. */
const { MessageFlags, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const ticketSvc = require('../services/tickets');

module.exports = [
  {
    id: 'tickets:rate',
    async execute(ctx, interaction) {
      const [, , ticketId, stars] = interaction.customId.split(':');
      const rating = Number(stars);
      if (!(rating >= 1 && rating <= 5)) return;
      const ticket = ticketSvc.saveRating(Number(ticketId), interaction.user.id, rating);
      if (!ticket) return interaction.reply({ content: 'Only the person who opened the ticket can rate it.', flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder().setCustomId(`tickets:ratemodal:${ticketId}:${rating}`).setTitle(`Thanks for rating ${rating}/5`).addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('comment').setLabel('Anything we should know? (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
        )
      );
      await interaction.showModal(modal);
    },
  },
  {
    id: 'tickets:ratemodal',
    async execute(ctx, interaction) {
      const [, , ticketId, stars] = interaction.customId.split(':');
      const comment = interaction.fields.getTextInputValue('comment').trim();
      const ticket = ticketSvc.saveRating(Number(ticketId), interaction.user.id, Number(stars), comment || null);
      if (!ticket) return interaction.reply({ content: 'Only the person who opened the ticket can rate it.', flags: MessageFlags.Ephemeral });

      const thanks = new EmbedBuilder().setColor(0xffc36b).setTitle('Thank you!').setDescription(`You rated this ticket ${'\u2B50'.repeat(Number(stars))}. Your feedback helps the team.`);
      if (interaction.isFromMessage?.()) await interaction.update({ embeds: [thanks], components: [] });
      else await interaction.reply({ embeds: [thanks], flags: MessageFlags.Ephemeral });
      await ticketSvc.logRating(ticket);
    },
  },
];
