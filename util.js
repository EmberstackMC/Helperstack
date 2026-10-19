'use strict';
/** Small helpers shared across the ticket module. */

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/** Replaces {name} placeholders. Unknown placeholders are left untouched so typos are visible. */
function renderVars(template, vars) {
  return String(template ?? '').replace(/\{([a-z-]+)\}/gi, (match, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : match;
  });
}

/** Makes text safe for a Discord channel name: lowercase letters, numbers, dashes, underscores. */
function slug(text, max = 100) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, max);
}

function channelNameFrom(pattern, vars) {
  return slug(renderVars(pattern, vars)) || `ticket-${vars.number}`;
}

const truncate = (text, max) => {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
};

const padNumber = (n) => String(n).padStart(4, '0');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Converts "😀" or "<:name:123>" into the object Discord expects for buttons and menu options. */
function parseEmoji(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const custom = /^<(a?):(\w{2,32}):(\d{17,20})>$/.exec(text);
  if (custom) return { animated: custom[1] === 'a', name: custom[2], id: custom[3] };
  return { name: text };
}

const PRIORITIES = {
  low: { label: 'Low', emoji: '\uD83D\uDFE2' },
  normal: { label: 'Normal', emoji: '\uD83D\uDFE1' },
  high: { label: 'High', emoji: '\uD83D\uDFE0' },
  urgent: { label: 'Urgent', emoji: '\uD83D\uDD34' },
};

module.exports = { parseJson, renderVars, slug, channelNameFrom, truncate, padNumber, sleep, parseEmoji, PRIORITIES };
