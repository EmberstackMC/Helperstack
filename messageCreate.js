'use strict';
/** Tracks activity in ticket channels: resets the inactivity timer and records the first staff response. */
const ctx = require('../../../src/core/context');
const typesSvc = require('../services/types');

const { db } = ctx;

module.exports = {
  name: 'messageCreate',
  async execute(_ctx, message) {
    if (!message.guildId || message.author.bot || !ctx.isGuildAllowed(message.guildId)) return;
    const ticket = db.prepare("SELECT id, user_id, type_id, first_response_at FROM tickets WHERE channel_id = ? AND status = 'open'").get(message.channelId);
    if (!ticket) return;

    let respondedAt = null;
    if (!ticket.first_response_at && message.author.id !== ticket.user_id && message.member) {
      if (typesSvc.canManage(message.member, typesSvc.get(message.guildId, ticket.type_id))) respondedAt = Date.now();
    }
    db.prepare('UPDATE tickets SET last_activity_at = ?, warned_at = NULL, first_response_at = COALESCE(first_response_at, ?) WHERE id = ?').run(Date.now(), respondedAt, ticket.id);
  },
};
