'use strict';
const v = require('../../../../src/dashboard/validate');
const { asArray } = require('../../../../src/dashboard/helpers');
const permissions = require('../../../../src/core/permissions');
const typesSvc = require('../../services/types');
const { page, parseId, channelLabel } = require('./_util');

const EMPTY_TYPE = {
  id: null, name: '', emoji: '', description: '', button_label: '', button_style: 'primary', category_id: '', staffRoleIds: [],
  inheritStaff: true, naming_pattern: 'ticket-{number}', welcome_title: 'Ticket #{ticket-number}',
  welcome_description: 'Hi {user}, thanks for opening a **{ticket-type}** ticket. {staff-role} will be with you shortly. Please describe what you need.',
  welcome_color: '', max_open_per_user: 0, formQuestions: [], closeWithReason: true,
};

function parseQuestions(raw) {
  let list;
  try {
    list = JSON.parse(raw || '[]');
  } catch {
    throw new v.FormError('The question list could not be read. Reload the page and try again.');
  }
  if (!Array.isArray(list)) throw new v.FormError('The question list could not be read. Reload the page and try again.');
  const out = [];
  for (const q of list) {
    const label = v.text(q?.label, { label: 'Question', max: 45 });
    if (!label) continue; // empty rows are ignored
    out.push({
      label,
      style: q.style === 'long' ? 'long' : 'short',
      required: q.required !== false,
      placeholder: v.text(q.placeholder, { label: 'Question placeholder', max: 100 }),
    });
  }
  if (out.length > 5) throw new v.FormError('A form can have at most 5 questions (that is a Discord limit).');
  return out;
}

module.exports = (router, ctx) => {
  const { db } = ctx;

  function parseType(req) {
    const b = req.body;
    const guild = ctx.client.guilds.cache.get(req.guildId);
    if (!guild) throw new v.FormError('The bot is not connected to your server.');

    const categoryId = v.text(b.categoryId, { label: 'Category' });
    if (categoryId && !guild.channels.cache.has(categoryId)) throw new v.FormError('That category does not exist any more. Pick another.');

    const blocked = permissions.getRoleConfig(req.guildId).blocked;
    const staffRoleIds = [...new Set(asArray(b.staffRoleIds))].filter((id) => guild.roles.cache.has(id) && id !== guild.id && !blocked.includes(id));

    const pattern = v.text(b.namingPattern, { label: 'Channel name pattern', max: 100 }) || 'ticket-{number}';
    return {
      name: v.text(b.name, { label: 'Name', required: true, max: 50 }),
      emoji: v.text(b.emoji, { label: 'Emoji', max: 64 }),
      description: v.text(b.description, { label: 'Description', max: 100 }),
      buttonLabel: v.text(b.buttonLabel, { label: 'Button label', max: 80 }),
      buttonStyle: v.oneOf(b.buttonStyle, ['primary', 'secondary', 'success', 'danger'], { label: 'Button color', fallback: 'primary' }),
      categoryId,
      staffRoleIds,
      inheritStaff: v.bool(b.inheritStaff),
      namingPattern: pattern,
      welcomeTitle: v.text(b.welcomeTitle, { label: 'Welcome title', max: 256 }),
      welcomeDescription: v.text(b.welcomeDescription, { label: 'Welcome message', max: 4000 }),
      welcomeColor: v.bool(b.welcomeColorDefault) ? '' : v.hex(b.welcomeColor, { label: 'Welcome color' }),
      maxOpenPerUser: v.int(b.maxOpenPerUser, { label: 'Max open tickets per person', min: 0, max: 50 }),
      formQuestions: parseQuestions(b.questions),
      closeWithReason: v.bool(b.closeWithReason),
    };
  }

  router.get('/types', (req, res) => {
    const types = typesSvc.list(req.guildId).map((t) => ({
      ...t,
      categoryName: channelLabel(ctx, req.guildId, t.category_id),
      openCount: db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND type_id = ? AND status = 'open'").get(req.guildId, t.id).n,
    }));
    page(res, 'tickets/types', 'types', { title: 'Ticket types', types });
  });

  const defaultColor = (req) => ctx.settings.get(req.guildId, 'bot.embedColor', '#F27A38');

  router.get('/types/new', (req, res) => page(res, 'tickets/type-edit', 'types', { title: 'New ticket type', type: EMPTY_TYPE, defaultColor: defaultColor(req) }));

  router.get('/types/:id', (req, res, next) => {
    const type = typesSvc.get(req.guildId, parseId(req.params.id));
    if (!type) return next(Object.assign(new Error('That ticket type does not exist.'), { status: 404 }));
    page(res, 'tickets/type-edit', 'types', { title: `Edit: ${type.name}`, type, defaultColor: defaultColor(req) });
  });

  router.post('/types', v.formRoute('/tickets/types/new', (req, res) => {
    const id = typesSvc.save(req.guildId, null, parseType(req));
    req.flash('success', 'Ticket type created. Add it to a panel so people can use it.');
    res.redirect(`/tickets/types/${id}`);
  }));

  router.post('/types/:id', v.formRoute((req) => `/tickets/types/${req.params.id}`, (req, res) => {
    const id = parseId(req.params.id);
    if (!typesSvc.get(req.guildId, id)) throw new v.FormError('That ticket type does not exist.');
    typesSvc.save(req.guildId, id, parseType(req));
    req.flash('success', 'Saved. If it appears on a panel, press "Save and send to Discord" there to refresh the button.');
    res.redirect(`/tickets/types/${id}`);
  }));

  router.post('/types/:id/delete', (req, res) => {
    typesSvc.remove(req.guildId, parseId(req.params.id));
    req.flash('success', 'Ticket type deleted. Existing tickets keep working; update your panels to remove the old button.');
    res.redirect('/tickets/types');
  });
};
