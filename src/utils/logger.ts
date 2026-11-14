import { redact } from './redact';

/**
 * Deliberately tiny logger: Playwright already captures stdout per test in the report.
 * Everything is routed through `redact` so nobody has to remember to do it at call sites.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, details?: unknown): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${redact(message)}`;
  const payload = details === undefined ? '' : ` ${JSON.stringify(redact(details))}`;
  (level === 'error' || level === 'warn' ? console.warn : console.log)(line + payload);
}

export const logger = {
  debug: (m: string, d?: unknown) => write('debug', m, d),
  info: (m: string, d?: unknown) => write('info', m, d),
  warn: (m: string, d?: unknown) => write('warn', m, d),
  error: (m: string, d?: unknown) => write('error', m, d),
};
