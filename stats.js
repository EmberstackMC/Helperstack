'use strict';
const { page, memberName } = require('./_util');

module.exports = (router, ctx) => {
  const { db } = ctx;

  router.get('/stats', (req, res) => {
    const g = req.guildId;
    const day = 86400000;
    const botId = ctx.client.user?.id || '';

    const totals = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'open'), 0) AS open,
      COALESCE(SUM(status IN ('closed','deleted')), 0) AS closed FROM tickets WHERE guild_id = ?`).get(g);
    const last30 = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND created_at >= ?').get(g, Date.now() - 30 * day).n;
    const avgResponse = db.prepare('SELECT AVG(first_response_at - created_at) AS a FROM tickets WHERE guild_id = ? AND first_response_at IS NOT NULL').get(g).a;
    const avgResolution = db.prepare("SELECT AVG(closed_at - created_at) AS a FROM tickets WHERE guild_id = ? AND closed_at IS NOT NULL AND status != 'open'").get(g).a;
    const rating = db.prepare('SELECT AVG(rating) AS a, COUNT(rating) AS n FROM tickets WHERE guild_id = ? AND rating IS NOT NULL').get(g);

    // Tickets per staff member: claimed, and closed by.
    const staffMap = new Map();
    const bump = (id, field, value) => {
      if (!staffMap.has(id)) staffMap.set(id, { id, claimed: 0, closed: 0, rating: null });
      staffMap.get(id)[field] = value;
    };
    for (const r of db.prepare('SELECT claimed_by AS id, COUNT(*) AS n, AVG(rating) AS r FROM tickets WHERE guild_id = ? AND claimed_by IS NOT NULL GROUP BY claimed_by').all(g)) {
      bump(r.id, 'claimed', r.n);
      bump(r.id, 'rating', r.r);
    }
    for (const r of db.prepare('SELECT closed_by AS id, COUNT(*) AS n FROM tickets WHERE guild_id = ? AND closed_by IS NOT NULL AND closed_by != ? GROUP BY closed_by').all(g, botId)) {
      bump(r.id, 'closed', r.n);
    }
    const staff = [...staffMap.values()]
      .map((s) => ({ ...s, name: memberName(ctx, g, s.id) }))
      .sort((a, b) => b.claimed + b.closed - (a.claimed + a.closed))
      .slice(0, 25);

    const byType = db.prepare('SELECT type_name AS name, COUNT(*) AS n FROM tickets WHERE guild_id = ? GROUP BY type_name ORDER BY n DESC LIMIT 15').all(g);

    // Last 14 days (UTC), with zeros filled in.
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 13);
    const perDay = new Map(db.prepare("SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS d, COUNT(*) AS n FROM tickets WHERE guild_id = ? AND created_at >= ? GROUP BY d").all(g, since.getTime()).map((r) => [r.d, r.n]));
    const days = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(since.getTime() + i * day);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: key.slice(8), n: perDay.get(key) || 0 });
    }

    page(res, 'tickets/stats', 'stats', {
      title: 'Ticket statistics',
      totals, last30, avgResponse, avgResolution, rating, staff, byType, days,
      maxDay: Math.max(1, ...days.map((d) => d.n)),
      maxType: Math.max(1, ...byType.map((t) => t.n)),
    });
  });
};
