'use strict';
/**
 * The module loader. Every folder inside /modules is a feature module.
 * Nothing needs to be registered by hand - drop a folder in and restart.
 *
 * modules/<name>/
 *   module.json              label, description, dashboard mount path and sidebar links
 *   index.js                 (optional) exports init(ctx), runs once at startup
 *   commands/*.js            slash commands:     { data, execute(ctx, interaction), autocomplete?(ctx, interaction) }
 *   events/*.js              Discord events:     { name, once?, execute(ctx, ...eventArgs) }   (or an array of them)
 *   interactions/*.js        buttons/menus/modals: { id, execute(ctx, interaction) }   (or an array; matches customId "id" or "id:anything")
 *   database/migrations/*.sql
 *   dashboard/routes.js      module.exports = (router, ctx) => { ... }
 *   dashboard/views/<name>/*.ejs
 *   dashboard/public/*       static files, served at /static/m/<name>/
 *   dashboard/widgets.js     (optional) async (ctx, guildId) => [{ label, value, hint }] shown on the Overview page
 *
 * A broken module is logged and skipped - it never stops the other modules from loading.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const rootLogger = require('./logger');
const { runMigrations } = require('./database');

const MODULES_DIR = path.join(config.rootDir, 'modules');

function titleCase(text) {
  return text.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(dir, f));
}

function normalizeMount(mount, name) {
  const value = mount === undefined || mount === null ? `/${name}` : String(mount);
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/** Reads one module folder and returns everything it provides (nothing is registered yet). */
function readModule(name) {
  const dir = path.join(MODULES_DIR, name);
  const manifestPath = path.join(dir, 'module.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  const mod = {
    name,
    dir,
    label: manifest.label || titleCase(name),
    description: manifest.description || '',
    icon: manifest.icon || 'modules',
    order: Number.isFinite(manifest.order) ? manifest.order : 100,
    enabled: manifest.enabled !== false,
    mount: normalizeMount(manifest.mount, name),
    nav: Array.isArray(manifest.nav) ? manifest.nav : [],
    status: 'active',
    error: null,
    commands: [],
    events: [],
    interactions: [],
    routesFile: null,
    viewsDir: null,
    publicDir: null,
    widgetsFile: null,
    initFile: null,
  };

  const routes = path.join(dir, 'dashboard', 'routes.js');
  const views = path.join(dir, 'dashboard', 'views');
  const pub = path.join(dir, 'dashboard', 'public');
  const widgets = path.join(dir, 'dashboard', 'widgets.js');
  const init = path.join(dir, 'index.js');
  if (fs.existsSync(routes)) mod.routesFile = routes;
  if (fs.existsSync(views)) mod.viewsDir = views;
  if (fs.existsSync(pub)) mod.publicDir = pub;
  if (fs.existsSync(widgets)) mod.widgetsFile = widgets;
  if (fs.existsSync(init)) mod.initFile = init;
  return mod;
}

function loadModules(ctx) {
  const { client } = ctx;
  const modules = [];

  if (!fs.existsSync(MODULES_DIR)) {
    rootLogger.error(`Modules folder not found: ${MODULES_DIR}`);
    return modules;
  }

  const names = fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name);

  const seenCommands = new Set();

  for (const name of names) {
    const log = rootLogger.forModule(name);
    let mod;
    try {
      mod = readModule(name);
    } catch (err) {
      log.error(`Could not read module.json: ${err.message}`);
      modules.push({ name, label: titleCase(name), description: '', order: 999, status: 'failed', error: err.message, nav: [] });
      continue;
    }
    if (!mod.enabled) {
      log.info('Module is disabled in module.json - skipping');
      continue;
    }

    try {
      runMigrations(name, path.join(mod.dir, 'database', 'migrations'));

      for (const file of listJsFiles(path.join(mod.dir, 'commands'))) {
        const cmd = require(file);
        if (!cmd.data || typeof cmd.execute !== 'function') throw new Error(`Command file ${path.basename(file)} needs "data" and "execute"`);
        const cmdName = cmd.data.name;
        if (seenCommands.has(cmdName)) throw new Error(`Command /${cmdName} is already defined by another module`);
        seenCommands.add(cmdName);
        mod.commands.push(cmd);
      }

      for (const file of listJsFiles(path.join(mod.dir, 'events'))) {
        for (const ev of [].concat(require(file))) {
          if (!ev.name || typeof ev.execute !== 'function') throw new Error(`Event file ${path.basename(file)} needs "name" and "execute"`);
          mod.events.push(ev);
        }
      }

      for (const file of listJsFiles(path.join(mod.dir, 'interactions'))) {
        // A file may export one handler or an array of handlers.
        for (const handler of [].concat(require(file))) {
          if (!handler.id || typeof handler.execute !== 'function') throw new Error(`Interaction file ${path.basename(file)} needs "id" and "execute"`);
          mod.interactions.push(handler);
        }
      }

      if (mod.initFile) {
        const entry = require(mod.initFile);
        if (typeof entry.init === 'function') entry.init(ctx);
      }
    } catch (err) {
      log.error(`Module failed to load and was skipped: ${err.stack || err.message}`);
      mod.status = 'failed';
      mod.error = err.message;
      modules.push(mod);
      continue;
    }

    // Everything loaded fine - now attach it to the Discord client.
    for (const cmd of mod.commands) client.commands.set(cmd.data.name, cmd);
    for (const handler of mod.interactions) client.interactionHandlers.push(handler);
    for (const ev of mod.events) {
      const run = async (...args) => {
        try {
          await ev.execute(ctx, ...args);
        } catch (err) {
          log.error(`Event "${ev.name}" handler failed: ${err.stack || err.message}`);
        }
      };
      if (ev.once) client.once(ev.name, run);
      else client.on(ev.name, run);
    }

    log.info(`Loaded: ${mod.commands.length} commands, ${mod.events.length} events, ${mod.interactions.length} interaction handlers`);
    modules.push(mod);
  }

  // Longest ids first so "tickets:close:reason" wins over "tickets:close".
  client.interactionHandlers.sort((a, b) => b.id.length - a.id.length);
  modules.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return modules;
}

module.exports = { loadModules };
