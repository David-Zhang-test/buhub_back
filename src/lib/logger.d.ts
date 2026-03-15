export interface Logger {
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  child(sub: string): Logger;
}

export function child(module: string): Logger;

export const logger: Logger;
declare const _default: Logger;
export default _default;
