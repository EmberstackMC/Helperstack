'use strict';
const v = require('../../../../src/dashboard/validate');
const { page, memberName } = require('./_util');

module.exports = (router, ctx) => {
  const { db } = ctx;

  router.get('/blacklist', (req, res) => {
    const rows = db.prepare('SELECT * FROM ticket_blacklist WHERE guild_id = ? ORDER BY created_at DESC').all(req.guildId)
      .map((r) => ({ ...r, addedByName: memberName(ctx, req.guildId, r.added_by) }));
    page(res, 'tickets/blacklist', 'blacklist', { title: 'Ticket blacklist', rows });
  });

  router.post('/blacklist', v.formRoute('/tickets/blacklist', async (req, res) => {
    // Accepts a plain ID or a pasted mention like <@123456789012345678>.
    const userId = String(req.body.userId || '').replace(/\D/g, '');
    if (userId.length < 15 || userId.length > 22) throw new v.FormError('Enter the person\'s Discord user ID (a long number). Right-click their name with Developer Mode on and choose Copy User ID.');
    const reason = v.text(req.body.reason, { label: 'Reason', max: 200 });

    const user = await ctx.client.users.fetch(userId).catch(() => null);
    if (!user) throw new v.FormError('Discord does not know a user with that ID. Check it and try again.');

    db.prepare(`INSERT INTO ticket_blacklist (guild_id, user_id, user_name, reason, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, user_name = excluded.user_name`).run(req.guildId, user.id, user.username, reason, req.user.id, Date.now());
    req.flash('success', `${user.username} can no longer open tickets.`);
    res.redirect('/tickets/blacklist');
  }));

  router.post('/blacklist/:userId/delete', (req, res) => {
    db.prepare('DELETE FROM ticket_blacklist WHERE guild_id = ? AND user_id = ?').run(req.guildId, String(req.params.userId).replace(/\D/g, ''));
    req.flash('success', 'Removed from the blacklist.');
    res.redirect('/tickets/blacklist');
  });
};
