'use strict';
const v = require('../../../../src/dashboard/validate');
const permissions = require('../../../../src/core/permissions');
const settingsSvc = require('../../services/settings');
const { page } = require('./_util');

module.exports = (router, ctx) => {
  router.get('/settings', (req, res) => {
    const guild = ctx.client.guilds.cache.get(req.guildId);
    const cfg = permissions.getRoleConfig(req.guildId);
    const names = (ids) => ids.map((id) => guild?.roles.cache.get(id)?.name).filter(Boolean);
    page(res, 'tickets/settings', 'settings', {
      title: 'Ticket settings',
      s: settingsSvc.get(req.guildId),
      roleSummary: { admin: names(cfg.admin), staff: names(cfg.staff), specialist: names(cfg.specialist) },
    });
  });

  router.post('/settings', v.formRoute('/tickets/settings', (req, res) => {
    const b = req.body;
    const guild = ctx.client.guilds.cache.get(req.guildId);
    const logChannelId = v.text(b.logChannelId, { label: 'Log channel' });
    if (logChannelId && !guild?.channels.cache.has(logChannelId)) throw new v.FormError('That log channel does not exist any more. Pick another.');

    settingsSvc.save(req.guildId, {
      logChannelId,
      dmTranscript: v.bool(b.dmTranscript),
      ratingEnabled: v.bool(b.ratingEnabled),
      allowUserClose: v.bool(b.allowUserClose),
      maxOpenGlobal: v.int(b.maxOpenGlobal, { label: 'Max open tickets per person', min: 0, max: 50 }),
      autoCloseHours: v.int(b.autoCloseHours, { label: 'Auto-close after (hours)', min: 0, max: 720 }),
      autoCloseWarnHours: v.int(b.autoCloseWarnHours, { label: 'Warn before closing (hours)', min: 0, max: 72 }),
      deleteDelaySeconds: v.int(b.deleteDelaySeconds, { label: 'Delete delay (seconds)', min: 0, max: 60 }),
    });
    req.flash('success', 'Ticket settings saved.');
    res.redirect('/tickets/settings');
  }));
};
