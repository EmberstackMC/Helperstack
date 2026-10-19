'use strict';
/** Shared helpers for the Tickets dashboard pages. */
const ASSETS = { styles: ['/static/m/tickets/tickets.css'], scripts: ['/static/m/tickets/tickets.js'] };

/** res.page() with the module's CSS/JS and the active tab filled in. */
const page = (res, view, tab, locals = {}) => res.page(view, { ...ASSETS, tab, ...locals });

const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const likeEscape = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function memberName(ctx, guildId, id) {
  if (!id) return '';
  const guild = ctx.client.guilds.cache.get(guildId);
  return guild?.members.cache.get(id)?.displayName || ctx.client.users.cache.get(id)?.username || String(id);
}

const channelLabel = (ctx, guildId, id) => {
  const channel = ctx.client.guilds.cache.get(guildId)?.channels.cache.get(id);
  return channel ? `#${channel.name}` : '';
};

module.exports = { page, parseId, likeEscape, memberName, channelLabel };
