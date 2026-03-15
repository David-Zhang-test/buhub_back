/**
 * BUHUB 统一日志模块
 * - 级别: error, warn, info, debug
 * - 输出: stdout (Docker 可采集) + 可选按日轮转文件 (LOG_DIR)
 * - 格式: JSON，便于检索与后续接入 ELK/云日志
 */

const winston = require("winston");

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
const LOG_DIR = process.env.LOG_DIR || "";

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
  winston.format.errors({ stack: true })
);

const jsonFormat = winston.format.combine(
  baseFormat,
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === "production"
        ? jsonFormat
        : winston.format.combine(
            baseFormat,
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, module, ...meta }) => {
              const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
              return `${timestamp} [${module || "app"}] ${level}: ${message}${metaStr}`;
            })
          ),
  }),
];

if (LOG_DIR) {
  try {
    const DailyRotateFile = require("winston-daily-rotate-file");
    transports.push(
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: "app-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "50m",
        maxFiles: "14d",
        format: jsonFormat,
      })
    );
    transports.push(
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: "error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "50m",
        maxFiles: "30d",
        level: "error",
        format: jsonFormat,
      })
    );
  } catch (e) {
    console.warn("[logger] LOG_DIR set but winston-daily-rotate-file not installed; file logging disabled");
  }
}

const rootLogger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: "buhub-back" },
  transports,
});

/**
 * 创建带 module 标签的子 logger，便于过滤
 * @param {string} module - 模块名，如 "auth/login", "middleware", "http"
 */
function child(module) {
  return {
    error: (msg, meta = {}) => rootLogger.error(msg, { ...meta, module }),
    warn: (msg, meta = {}) => rootLogger.warn(msg, { ...meta, module }),
    info: (msg, meta = {}) => rootLogger.info(msg, { ...meta, module }),
    debug: (msg, meta = {}) => rootLogger.debug(msg, { ...meta, module }),
    child: (sub) => child(module + "/" + sub),
  };
}

const defaultLogger = child("app");

module.exports = {
  logger: defaultLogger,
  child,
};
module.exports.default = defaultLogger;
