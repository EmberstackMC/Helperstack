'use strict';
/**
 * The web dashboard (Express). Modules add their own pages through the module loader.
 *
 * Request order matters here:
 *   1. health check + static files (no session needed)
 *   2. security headers, rate limits, body parsing, session
 *   3. public routes: /login and the Discord OAuth callback
 *   4. everything else requires login + permission, then CSRF protection
 *   5. module routes, 404, error handler
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { SqliteSessionStore } = require('./sessionStore');
const { csrfProtection } = require('./csrf');
const { createAuthRouter, requireAccess, safeReturnTo } = require('./auth');
const { icon } = require('./icons');
const helpers = require('./helpers');
const { getGuild, getGuildData, guildSummary } = require('./guildData');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function createDashboard(ctx) {
  const log = ctx.logger.forModule('dashboard');
  const app = express();
  const activeModules = ctx.modules.filter((m) => m.status === 'active');

  if (config.secureCookies && !config.trustProxy) {
    log.warn('BASE_URL is https but TRUST_PROXY is 0. Behind Caddy/Nginx set TRUST_PROXY=1, otherwise login cookies will not stick.');
  }

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', [path.join(__dirname, 'views'), ...activeModules.filter((m) => m.viewsDir).map((m) => m.viewsDir)]);

  // ---- 1. Health check and static files -------------------------------------------------------
  app.get('/healthz', (req, res) => {
    res.json({ ok: true, discordReady: Boolean(ctx.client?.isReady()), uptimeSeconds: Math.round(process.uptime()) });
  });
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/favicon.svg'));

  const staticOptions = { maxAge: config.isProd ? '1h' : 0, index: false };
  app.use('/static', express.static(path.join(__dirname, 'public'), staticOptions));
  for (const mod of activeModules.filter((m) => m.publicDir)) {
    app.use(`/static/m/${mod.name}`, express.static(mod.publicDir, staticOptions));
  }

  // ---- 2. Security, limits, parsing, session ---------------------------------------------------
  app.use(
    helmet({
      hsts: config.secureCookies,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'https:'], // https: lets embed previews show your own image URLs
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'self'"], // 'self' lets the dashboard show transcripts in an iframe
          'form-action': ["'self'"],
          // Browsers on plain http://localhost would break with this on, so only enable it for https.
          'upgrade-insecure-requests': config.secureCookies ? [] : null,
        },
      },
    })
  );

  const limiterBase = { standardHeaders: true, legacyHeaders: false };
  app.use(rateLimit({ ...limiterBase, windowMs: 15 * 60 * 1000, limit: 1500 }));
  app.use('/auth', rateLimit({ ...limiterBase, windowMs: 15 * 60 * 1000, limit: 40, message: 'Too many sign-in attempts. Wait a few minutes and try again.' }));
  const writeLimiter = rateLimit({
    ...limiterBase,
    windowMs: 5 * 60 * 1000,
    limit: 200,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD',
    message: 'Too many changes in a short time. Wait a moment and try again.',
  });

  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    session({
      name: 'ember.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new SqliteSessionStore(ctx.db, { ttlMs: WEEK_MS }),
      cookie: {
        httpOnly: true, // JavaScript cannot read the cookie
        secure: config.secureCookies, // only sent over HTTPS in production
        sameSite: 'lax', // blocks cross-site POSTs; "lax" (not "strict") is required so the Discord login redirect works
        maxAge: WEEK_MS,
      },
    })
  );

  // ---- Template helpers ------------------------------------------------------------------------
  const assetVersion = Date.now();
  const navSections = buildNav(activeModules);

  app.use((req, res, next) => {
    Object.assign(res.locals, {
      icon,
      picker: helpers.picker,
      escapeHtml: helpers.escapeHtml,
      formatDuration: helpers.formatDuration,
      formatNumber: helpers.formatNumber,
      assetVersion,
      navSections,
      user: req.session?.user || null,
      csrfToken: '',
      baseUrl: config.baseUrl,
    });

    req.flash = (type, msg) => {
      req.session.flash = req.session.flash || [];
      req.session.flash.push({ type, msg });
    };
    const takeFlash = () => {
      const messages = req.session?.flash || [];
      if (req.session) delete req.session.flash;
      return messages;
    };

    // res.page('core/overview', { title: 'Overview', ...data }) renders a module page inside the dashboard layout.
    res.page = (view, locals = {}) => {
      const guild = getGuild(ctx, req.guildId);
      const data = { ...res.locals, ...locals };
      app.render(view, data, (err, body) => {
        if (err) return next(err);
        res.render('_layout', {
          ...locals,
          title: locals.title || 'Dashboard',
          styles: locals.styles || [],
          scripts: locals.scripts || [],
          body,
          flash: takeFlash(),
          guild: guildSummary(guild),
          activePath: req.originalUrl.split('?')[0],
          emberData: JSON.stringify(getGuildData(guild)).replace(/</g, '\\u003c'),
        });
      });
    };
    res.locals.takeFlash = takeFlash;
    next();
  });

  // ---- 3. Public routes ------------------------------------------------------------------------
  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect(safeReturnTo(req.query.next));
    const flash = res.locals.takeFlash();
    res.render('login', { title: 'Sign in', flash, next: safeReturnTo(req.query.next) });
  });
  app.use(createAuthRouter(ctx));

  // ---- 4. Everything below needs a signed-in, permitted person ----------------------------------
  app.use(requireAccess(ctx));
  app.use(writeLimiter);
  app.use(csrfProtection);

  app.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  // ---- 5. Module routes ------------------------------------------------------------------------
  for (const mod of activeModules.filter((m) => m.routesFile)) {
    try {
      const router = express.Router();
      require(mod.routesFile)(router, ctx);
      app.use(mod.mount, router);
    } catch (err) {
      mod.status = 'failed';
      mod.error = `Dashboard routes failed: ${err.message}`;
      log.error(`Module "${mod.name}" dashboard routes failed to load: ${err.stack || err}`);
    }
  }

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Page not found', status: 404, message: 'That page does not exist.', flash: [] });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    const message = status < 500 || err.expose ? err.message : 'Something went wrong on our side. Check the logs for details.';
    if (status >= 500) log.error(`${req.method} ${req.originalUrl} failed: ${err.stack || err}`);

    const wantsJson = req.get('accept')?.includes('application/json') && !req.get('accept').includes('text/html');
    if (wantsJson || req.is('application/json')) return res.status(status).json({ error: message });
    res.status(status).render('error', { title: 'Something went wrong', status, message, flash: [] });
  });

  return app;
}

/** Collects sidebar links from every module manifest, sorted, grouped into sections. */
function buildNav(modules) {
  const items = [];
  for (const mod of modules) {
    for (const link of mod.nav) {
      items.push({
        label: link.label,
        path: link.path || mod.mount,
        icon: link.icon || mod.icon,
        order: Number.isFinite(link.order) ? link.order : 100,
        section: link.section || 'Manage',
      });
    }
  }
  items.sort((a, b) => a.order - b.order);

  const sections = [];
  for (const item of items) {
    let section = sections.find((s) => s.name === item.section);
    if (!section) {
      section = { name: item.section, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

module.exports = { createDashboard };
