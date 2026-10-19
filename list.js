'use strict';
const { PRIORITIES, parseJson } = require('../../services/util');
const typesSvc = require('../../services/types');
const { page, parseId, likeEscape, memberName } = require('./_util');

const PAGE_SIZE = 25;

module.exports = (router, ctx) => {
  const { db } = ctx;

  // ---- Ticket list with search and filters ----
  router.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const status = ['open', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const typeId = parseId(req.query.type);
    const priority = Object.keys(PRIORITIES).includes(req.query.priority) ? req.query.priority : '';
    const pageNo = Math.max(1, parseInt(req.query.page, 10) || 1);

    const where = ['guild_id = ?'];
    const params = [req.guildId];
    if (status === 'open') where.push("status = 'open'");
    if (status === 'closed') where.push("status IN ('closed','deleted')");
    if (typeId) { where.push('type_id = ?'); params.push(typeId); }
    if (priority) { where.push('priority = ?'); params.push(priority); }
    if (q) {
      where.push("(user_name LIKE ? ESCAPE '\\' OR user_id = ? OR type_name LIKE ? ESCAPE '\\' OR CAST(number AS TEXT) = ?)");
      params.push(`%${likeEscape(q)}%`, q, `%${likeEscape(q)}%`, q.replace(/^#/, ''));
    }

    const total = db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE ${where.join(' AND ')}`).get(...params).n;
    const rows = db
      .prepare(`SELECT * FROM tickets WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, PAGE_SIZE, (pageNo - 1) * PAGE_SIZE)
      .map((t) => ({ ...t, claimedName: memberName(ctx, req.guildId, t.claimed_by) }));

    const link = (extra) => {
      const p = new URLSearchParams();
      const merged = { q, status, type: typeId || '', priority, ...extra };
      for (const [k, v] of Object.entries(merged)) if (v !== '' && v !== undefined && v !== null) p.set(k, v);
      return `/tickets?${p}`;
    };
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    page(res, 'tickets/list', 'list', {
      title: 'Tickets', rows, total, q, status, typeId: typeId || '', priority,
      types: typesSvc.list(req.guildId), priorities: PRIORITIES,
      pageNo, pages, prevLink: pageNo > 1 ? link({ page: pageNo - 1 }) : null, nextLink: pageNo < pages ? link({ page: pageNo + 1 }) : null,
    });
  });

  // ---- One ticket: details + transcript ----
  router.get('/view/:id', (req, res, next) => {
    const id = parseId(req.params.id);
    const ticket = id && db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND id = ?').get(req.guildId, id);
    if (!ticket) return next(Object.assign(new Error('That ticket does not exist.'), { status: 404 }));
    const transcript = db.prepare('SELECT message_count, created_at FROM ticket_transcripts WHERE ticket_id = ?').get(ticket.id);
    page(res, 'tickets/detail', 'list', {
      title: `Ticket #${String(ticket.number).padStart(4, '0')}`,
      ticket, transcript, priorities: PRIORITIES,
      answers: parseJson(ticket.form_answers, []),
      names: {
        opener: ticket.user_name || ticket.user_id,
        claimer: memberName(ctx, req.guildId, ticket.claimed_by),
        closer: ticket.closed_by === ctx.client.user?.id ? 'Automatic (inactivity)' : memberName(ctx, req.guildId, ticket.closed_by),
      },
      discordUrl: ticket.status === 'open' ? `https://discord.com/channels/${ticket.guild_id}/${ticket.channel_id}` : '',
    });
  });

  // ---- The transcript itself, served for the iframe (sandboxed) or as a download ----
  router.get('/transcripts/:id/raw', (req, res, next) => {
    const id = parseId(req.params.id);
    const row =
      id &&
      db
        .prepare('SELECT t.html, k.number FROM ticket_transcripts t JOIN tickets k ON k.id = t.ticket_id WHERE k.guild_id = ? AND k.id = ?')
        .get(req.guildId, id);
    if (!row) return next(Object.assign(new Error('There is no transcript for that ticket yet.'), { status: 404 }));

    // The sandbox means nothing inside a transcript can run scripts or reach this site.
    res.set(
      'Content-Security-Policy',
      "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'self'"
    );
    if (req.query.download) res.set('Content-Disposition', `attachment; filename="ticket-${String(row.number).padStart(4, '0')}.html"`);
    res.type('html').send(row.html);
  });
};
