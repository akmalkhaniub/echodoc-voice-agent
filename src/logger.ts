/**
 * Minimal structured logger — JSON lines in production, readable in dev.
 * Keeps a consistent shape (ts, level, msg, ...ctx) so logs are grep/ship-able.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const threshold = LEVELS[envLevel] ?? LEVELS.info;
const asJson = process.env.NODE_ENV === 'production' || process.env.LOG_JSON === 'true';

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const record = { ts: new Date().toISOString(), level, msg, ...(ctx || {}) };
  const line = asJson ? JSON.stringify(record) : `${record.ts} ${level.toUpperCase().padEnd(5)} ${msg}${ctx ? ' ' + JSON.stringify(ctx) : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
  child: (base: Record<string, unknown>) => ({
    debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, { ...base, ...ctx }),
    info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, { ...base, ...ctx }),
  }),
};
