'use strict';
const autoClose = require('../services/autoClose');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    autoClose.start();
  },
};
