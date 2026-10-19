'use strict';
const v = require('../../../../src/dashboard/validate');
const { asArray } = require('../../../../src/dashboard/helpers');
const panelsSvc = require('../../services/panels');
const typesSvc = require('../../services/types');
const { page, parseId, channelLabel } = require('./_util');

const EMPTY_PANEL = {
  id: null, name: '', channel_id: '', message_id: '', style: 'button', typeIds: [],
  embed_title: 'Need help?', embed_description: 'Choose the option that fits best and a private channel will be created for you and our team.',
  embed_color: '', embed_image: '', embed_thumbnail: '', embed_footer: '', select_placeholder: 'Choose a ticket type',
};

module.exports = (router, ctx) => {
  function parsePanel(req) {
    const b = req.body;
    const guild = ctx.client.guilds.cache.get(req.guildId);
    if (!guild) throw new v.FormError('The bot is not connected to your server.');
    const channelId = v.text(b.channelId, { label: 'Channel' });
    if (channelId && !guild.channels.cache.has(channelId)) throw new v.FormError('That channel does not exist any more. Pick another.');
    const valid = new Set(typesSvc.list(req.guildId).map((t) => t.id));
    const typeIds = [...new Set(asArray(b.typeIds).map(Number).filter((id) => valid.has(id)))];
    return {
      name: v.text(b.name, { label: 'Panel name', required: true, max: 60 }),
      channelId,
      style: v.oneOf(b.style, ['button', 'select'], { label: 'Style', fallback: 'button' }),
      typeIds,
      embedTitle: v.text(b.embedTitle, { label: 'Title', max: 256 }),
      embedDescription: v.text(b.embedDescription, { label: 'Description', max: 4000 }),
      embedColor: v.bool(b.embedColorDefault) ? '' : v.hex(b.embedColor, { label: 'Color' }),
      embedImage: v.url(b.embedImage, { label: 'Image link' }),
      embedThumbnail: v.url(b.embedThumbnail, { label: 'Thumbnail link' }),
      embedFooter: v.text(b.embedFooter, { label: 'Footer', max: 2048 }),
      selectPlaceholder: v.text(b.selectPlaceholder, { label: 'Dropdown placeholder', max: 150 }) || 'Choose a ticket type',
    };
  }

  async function afterSave(req, res, id) {
    if (req.body.action === 'send') {
      try {
        const result = await panelsSvc.send(req.guildId, id);
        req.flash('success', `Saved, and the panel was ${result.action} in Discord.`);
      } catch (err) {
        ctx.logger.warn(`Panel send failed: ${err.message}`);
        req.flash('error', `Saved, but the panel could not be posted: ${err.code === 50013 ? 'the bot cannot write in that channel (check its permissions there).' : err.message}`);
      }
    } else {
      req.flash('success', 'Panel saved. Press "Save and send to Discord" to post or update the message.');
    }
    res.redirect(`/tickets/panels/${id}`);
  }

  router.get('/panels', (req, res) => {
    const types = typesSvc.list(req.guildId);
    const panels = panelsSvc.list(req.guildId).map((p) => ({
      ...p,
      channelName: channelLabel(ctx, req.guildId, p.channel_id),
      typeNames: p.typeIds.map((id) => types.find((t) => t.id === id)?.name).filter(Boolean),
    }));
    page(res, 'tickets/panels', 'panels', { title: 'Ticket panels', panels, hasTypes: types.length > 0 });
  });

  router.get('/panels/new', (req, res) => {
    page(res, 'tickets/panel-edit', 'panels', { title: 'New panel', panel: EMPTY_PANEL, types: typesSvc.list(req.guildId), defaultColor: ctx.settings.get(req.guildId, 'bot.embedColor', '#F27A38') });
  });

  router.get('/panels/:id', (req, res, next) => {
    const panel = panelsSvc.get(req.guildId, parseId(req.params.id));
    if (!panel) return next(Object.assign(new Error('That panel does not exist.'), { status: 404 }));
    page(res, 'tickets/panel-edit', 'panels', { title: `Edit panel: ${panel.name}`, panel, types: typesSvc.list(req.guildId), defaultColor: ctx.settings.get(req.guildId, 'bot.embedColor', '#F27A38') });
  });

  router.post('/panels', v.formRoute('/tickets/panels/new', async (req, res) => {
    const id = panelsSvc.save(req.guildId, null, parsePanel(req));
    await afterSave(req, res, id);
  }));

  router.post('/panels/:id', v.formRoute((req) => `/tickets/panels/${req.params.id}`, async (req, res) => {
    const id = parseId(req.params.id);
    if (!panelsSvc.get(req.guildId, id)) throw new v.FormError('That panel does not exist.');
    panelsSvc.save(req.guildId, id, parsePanel(req));
    await afterSave(req, res, id);
  }));

  router.post('/panels/:id/delete', async (req, res) => {
    await panelsSvc.remove(req.guildId, parseId(req.params.id));
    req.flash('success', 'Panel deleted, and its message was removed from Discord.');
    res.redirect('/tickets/panels');
  });
};
