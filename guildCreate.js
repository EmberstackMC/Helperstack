'use strict';
module.exports = {
  name: 'guildCreate',

  async execute(ctx, guild) {
    const log = ctx.logger.forModule('core');
    if (ctx.isGuildAllowed(guild.id)) log.info(`Joined configured server "${guild.name}" (${guild.id})`);
    else log.warn(`Joined "${guild.name}" (${guild.id}), which is not GUILD_ID. The bot ignores commands there.`);
  },
};
