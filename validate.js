'use strict';
/**
 * Form validation helpers. Each one returns a clean value or throws a FormError with a plain-language
 * message. Wrap a route with formRoute() and any FormError becomes a red message on the page you came from.
 */
class FormError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormError';
  }
}

function text(value, { label = 'This field', min = 0, max = 255, required = false } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v && required) throw new FormError(`${label} is required.`);
  if (v && v.length < min) throw new FormError(`${label} must be at least ${min} characters.`);
  if (v.length > max) throw new FormError(`${label} must be ${max} characters or fewer (it is ${v.length}).`);
  return v;
}

function int(value, { label = 'This number', min = 0, max = 1000000, fallback = 0 } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new FormError(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

const bool = (value) => value === 'on' || value === 'true' || value === '1' || value === true;

function hex(value, { label = 'Color', fallback = '' } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return fallback;
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new FormError(`${label} must look like #F27A38.`);
  return v.toUpperCase();
}

function url(value, { label = 'Link', max = 500 } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  if (v.length > max) throw new FormError(`${label} is too long.`);
  try {
    const u = new URL(v);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocol');
  } catch {
    throw new FormError(`${label} must be a full link starting with https://`);
  }
  return v;
}

function oneOf(value, list, { label = 'Choice', fallback } = {}) {
  if (list.includes(value)) return value;
  if (fallback !== undefined && (value === undefined || value === '')) return fallback;
  throw new FormError(`${label} is not a valid option.`);
}

/** Wraps a route: FormError -> flash message + redirect to `back` (string or (req) => string). */
const formRoute = (back, handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    if (err instanceof FormError) {
      req.flash('error', err.message);
      return res.redirect(typeof back === 'function' ? back(req) : back);
    }
    next(err);
  }
};

module.exports = { FormError, text, int, bool, hex, url, oneOf, formRoute };
