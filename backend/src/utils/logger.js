const winston = require('winston');

// Configuration des niveaux de log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Transports: console seulement (serverless = filesystem en lecture seule)
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.printf(info => {
        const { timestamp, level, message, ...meta } = info;
        const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} ${level}: ${message}${metaStr}`;
      })
    )
  })
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports
});

module.exports = logger;
