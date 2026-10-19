'use strict';
/** If someone deletes a ticket channel by hand, mark the ticket as deleted so limits and stats stay correct. */
module.exports = {
  name: 'channelDelete',
  async execute(ctx, channel) {
    const info = ctx.db
      .prepare("UPDATE tickets SET status = 'deleted', closed_at = COALESCE(closed_at, ?) WHERE channel_id = ? AND status IN ('open', 'closed')")
      .run(Date.now(), channel.id);
    if (info.changes) ctx.logger.forModule('tickets').warn(`Ticket channel ${channel.id} was deleted manually; ticket marked as deleted`);
  },
};
