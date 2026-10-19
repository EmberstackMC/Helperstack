/* Emberstack dashboard - shared browser code. No frameworks, no inline scripts (the security policy forbids them). */
(() => {
  'use strict';

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const dataEl = document.getElementById('ember-data');
  let guildData = { roles: [], channels: [] };
  try {
    if (dataEl) guildData = JSON.parse(dataEl.textContent);
  } catch (err) {
    console.error('Could not read server data', err);
  }

  /** Tiny DOM builder. Always uses textContent, so names from Discord can never inject HTML. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** fetch() wrapper that adds the CSRF token and parses JSON. Usage: await Ember.api('/tickets/x', { body: {...} }) */
  async function api(url, { method = 'POST', body, headers = {} } = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-CSRF-Token': csrf,
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body && !isForm ? JSON.stringify(body) : body,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---- Sidebar (mobile) ----
  document.querySelectorAll('[data-sidebar-toggle]').forEach((node) =>
    node.addEventListener('click', () => document.body.classList.toggle('nav-open'))
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.body.classList.remove('nav-open');
  });

  // ---- Flash messages ----
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dismiss]');
    if (btn) btn.parentElement.remove();
  });

  // ---- "Are you sure?" on forms/buttons with data-confirm="..." ----
  document.addEventListener('submit', (e) => {
    const message = e.submitter?.dataset.confirm || e.target.dataset?.confirm;
    if (message && !window.confirm(message)) e.preventDefault();
  });

  // ---- Role / channel / category pickers ----
  function sourceFor(kind) {
    if (kind === 'role') return guildData.roles;
    if (kind === 'category') return guildData.channels.filter((c) => c.kind === 'category');
    return guildData.channels.filter((c) => c.kind === 'text');
  }

  function buildSelect(kind, items, placeholder, name) {
    const select = el('select', 'select');
    if (name) select.name = name;
    select.appendChild(new Option(placeholder, ''));

    if (kind === 'channel') {
      // Group text channels under their category.
      const groups = new Map();
      items.forEach((c) => {
        const key = c.parentName || 'No category';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      });
      groups.forEach((list, label) => {
        const group = document.createElement('optgroup');
        group.label = label;
        list.forEach((c) => group.appendChild(new Option(`# ${c.name}`, c.id)));
        select.appendChild(group);
      });
    } else {
      items.forEach((item) => select.appendChild(new Option(item.name + (item.managed ? ' (bot role)' : ''), item.id)));
    }
    return select;
  }

  function initPicker(root) {
    const kind = root.dataset.kind;
    const name = root.dataset.name;
    const multi = root.dataset.multi === 'true';
    const placeholder = root.dataset.placeholder || (kind === 'role' ? 'Add a role' : kind === 'category' ? 'Choose a category' : 'Choose a channel');
    const source = sourceFor(kind);
    const byId = new Map(source.map((item) => [item.id, item]));

    let selected = [];
    try {
      selected = JSON.parse(root.dataset.selected || '[]');
    } catch {
      selected = [];
    }
    if (!Array.isArray(selected)) selected = [];

    function render() {
      root.replaceChildren();

      if (!multi) {
        // Single choice: a normal dropdown with a "None" option.
        const select = buildSelect(kind, source, 'None', name);
        select.value = selected[0] && byId.has(selected[0]) ? selected[0] : '';
        root.appendChild(select);
        return;
      }

      const chips = el('div', 'chips');
      if (selected.length === 0) chips.appendChild(el('span', 'picker-empty', 'Nothing selected yet'));
      selected.forEach((id) => {
        const item = byId.get(id);
        const chip = el('span', item ? 'chip' : 'chip chip-missing');
        if (kind === 'role') {
          const dot = el('span', 'chip-dot');
          dot.style.background = (item && item.color) || '#99AAB5';
          chip.appendChild(dot);
        } else {
          chip.appendChild(el('span', 'chip-glyph', kind === 'category' ? '\u25A4' : '#'));
        }
        const label = item ? item.name : `Deleted ${kind}`;
        chip.appendChild(el('span', '', label));

        const remove = el('button', 'chip-x', '\u00D7');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${label}`);
        remove.addEventListener('click', () => {
          selected = selected.filter((s) => s !== id);
          render();
        });
        chip.appendChild(remove);

        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        hidden.value = id;
        chip.appendChild(hidden);
        chips.appendChild(chip);
      });
      root.appendChild(chips);

      const remaining = source.filter((item) => !selected.includes(item.id));
      if (remaining.length) {
        const select = buildSelect(kind, remaining, placeholder);
        select.setAttribute('aria-label', placeholder);
        select.addEventListener('change', () => {
          if (select.value) {
            selected.push(select.value);
            render();
            root.querySelector('select')?.focus();
          }
        });
        root.appendChild(select);
      }
    }

    render();
  }

  function initPickers(scope = document) {
    scope.querySelectorAll('.picker').forEach(initPicker);
  }

  window.Ember = { api, csrf, guildData, el, initPickers };
  initPickers();
})();
