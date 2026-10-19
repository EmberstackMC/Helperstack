'use strict';
/**
 * Logging to the console AND to files in the logs folder (app.log and error.log).
 * Use logger.forModule('tickets') to get a logger that tags each line with the module name.
 */
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('../config');

fs.mkdirSync(config.logDir, { recursive: true });

const line = winston.format.printf(({ timestamp, level, message, stack, module: mod, ...meta }) => {
  const tag = mod ? ` [${mod}]` : '';
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}${tag} ${stack || message}${extra}`;
});

const base = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true })
);

const fileFormat = winston.format.combine(base, winston.format.uncolorize(), line);
const consoleFormat = winston.format.combine(base, winston.format.colorize({ level: true }), line);

const logger = winston.createLogger({
  level: config.logLevel,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(config.logDir, 'app.log'),
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(config.logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});

logger.forModule = (name) => logger.child({ module: name });

module.exports = logger;
