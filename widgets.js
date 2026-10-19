'use strict';
// Tiles for the Overview page.
const { formatDuration } = require('../../../src/dashboard/helpers');

module.exports = async (ctx, guildId) => {
  const { db } = ctx;
  const open = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND status = 'open'").get(guildId).n;
  const week = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND created_at >= ?').get(guildId, Date.now() - 7 * 86400000).n;
  const avg = db.prepare('SELECT AVG(first_response_at - created_at) AS a FROM tickets WHERE guild_id = ? AND first_response_at IS NOT NULL').get(guildId).a;
  return [
    { label: 'Open tickets', value: open },
    { label: 'Tickets this week', value: week },
    { label: 'Average first response', value: avg ? formatDuration(avg) : 'No data yet' },
  ];
};
