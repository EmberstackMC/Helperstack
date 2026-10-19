/* Bot Settings page: identity upload + live embed preview. */
(() => {
  'use strict';

  // ---- Identity form: upload with fetch so the CSRF token travels in a header, then reload to show the result ----
  const form = document.getElementById('identity-form');
  if (form) {
    const status = document.getElementById('identity-status');
    const button = document.getElementById('identity-save');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      button.disabled = true;
      status.textContent = 'Saving...';
      try {
        await window.Ember.api('/bot/identity', { body: new FormData(form) });
        window.location.reload();
      } catch (err) {
        status.textContent = err.message;
        status.style.color = 'var(--danger)';
        button.disabled = false;
      }
    });
  }

  // ---- Live embed preview ----
  const color = document.getElementById('embedColor');
  if (!color) return;
  const embed = document.getElementById('pv-embed');
  const footerText = document.getElementById('footerText');
  const footerIcon = document.getElementById('footerIcon');
  const thumbInput = document.getElementById('thumbnailUrl');
  const pvFooter = document.getElementById('pv-footer');
  const pvFooterText = document.getElementById('pv-footer-text');
  const pvFooterIcon = document.getElementById('pv-footer-icon');
  const pvThumb = document.getElementById('pv-thumb');

  function showImage(img, url) {
    if (url && /^https?:\/\//i.test(url)) {
      img.src = url;
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
  }

  function update() {
    embed.style.borderLeftColor = color.value;
    pvFooterText.textContent = footerText.value;
    showImage(pvFooterIcon, footerIcon.value.trim());
    pvFooter.hidden = !footerText.value && !footerIcon.value.trim();
    showImage(pvThumb, thumbInput.value.trim());
  }

  [color, footerText, footerIcon, thumbInput].forEach((input) => input.addEventListener('input', update));
  document.getElementById('reset-color').addEventListener('click', () => {
    color.value = color.dataset.default.toLowerCase();
    update();
  });
  update();
})();
