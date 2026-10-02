type Level = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? levels.info;

function emit(level: Level, message: string, meta?: unknown): void {
  if (levels[level] < threshold) return;
  const stamp = new Date().toISOString();
  const line = `${stamp} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line, meta ?? '');
  else if (level === 'warn') console.warn(line, meta ?? '');
  else console.log(line, meta ?? '');
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
