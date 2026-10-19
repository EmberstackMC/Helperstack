'use strict';
/**
 * Builds a self-contained HTML transcript of a ticket channel, styled with the Emberstack colors.
 * Images are embedded into the file (Discord's attachment links expire), up to sensible size limits.
 */
const rootLogger = require('../../../src/core/logger');
const { padNumber } = require('./util');

const log = rootLogger.forModule('transcripts');

const MAX_MESSAGES = 5000;
const MAX_INLINE_IMAGES = 20;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safeHex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);
const fmtTime = (ms) => `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)} UTC`;

/** Tiny, safe subset of Discord markdown. Input is escaped first, so user text can never inject HTML. */
function markdown(input) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = String(input ?? '');
  s = s.replace(/```(?:[a-z0-9]+\n)?([\s\S]*?)```/gi, (_, code) => keep(`<pre>${esc(code.replace(/\n$/, ''))}</pre>`));
  s = s.replace(/`([^`\n]+)`/g, (_, code) => keep(`<code>${esc(code)}</code>`));
  s = esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

async function fetchAllMessages(channel) {
  const all = [];
  let before;
  while (all.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse(); // oldest first
}

async function toDataUri(url, contentType, state) {
  if (state.images >= MAX_INLINE_IMAGES || state.bytes >= MAX_TOTAL_IMAGE_BYTES) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    state.images += 1;
    state.bytes += buffer.length;
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

const formatSize = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

async function renderAttachment(att, state) {
  const type = att.contentType || '';
  if (/^image\/(png|jpe?g|gif|webp)$/.test(type)) {
    const data = await toDataUri(att.url, type, state);
    if (data) return `<img class="att-img" src="${data}" alt="${esc(att.name)}">`;
  }
  return `<a class="att" href="${esc(att.url)}" target="_blank" rel="noopener noreferrer">\uD83D\uDCCE ${esc(att.name)} (${formatSize(att.size || 0)})</a>`;
}

function renderEmbed(embed) {
  const color = safeHex(embed.hexColor, '#4e5058');
  const parts = [];
  if (embed.title) parts.push(`<div class="e-title">${esc(embed.title)}</div>`);
  if (embed.description) parts.push(`<div class="e-desc">${markdown(embed.description)}</div>`);
  for (const f of embed.fields || []) parts.push(`<div class="e-field"><strong>${esc(f.name)}</strong><div>${markdown(f.value)}</div></div>`);
  if (embed.footer?.text) parts.push(`<div class="e-foot">${esc(embed.footer.text)}</div>`);
  if (!parts.length) return '';
  return `<div class="embed" style="border-left-color:${color}">${parts.join('')}</div>`;
}

async function renderMessage(m, state) {
  const name = m.member?.displayName || m.author.globalName || m.author.username;
  const color = safeHex(m.member?.displayHexColor, '#F3EBDD');
  const avatar = m.author.displayAvatarURL({ size: 64, extension: 'png' });
  const body = m.system ? `<em class="sys">${esc(m.cleanContent || 'System message')}</em>` : markdown(m.cleanContent);
  const attachments = [];
  for (const att of m.attachments.values()) attachments.push(await renderAttachment(att, state));
  const embeds = m.embeds.map(renderEmbed).join('');
  return `
  <div class="msg">
    <img class="av" src="${esc(avatar)}" alt="" width="40" height="40" loading="lazy">
    <div class="mb">
      <div class="mh"><span class="author" style="color:${color}">${esc(name)}</span>${m.author.bot ? '<span class="bot">BOT</span>' : ''}<time>${fmtTime(m.createdTimestamp)}</time></div>
      ${body ? `<div class="txt">${body}</div>` : ''}${attachments.join('')}${embeds}
    </div>
  </div>`;
}

/**
 * @param channel the ticket channel
 * @param ticket  the ticket row
 * @param guild   discord.js Guild
 * @param names   { opener, closer, claimer } display names for the header
 * @returns {{ html: string, count: number }}
 */
async function buildTranscript({ channel, ticket, guild, names = {} }) {
  const messages = await fetchAllMessages(channel);
  const state = { images: 0, bytes: 0 };
  const rendered = [];
  for (const m of messages) rendered.push(await renderMessage(m, state));
  log.info(`Transcript for ticket #${ticket.number}: ${messages.length} messages, ${state.images} images embedded`);

  const meta = [
    ['Opened by', names.opener || ticket.user_name || ticket.user_id],
    ['Opened', fmtTime(ticket.created_at)],
    ['Closed', ticket.closed_at ? fmtTime(ticket.closed_at) : '-'],
    ['Closed by', names.closer || '-'],
    ['Claimed by', names.claimer || '-'],
    ['Priority', ticket.priority],
    ['Reason', ticket.close_reason || '-'],
  ]
    .map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket #${padNumber(ticket.number)} - ${esc(ticket.type_name)}</title>
<style>
:root{--bg:#171411;--card:#211c17;--ember:#F27A38;--gold:#FFC36B;--cream:#F3EBDD;--muted:#AAA192;--line:rgba(243,235,221,.1)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--cream);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 18px 60px}
header{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--ember);border-radius:14px;padding:20px 22px;margin-bottom:22px}
h1{margin:0 0 4px;font-size:1.5rem}h1 small{color:var(--gold);font-weight:600}
.sub{color:var(--muted);margin-bottom:14px}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 18px}
.meta span{display:block;color:var(--muted);font-size:.8rem}.meta strong{font-weight:600;overflow-wrap:anywhere}
.msg{display:flex;gap:14px;padding:10px 6px;border-bottom:1px solid var(--line)}.av{border-radius:50%;flex:none;background:var(--card)}
.mb{min-width:0;flex:1}.mh{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.author{font-weight:700}.mh time{color:var(--muted);font-size:.78rem}
.bot{background:var(--ember);color:#1b120a;border-radius:4px;font-size:.65rem;font-weight:800;padding:1px 5px}
.txt{overflow-wrap:anywhere}.txt a,.att{color:var(--gold)}.att{display:inline-block;margin-top:6px}.sys{color:var(--muted)}
code{background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px}pre{background:#100d0b;border:1px solid var(--line);border-radius:8px;padding:10px;overflow:auto;margin:6px 0}
.att-img{display:block;max-width:min(100%,420px);max-height:320px;border-radius:8px;margin-top:8px}
.embed{margin-top:8px;border-left:4px solid #4e5058;background:var(--card);border-radius:4px 8px 8px 4px;padding:10px 14px;max-width:560px}
.e-title{font-weight:700}.e-desc{margin-top:4px}.e-field{margin-top:8px}.e-foot{margin-top:8px;color:var(--muted);font-size:.8rem}
.end{text-align:center;color:var(--muted);margin-top:26px;font-size:.85rem}
</style></head><body><div class="wrap">
<header><h1>Ticket #${padNumber(ticket.number)} <small>${esc(ticket.type_name)}</small></h1>
<div class="sub">${esc(guild.name)} - ${messages.length} message${messages.length === 1 ? '' : 's'}</div>
<div class="meta">${meta}</div></header>
${rendered.join('') || '<p class="end">No messages.</p>'}
<p class="end">Transcript generated ${fmtTime(Date.now())}</p>
</div></body></html>`;

  return { html, count: messages.length };
}

module.exports = { buildTranscript, markdown };
