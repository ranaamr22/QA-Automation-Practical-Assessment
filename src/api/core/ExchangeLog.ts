import { env } from '@src/config/env';
import { logger } from '@src/utils/logger';
import { redact } from '@src/utils/redact';

export interface ApiExchange {
  timestamp: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  status: number;
  durationMs: number;
  responseBody?: unknown;
}

/**
 * Per-test record of every HTTP exchange made through the framework.
 * The fixture layer attaches it to the Playwright report when a test fails, which gives
 * API failures the same "what exactly happened" context that traces give UI failures.
 * Everything is redacted at insertion time, so nothing sensitive is ever held in memory for reporting.
 */
export class ExchangeLog {
  private readonly entries: ApiExchange[] = [];

  add(exchange: ApiExchange): void {
    const safe = redact(exchange);
    this.entries.push(safe);
    if (env.debugApi) {
      logger.debug(`${safe.method} ${safe.url} -> ${safe.status} (${safe.durationMs}ms)`, {
        request: safe.requestBody,
        response: safe.responseBody,
      });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  last(): ApiExchange | undefined {
    return this.entries[this.entries.length - 1];
  }

  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}
