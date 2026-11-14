import type { z } from 'zod';
import type { ApiExchange } from './ExchangeLog';

/**
 * Thin, immutable wrapper around a completed HTTP exchange.
 * Clients return this (rather than throwing on non-2xx) so negative tests can assert on
 * 4xx responses with exactly the same API as positive tests.
 */
export class ApiResponse<TBody = unknown> {
  constructor(
    readonly status: number,
    readonly headers: Record<string, string>,
    readonly body: TBody,
    /** Redacted exchange, used to build self-explanatory assertion messages. */
    readonly exchange: ApiExchange,
  ) {}

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  /** Validates the body against a schema; throws a readable error listing every mismatch. */
  parse<S extends z.ZodTypeAny>(schema: S): z.infer<S> {
    const result = schema.safeParse(this.body);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('\n');
      throw new Error(
        `Response of ${this.exchange.method} ${this.exchange.url} (HTTP ${this.status}) does not match the expected schema:\n` +
          `${issues}\nBody: ${JSON.stringify(this.exchange.responseBody, null, 2)}`,
      );
    }
    return result.data;
  }

  describe(): string {
    return `${this.exchange.method} ${this.exchange.url} -> HTTP ${this.status}\n` +
      `Request: ${JSON.stringify(this.exchange.requestBody ?? null)}\n` +
      `Response: ${JSON.stringify(this.exchange.responseBody ?? null)}`;
  }
}
