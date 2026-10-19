'use strict';
/** Live server data (roles, channels) read from the bot's cache and handed to the browser for the pickers. */
const { ChannelType } = require('discord.js');

const KIND = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildAnnouncement]: 'text',
  [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildStageVoice]: 'voice',
  [ChannelType.GuildForum]: 'forum',
};

function getGuild(ctx, guildId) {
  return ctx.client?.guilds.cache.get(guildId) || null;
}

function getGuildData(guild) {
  if (!guild) return { roles: [], channels: [] };

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id) // hide @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ? r.hexColor : null,
      managed: r.managed,
    }));

  const channels = [...guild.channels.cache.values()]
    .filter((c) => KIND[c.type])
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: KIND[c.type],
      parentId: c.parentId || null,
      parentName: c.parent?.name || null,
    }));

  return { roles, channels };
}

function guildSummary(guild) {
  if (!guild) return null;
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ size: 64, extension: 'png' }),
    memberCount: guild.memberCount,
  };
}

module.exports = { getGuild, getGuildData, guildSummary };
