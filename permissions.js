'use strict';
/**
 * Who is allowed to do what. The role lists are edited on the dashboard "Roles & Permissions" page.
 *
 *   admin      Dashboard access + every ticket type + blacklist/settings
 *   staff      Can see and manage tickets
 *   specialist Optional roles you attach to individual ticket types (Developer, Tester, ...)
 *   blocked    Never treated as staff, even if added somewhere by mistake
 *
 * The server owner, anyone with "Manage Server", and IDs in DASHBOARD_ADMIN_IDS are always admins.
 */
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const settings = require('./settings');

const ROLE_KEYS = {
  admin: 'roles.admin',
  staff: 'roles.staff',
  specialist: 'roles.specialist',
  blocked: 'roles.blocked',
};

/** Matched by role name (case-insensitive) when you press "Use suggested defaults". */
const SUGGESTED_DEFAULTS = {
  admin: ['Owner', 'Manager'],
  staff: ['Emberstack Team', 'Moderator', 'Support', 'Staff'],
  specialist: ['Developer', 'Tester', 'Contributor'],
  blocked: ['Member', 'Release Ping', 'Bots'],
};

function getRoleConfig(guildId) {
  const out = {};
  for (const [name, key] of Object.entries(ROLE_KEYS)) out[name] = settings.get(guildId, key, []);
  return out;
}

function setRoleConfig(guildId, cfg) {
  for (const [name, key] of Object.entries(ROLE_KEYS)) settings.set(guildId, key, cfg[name] || []);
}

function hasAnyRole(member, roleIds, blocked) {
  const allowed = new Set(roleIds.filter((id) => !blocked.includes(id)));
  return member.roles.cache.some((role) => allowed.has(role.id));
}

/** True for owner, Manage Server, env admin IDs, and members with a configured admin role. */
function isAdminMember(member) {
  if (!member) return false;
  if (config.adminIds.has(member.id)) return true;
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const cfg = getRoleConfig(member.guild.id);
  return hasAnyRole(member, cfg.admin, cfg.blocked);
}

/** True for admins and ticket staff. Pass extra role IDs (e.g. a ticket type's own roles). */
function isStaffMember(member, extraRoleIds = []) {
  if (!member) return false;
  if (isAdminMember(member)) return true;
  const cfg = getRoleConfig(member.guild.id);
  return hasAnyRole(member, [...cfg.staff, ...extraRoleIds], cfg.blocked);
}

/** Looks up roles by name and fills the four lists. Returns the role names it could not find. */
function applySuggestedDefaults(guild) {
  const missing = [];
  const cfg = {};
  for (const [list, names] of Object.entries(SUGGESTED_DEFAULTS)) {
    cfg[list] = [];
    for (const name of names) {
      const matches = guild.roles.cache.filter((r) => r.id !== guild.id && r.name.toLowerCase() === name.toLowerCase());
      if (matches.size === 0) {
        if (!missing.includes(name)) missing.push(name);
      } else {
        matches.forEach((r) => cfg[list].push(r.id));
      }
    }
  }
  // A blocked role can never also be admin/staff/specialist.
  for (const list of ['admin', 'staff', 'specialist']) {
    cfg[list] = cfg[list].filter((id) => !cfg.blocked.includes(id));
  }
  setRoleConfig(guild.id, cfg);
  return { cfg, missing };
}

// ---- Dashboard access (cached for 60 seconds so removing someone's role takes effect quickly) ----
const accessCache = new Map();
const CACHE_MS = 60 * 1000;

/**
 * Returns true/false, or null if the bot is not connected to the server yet.
 */
async function canAccessDashboard(client, userId, guildId = config.guildId) {
  if (config.adminIds.has(userId)) return true;

  const key = `${guildId}:${userId}`;
  const cached = accessCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.allowed;

  const guild = client?.guilds.cache.get(guildId);
  if (!guild) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  const allowed = isAdminMember(member);
  accessCache.set(key, { allowed, at: Date.now() });
  return allowed;
}

function clearAccessCache() {
  accessCache.clear();
}

module.exports = {
  ROLE_KEYS,
  SUGGESTED_DEFAULTS,
  getRoleConfig,
  setRoleConfig,
  isAdminMember,
  isStaffMember,
  applySuggestedDefaults,
  canAccessDashboard,
  clearAccessCache,
};
