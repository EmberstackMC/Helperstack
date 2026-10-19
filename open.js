'use strict';
/**
 * Opening a ticket: panel buttons (tickets:open:<typeId>), the panel dropdown (tickets:openmenu)
 * and the optional pre-ticket form (tickets:form:<typeId>).
 */
const { MessageFlags, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const typesSvc = require('../services/types');
const ticketSvc = require('../services/tickets');
const { truncate } = require('../services/util');

const ephemeral = MessageFlags.Ephemeral;

function friendlyError(err) {
  if (err?.code === 50013) return 'I do not have permission to create ticket channels. Please tell an admin to check my permissions.';
  if (err?.code === 50035 && /categor/i.test(err.message)) return 'The ticket category is full. Please tell an admin.';
  return 'Something went wrong while creating your ticket. Please try again, or tell an admin.';
}

function buildModal(type) {
  const modal = new ModalBuilder().setCustomId(`tickets:form:${type.id}`).setTitle(truncate(type.name, 45));
  type.formQuestions.slice(0, 5).forEach((q, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel(truncate(q.label, 45))
      .setStyle(q.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false)
      .setMaxLength(q.style === 'long' ? 1000 : 250);
    if (q.placeholder) input.setPlaceholder(truncate(q.placeholder, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}

async function finish(ctx, interaction, type, answers) {
  try {
    const { channel } = await ticketSvc.createTicket({ guild: interaction.guild, member: interaction.member, type, answers });
    await interaction.editReply({ content: `Your ticket is ready: ${channel}` });
  } catch (err) {
    ctx.logger.error(`Could not create a ticket for ${interaction.user.id}: ${err.stack || err.message}`);
    await interaction.editReply({ content: friendlyError(err) }).catch(() => {});
  }
}

/** Checks limits, then shows the form or creates the ticket straight away. */
async function begin(ctx, interaction, typeId) {
  const type = typesSvc.get(interaction.guildId, typeId);
  if (!type) return interaction.reply({ content: 'That ticket type no longer exists. Please ask an admin to update the panel.', flags: ephemeral });

  const problem = ticketSvc.checkCanOpen(interaction.guildId, interaction.user.id, type);
  if (problem) return interaction.reply({ content: problem, flags: ephemeral });

  if (type.formQuestions.length > 0) return interaction.showModal(buildModal(type));

  await interaction.deferReply({ flags: ephemeral });
  return finish(ctx, interaction, type, []);
}

/** A dropdown keeps showing the last choice. Re-saving the message resets it so the same option can be picked again. */
function resetMenu(interaction) {
  interaction.message?.edit({ components: interaction.message.components }).catch(() => {});
}

module.exports = [
  {
    id: 'tickets:open',
    async execute(ctx, interaction) {
      await begin(ctx, interaction, Number(interaction.customId.split(':')[2]));
    },
  },
  {
    id: 'tickets:openmenu',
    async execute(ctx, interaction) {
      await begin(ctx, interaction, Number(interaction.values[0]));
      resetMenu(interaction);
    },
  },
  {
    id: 'tickets:form',
    async execute(ctx, interaction) {
      const type = typesSvc.get(interaction.guildId, Number(interaction.customId.split(':')[2]));
      if (!type) return interaction.reply({ content: 'That ticket type no longer exists.', flags: ephemeral });

      // Limits are checked again: someone could have opened another ticket while the form was open.
      const problem = ticketSvc.checkCanOpen(interaction.guildId, interaction.user.id, type);
      if (problem) return interaction.reply({ content: problem, flags: ephemeral });

      const answers = type.formQuestions.slice(0, 5).map((q, i) => ({
        label: q.label,
        value: interaction.fields.getTextInputValue(`q${i}`).trim(),
      }));
      await interaction.deferReply({ flags: ephemeral });
      return finish(ctx, interaction, type, answers);
    },
  },
];
