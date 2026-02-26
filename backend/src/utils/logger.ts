/**
 * Winston Logger Configuration
 * Centralized logging with structured output
 */

import winston from 'winston';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
export const Logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'trustee-portal-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        process.env.NODE_ENV === 'production' ? json() : devFormat
      )
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  Logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: combine(timestamp(), json())
  }));
  
  Logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: combine(timestamp(), json())
  }));
}

// Export helper methods
export const logInfo = (message: string, meta?: Record<string, any>) => {
  Logger.info(message, meta);
};

export const logError = (message: string, error?: Error, meta?: Record<string, any>) => {
  Logger.error(message, { ...meta, error: error?.message, stack: error?.stack });
};

export const logWarn = (message: string, meta?: Record<string, any>) => {
  Logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: Record<string, any>) => {
  Logger.debug(message, meta);
};
