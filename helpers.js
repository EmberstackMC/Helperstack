'use strict';
/** Small helpers available to every dashboard page (exposed as res.locals in server.js). */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Form fields can arrive as undefined, a string, or an array. Always get an array of strings. */
function asArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' && v !== '');
}

/**
 * Renders a role / channel / category picker. The browser fills it in from the live server data
 * (see public/js/app.js). Use inside a <form>; it submits repeated fields named `name`.
 *   <%- picker({ kind: 'role', name: 'staff', multi: true, selected: ids }) %>
 *   kind: 'role' | 'channel' | 'category'
 */
function picker({ kind = 'role', name, multi = false, selected = [], placeholder = '' }) {
  const list = asArray(selected);
  const value = multi ? list : list.slice(0, 1);
  return (
    `<div class="picker" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(name)}" ` +
    `data-multi="${multi ? 'true' : 'false'}" data-placeholder="${escapeHtml(placeholder)}" ` +
    `data-selected="${escapeHtml(JSON.stringify(value))}"></div>`
  );
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${total}s`;
}

const formatNumber = (n) => new Intl.NumberFormat('en-US').format(n ?? 0);

module.exports = { escapeHtml, asArray, picker, formatDuration, formatNumber };
