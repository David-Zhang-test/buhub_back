/**
 * BUHUB 统一日志模块
 * - 级别: error, warn, info, debug
 * - 输出: stdout (Docker 可采集) + 可选按日轮转文件 (LOG_DIR)
 * - 格式: JSON，便于检索与后续接入 ELK/云日志
 */

const path = require("path");
const winston = require("winston");

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
const LOG_DIR = process.env.LOG_DIR || "";

/** File logs under the repo in dev make Next.js watch those files and recompile constantly. */
function logDirSafeForDevFileWrites() {
  if (!LOG_DIR) return false;
  if (process.env.NODE_ENV !== "development") return true;
  const abs = path.resolve(LOG_DIR);
  const cwd = process.cwd();
  if (abs === cwd || abs.startsWith(cwd + path.sep)) {
    if (process.env.LOG_DIR_ALLOW_IN_PROJECT === "1") return true;
    console.warn(
      "[logger] LOG_DIR is inside project directory in development — file logging disabled to avoid Next.js recompile loops. Use a path outside the repo, unset LOG_DIR, or set LOG_DIR_ALLOW_IN_PROJECT=1."
    );
    return false;
  }
  return true;
}

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

if (LOG_DIR && logDirSafeForDevFileWrites()) {
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
