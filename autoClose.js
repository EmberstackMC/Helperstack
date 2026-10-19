'use strict';
/** Closes tickets after X hours without any human message, with a warning first. Runs every 10 minutes. */
const ctx = require('../../../src/core/context');
const settingsSvc = require('./settings');
const ticketSvc = require('./tickets');
const { baseEmbed } = require('../../../src/core/embeds');

const { db } = ctx;
const log = ctx.logger.forModule('tickets');
const HOUR = 60 * 60 * 1000;
let timer = null;

function humanize(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
}

async function tick() {
  if (!ctx.client?.isReady()) return;
  const now = Date.now();

  for (const guildId of ctx.config.allowedGuildIds) {
    const s = settingsSvc.get(guildId);
    if (!s.autoCloseHours || s.autoCloseHours <= 0) continue;
    const guild = ctx.client.guilds.cache.get(guildId);
    if (!guild) continue;

    const limit = s.autoCloseHours * HOUR;
    const warnAt = Math.max(limit - s.autoCloseWarnHours * HOUR, limit / 2);

    for (const ticket of db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open'").all(guildId)) {
      const idle = now - ticket.last_activity_at;
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel) {
        db.prepare("UPDATE tickets SET status='deleted', closed_at=? WHERE id=?").run(now, ticket.id);
        continue;
      }
      try {
        if (idle >= limit) {
          await ticketSvc.closeTicket({ guild, ticket, closedBy: ctx.client.user.id, reason: `Closed automatically after ${s.autoCloseHours} hour${s.autoCloseHours === 1 ? '' : 's'} without a reply.` });
        } else if (idle >= warnAt && !ticket.warned_at) {
          db.prepare('UPDATE tickets SET warned_at = ? WHERE id = ?').run(now, ticket.id);
          await channel.send({
            content: `<@${ticket.user_id}>`,
            embeds: [baseEmbed(guildId).setTitle('This ticket will close soon').setDescription(`Nobody has written here for a while. It will close automatically in about **${humanize(limit - idle)}** unless someone replies.`)],
            allowedMentions: { users: [ticket.user_id] },
          });
        }
      } catch (err) {
        log.error(`Auto-close failed for ticket #${ticket.number}: ${err.stack || err.message}`);
      }
    }
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => tick().catch((err) => log.error(`Auto-close run failed: ${err.stack || err}`)), 10 * 60 * 1000);
  timer.unref();
  setTimeout(() => tick().catch((err) => log.error(`Auto-close run failed: ${err.stack || err}`)), 60 * 1000).unref();
}

module.exports = { start, tick };
