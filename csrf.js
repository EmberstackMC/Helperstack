'use strict';
/**
 * CSRF protection for the signed-in area.
 *  - Every signed-in session gets a random token.
 *  - Every non-GET request must send it back: as a hidden form field named "_csrf",
 *    the "X-CSRF-Token" header (the fetch helper in app.js does this for you),
 *    or a "?_csrf=" query parameter (needed for file-upload forms, where the body is not parsed yet).
 */
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrfProtection(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrf;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = req.get('x-csrf-token') || req.body?._csrf || req.query?._csrf;
  if (!sent || !safeEqual(sent, req.session.csrf)) {
    const err = new Error('Your session token was missing or expired. Reload the page and try again.');
    err.status = 403;
    err.expose = true;
    return next(err);
  }
  next();
}

module.exports = { csrfProtection, safeEqual };
