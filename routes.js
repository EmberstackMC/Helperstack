'use strict';
// Each tab of the Tickets section lives in its own file under pages/.
module.exports = (router, ctx) => {
  require('./pages/list')(router, ctx);
  require('./pages/panels')(router, ctx);
  require('./pages/types')(router, ctx);
  require('./pages/settings')(router, ctx);
  require('./pages/stats')(router, ctx);
  require('./pages/blacklist')(router, ctx);
};
