/* Tickets pages: form-question builder and live previews for panels and welcome messages. */
(() => {
  'use strict';
  const el = window.Ember.el;
  const sync = (input, fn) => input && input.addEventListener('input', fn);

  function showImage(img, url) {
    if (url && /^https?:\/\//i.test(url)) { img.src = url; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
  }

  // ---------- Question builder (ticket type editor) ----------
  const builder = document.getElementById('question-builder');
  if (builder) {
    const MAX = 5;
    const hidden = document.getElementById('questions-json');
    let questions = [];
    try { questions = JSON.parse(builder.dataset.initial || '[]'); } catch { questions = []; }

    const list = el('div');
    const add = el('button', 'btn btn-ghost', 'Add a question');
    add.type = 'button';
    const note = el('span', 'hint');
    const footer = el('div', 'row');
    footer.append(add, note);
    builder.append(list, footer);

    const save = () => {
      hidden.value = JSON.stringify(questions);
      add.disabled = questions.length >= MAX;
      note.textContent = `${questions.length} of ${MAX} questions`;
      if (window.__updateWelcomePreview) window.__updateWelcomePreview();
    };
    const button = (text, onClick, extra = '') => {
      const b = el('button', `btn btn-ghost mini ${extra}`.trim(), text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };

    function render() {
      list.replaceChildren();
      questions.forEach((q, i) => {
        const label = el('input', 'input');
        label.maxLength = 45; label.value = q.label || ''; label.placeholder = 'Question, e.g. What is your in-game name?';
        label.setAttribute('aria-label', `Question ${i + 1}`);
        label.addEventListener('input', () => { q.label = label.value; save(); });

        const style = el('select', 'select');
        style.append(new Option('Short answer', 'short'), new Option('Long answer', 'long'));
        style.value = q.style === 'long' ? 'long' : 'short';
        style.addEventListener('change', () => { q.style = style.value; save(); });

        const placeholder = el('input', 'input grow');
        placeholder.maxLength = 100; placeholder.value = q.placeholder || ''; placeholder.placeholder = 'Placeholder text (optional)';
        placeholder.addEventListener('input', () => { q.placeholder = placeholder.value; save(); });

        const required = el('input'); required.type = 'checkbox'; required.checked = q.required !== false;
        required.addEventListener('change', () => { q.required = required.checked; save(); });
        const requiredLabel = el('label', 'hint'); requiredLabel.append(required, ' Required');

        const top = el('div', 'qrow-top'); top.append(label, style);
        const bottom = el('div', 'qrow-bottom');
        bottom.append(placeholder, requiredLabel,
          button('Up', () => { if (i > 0) { [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]]; render(); } }),
          button('Down', () => { if (i < questions.length - 1) { [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]]; render(); } }),
          button('Remove', () => { questions.splice(i, 1); render(); }, 'btn-danger'));
        const row = el('div', 'qrow'); row.append(top, bottom);
        list.append(row);
      });
      save();
    }
    add.addEventListener('click', () => { if (questions.length < MAX) { questions.push({ label: '', style: 'short', required: true, placeholder: '' }); render(); } });
    document.getElementById('type-form').addEventListener('submit', save);
    render();
  }

  // ---------- Welcome message preview (ticket type editor) ----------
  const welcomeTitle = document.getElementById('welcomeTitle');
  if (welcomeTitle) {
    const desc = document.getElementById('welcomeDescription');
    const color = document.getElementById('welcomeColor');
    const useDefault = document.getElementById('welcomeColorDefault');
    const defaultColor = color.value;
    const reasonToggle = document.querySelector('input[name="closeWithReason"]');
    const vars = { user: '@Ember Fan', username: 'Ember Fan', 'ticket-type': (document.getElementById('name').value || 'Support'), 'ticket-number': '0042', 'staff-role': '@Support', server: 'Emberstack' };
    const fill = (text) => text.replace(/\{([a-z-]+)\}/gi, (m, k) => (k.toLowerCase() in vars ? vars[k.toLowerCase()] : m));

    window.__updateWelcomePreview = () => {
      vars['ticket-type'] = document.getElementById('name').value || 'Support';
      document.getElementById('wv-title').textContent = fill(welcomeTitle.value);
      document.getElementById('wv-desc').textContent = fill(desc.value);
      document.getElementById('wv-embed').style.borderLeftColor = useDefault.checked ? defaultColor : color.value;
      document.getElementById('wv-reason-btn').hidden = reasonToggle && !reasonToggle.checked;
      const fields = document.getElementById('wv-fields');
      fields.replaceChildren();
      try {
        JSON.parse(document.getElementById('questions-json').value || '[]').filter((q) => q.label).forEach((q) => {
          const wrap = el('div'); wrap.style.marginTop = '6px';
          wrap.append(el('strong', '', q.label), el('div', '', 'Their answer appears here'));
          fields.append(wrap);
        });
      } catch { /* ignore */ }
    };
    [welcomeTitle, desc, color, useDefault, document.getElementById('name'), reasonToggle].forEach((n) => n && n.addEventListener('input', window.__updateWelcomePreview));
    color.addEventListener('input', () => { useDefault.checked = false; window.__updateWelcomePreview(); });
    window.__updateWelcomePreview();
  }

  // ---------- Panel preview (panel editor) ----------
  const panelForm = document.getElementById('panel-form');
  if (panelForm) {
    const types = JSON.parse(document.getElementById('types-data').textContent);
    const $ = (id) => document.getElementById(id);
    const styleSel = $('p-style');
    const color = $('p-color');
    const useDefault = $('p-color-default');
    const defaultColor = color.value;

    function update() {
      $('pv-title').textContent = $('p-title').value || $('name').value;
      $('pv-desc').textContent = $('p-description').value;
      $('pv-embed').style.borderLeftColor = useDefault.checked ? defaultColor : color.value;
      showImage($('pv-image'), $('p-image').value.trim());
      showImage($('pv-thumb'), $('p-thumb').value.trim());
      $('pv-footer').textContent = $('p-footer').value;
      $('pv-footer').hidden = !$('p-footer').value;
      $('placeholder-field').hidden = styleSel.value !== 'select';

      const chosen = [...panelForm.querySelectorAll('input[name="typeIds"]:checked')].map((c) => types.find((t) => String(t.id) === c.value)).filter(Boolean);
      const box = $('pv-buttons');
      box.replaceChildren();
      if (styleSel.value === 'select') {
        box.append(el('div', 'dc-select', $('p-placeholder').value || 'Choose a ticket type'));
      } else {
        chosen.forEach((t) => box.append(el('span', `dc-btn ${t.buttonStyle || 'primary'}`, `${t.emoji ? `${t.emoji} ` : ''}${t.buttonLabel || t.name}`)));
      }
      if (!chosen.length) box.append(el('span', 'hint', 'Tick at least one ticket type to see the buttons.'));
    }
    panelForm.addEventListener('input', update);
    panelForm.addEventListener('change', update);
    color.addEventListener('input', () => { useDefault.checked = false; update(); });
    update();
  }
})();
