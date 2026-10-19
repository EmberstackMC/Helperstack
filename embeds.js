'use strict';
/**
 * Helpers for building embeds that follow the global look set on the "Bot Settings" page.
 * Always start from baseEmbed() so every embed gets the right color and footer automatically.
 */
const { EmbedBuilder } = require('discord.js');
const settings = require('./settings');

const DEFAULT_COLOR = '#F27A38';

function isHexColor(value) {
  return /^#?[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function hexToInt(value, fallback = DEFAULT_COLOR) {
  const hex = isHexColor(value) ? String(value).trim() : fallback;
  return parseInt(hex.replace('#', ''), 16);
}

function getEmbedDefaults(guildId) {
  return {
    color: settings.get(guildId, 'bot.embedColor', DEFAULT_COLOR),
    footerText: settings.get(guildId, 'bot.footerText', ''),
    footerIcon: settings.get(guildId, 'bot.footerIcon', ''),
    thumbnailUrl: settings.get(guildId, 'bot.thumbnailUrl', ''),
  };
}

function baseEmbed(guildId, { thumbnail = false } = {}) {
  const d = getEmbedDefaults(guildId);
  const embed = new EmbedBuilder().setColor(hexToInt(d.color));
  if (d.footerText) embed.setFooter({ text: d.footerText, iconURL: d.footerIcon || undefined });
  if (thumbnail && d.thumbnailUrl) embed.setThumbnail(d.thumbnailUrl);
  return embed;
}

module.exports = { DEFAULT_COLOR, isHexColor, hexToInt, getEmbedDefaults, baseEmbed };
