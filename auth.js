'use strict';
/**
 * Discord OAuth2 login. We only ask for the "identify" scope (name + avatar).
 * The OAuth token is used once to read the profile and is then discarded - never stored.
 * Access is decided by the bot looking at the person's roles in the server (see core/permissions.js).
 */
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const permissions = require('../core/permissions');
const { safeEqual } = require('./csrf');

const DISCORD_API = 'https://discord.com/api/v10';

/** Only allow redirects to paths on this site (prevents open-redirect tricks). */
function safeReturnTo(value) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value;
  return '/';
}

function avatarUrl(profile) {
  if (profile.avatar) return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=64`;
  const index = Number((BigInt(profile.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function discordFetch(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Discord API ${res.status} on ${new URL(url).pathname}: ${await res.text()}`);
  return res;
}

async function exchangeCode(code) {
  const res = await discordFetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  return res.json();
}

async function fetchProfile(accessToken) {
  const res = await discordFetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json();
}

function revokeToken(accessToken) {
  // Best effort - we never need the token again.
  fetch(`${DISCORD_API}/oauth2/token/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token: accessToken }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

/** Public routes: /login (page), /auth/login (start), /auth/callback (finish). */
function createAuthRouter(ctx) {
  const router = express.Router();
  const log = ctx.logger.forModule('auth');

  router.get('/auth/login', (req, res, next) => {
    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = state;
    req.session.returnTo = safeReturnTo(req.query.next);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'identify',
      state,
      prompt: 'none', // skips the consent screen after the first time
    });
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect(`https://discord.com/oauth2/authorize?${params}`);
    });
  });

  router.get('/auth/callback', async (req, res, next) => {
    try {
      const { code, state, error } = req.query;
      const expected = req.session.oauthState;
      delete req.session.oauthState;

      if (error) {
        req.flash('error', 'Discord sign-in was cancelled. You can try again.');
        return res.redirect('/login');
      }
      if (!expected || typeof state !== 'string' || typeof code !== 'string' || !safeEqual(state, expected)) {
        req.flash('error', 'That sign-in link expired or was invalid. Please start again.');
        return res.redirect('/login');
      }

      const token = await exchangeCode(code);
      const profile = await fetchProfile(token.access_token);
      revokeToken(token.access_token);

      const allowed = await permissions.canAccessDashboard(ctx.client, profile.id);
      if (allowed === null) {
        req.flash('error', 'The bot is still connecting to Discord. Wait a few seconds and try again.');
        return res.redirect('/login');
      }
      if (!allowed) {
        log.warn(`Dashboard access denied for ${profile.username} (${profile.id})`);
        return res.status(403).render('denied', { title: 'No access', username: profile.global_name || profile.username, flash: [] });
      }

      const returnTo = safeReturnTo(req.session.returnTo);
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = {
          id: profile.id,
          username: profile.username,
          globalName: profile.global_name || null,
          avatarUrl: avatarUrl(profile),
        };
        req.session.csrf = crypto.randomBytes(32).toString('hex');
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          log.info(`${profile.username} (${profile.id}) signed in`);
          res.redirect(returnTo);
        });
      });
    } catch (err) {
      log.error(`Login failed: ${err.message}`);
      req.flash('error', 'Sign-in failed. If this keeps happening, the server admin should check the Discord redirect URL and client secret in .env.');
      res.redirect('/login');
    }
  });

  return router;
}

/** Gate for everything behind the login. Re-checks the person's roles (cached 60s) on every request. */
function requireAccess(ctx) {
  return async (req, res, next) => {
    const sessionUser = req.session?.user;
    const wantsJson = req.get('accept')?.includes('application/json') && !req.get('accept').includes('text/html');

    if (!sessionUser) {
      if (req.method === 'GET' && !wantsJson) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      return res.status(401).json({ error: 'You are not signed in.' });
    }

    const allowed = await permissions.canAccessDashboard(ctx.client, sessionUser.id);
    if (allowed === null) {
      const err = new Error('The bot is still connecting to Discord. Try again in a few seconds.');
      err.status = 503;
      err.expose = true;
      return next(err);
    }
    if (!allowed) {
      return req.session.destroy(() => res.status(403).render('denied', { title: 'No access', username: sessionUser.globalName || sessionUser.username, flash: [] }));
    }

    req.user = sessionUser;
    req.guildId = config.guildId;
    res.locals.user = sessionUser;
    next();
  };
}

module.exports = { createAuthRouter, requireAccess, safeReturnTo };
