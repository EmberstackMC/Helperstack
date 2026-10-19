'use strict';
/** Builds and applies the bot's online status and activity. Presence belongs to the bot, so it uses the main GUILD_ID's settings. */
const { ActivityType } = require('discord.js');

const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

function getPresenceSettings(settings, guildId) {
  return {
    status: settings.get(guildId, 'bot.status', 'online'),
    activityType: settings.get(guildId, 'bot.activityType', 'none'),
    activityText: settings.get(guildId, 'bot.activityText', ''),
  };
}

function buildPresence({ status, activityType, activityText }) {
  const activities = [];
  if (activityType !== 'none' && activityText && ACTIVITY_TYPES[activityType] !== undefined) {
    activities.push(
      activityType === 'custom'
        ? { name: 'Custom Status', type: ActivityType.Custom, state: activityText }
        : { name: activityText, type: ACTIVITY_TYPES[activityType] }
    );
  }
  return { status: STATUSES.includes(status) ? status : 'online', activities };
}

/** Applies the saved presence now, and remembers it so it survives Discord reconnects. */
function applyPresence(ctx, guildId = ctx.config.guildId) {
  const presence = buildPresence(getPresenceSettings(ctx.settings, guildId));
  ctx.client.options.presence = presence;
  if (ctx.client.isReady()) ctx.client.user.setPresence(presence);
  return presence;
}

module.exports = { STATUSES, ACTIVITY_TYPES, getPresenceSettings, buildPresence, applyPresence };
