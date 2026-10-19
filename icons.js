'use strict';
/** Inline SVG icons (line style). Use in templates: <%- icon('home') %>. Unknown names fall back to "modules". */
const PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3.5"/><path d="M12 8V5"/><circle cx="12" cy="3.8" r="1.2"/><circle cx="9" cy="14" r="1.1"/><circle cx="15" cy="14" r="1.1"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.6 3.1 7.7 7.5 9 4.4-1.3 7.5-4.4 7.5-9V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  modules: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><path d="M17 13.5v7M13.5 17h7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.3 2.4 3.5 5.2"/>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
};

function icon(name, size = 18) {
  const body = PATHS[name] || PATHS.modules;
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  );
}

module.exports = { icon };
