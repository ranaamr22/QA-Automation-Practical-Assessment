import type { APIRequestContext, APIResponse } from '@playwright/test';
import { redact } from '@src/utils/redact';
import { ApiResponse } from './ApiResponse';
import type { ExchangeLog } from './ExchangeLog';

/**
 * Supplies bearer tokens. Implemented by `AuthSession` (src/auth) - the ONLY place in the framework
 * that knows how to log in. API clients and tests never handle credentials.
 */
export interface TokenProvider {
  getToken(): Promise<string>;
  /** Drop the cached token so the next `getToken()` re-authenticates. */
  invalidate(): void;
}

/**
 * Per-request auth override, so negative authorization tests reuse the real clients:
 *  - 'session' (default): token from the client's TokenProvider
 *  - 'none': no Authorization header
 *  - { token }: explicit (e.g. malformed/expired) token
 */
export type AuthMode = 'session' | 'none' | { token: string };

/** Untyped query parameters, so negative tests can send invalid values (e.g. limit=abc). */
export type RawQuery = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  params?: RawQuery;
  data?: unknown;
  auth?: AuthMode;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly log: ExchangeLog,
    private readonly tokens: TokenProvider | null,
  ) {}

  get<T = unknown>(path: string, options: RequestOptions = {}) {
    return this.send<T>('GET', path, options);
  }

  post<T = unknown>(path: string, options: RequestOptions = {}) {
    return this.send<T>('POST', path, options);
  }

  put<T = unknown>(path: string, options: RequestOptions = {}) {
    return this.send<T>('PUT', path, options);
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}) {
    return this.send<T>('DELETE', path, options);
  }

  private async send<T>(method: Method, path: string, options: RequestOptions): Promise<ApiResponse<T>> {
    const mode: AuthMode = options.auth ?? (this.tokens ? 'session' : 'none');
    let response = await this.dispatch<T>(method, path, options, mode);

    // Central handling of token expiry/revocation: one transparent re-login + retry.
    // Only for session auth - explicit-token tests must observe the 401 themselves.
    if (response.status === 401 && mode === 'session' && this.tokens) {
      this.tokens.invalidate();
      response = await this.dispatch<T>(method, path, options, mode);
    }
    return response;
  }

  private async dispatch<T>(method: Method, path: string, options: RequestOptions, mode: AuthMode) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.data !== undefined) headers['Content-Type'] = 'application/json';
    if (mode === 'session') {
      if (!this.tokens) throw new Error(`"session" auth requested for ${method} ${path} on an anonymous client`);
      headers.Authorization = `Bearer ${await this.tokens.getToken()}`;
    } else if (typeof mode === 'object') {
      headers.Authorization = `Bearer ${mode.token}`;
    }

    const params = options.params
      ? (Object.fromEntries(Object.entries(options.params).filter(([, v]) => v !== undefined)) as Record<
          string,
          string | number | boolean
        >)
      : undefined;

    // Paths are relative WITHOUT a leading slash so they resolve under the `/api/` base URL.
    const relative = path.replace(/^\//, '');
    const started = Date.now();
    const raw = await this.fetchWithNetworkRetry(relative, method, { method, headers, params, data: options.data });
    const durationMs = Date.now() - started;
    const body = (await readBody(raw)) as T;

    const exchange = {
      timestamp: new Date(started).toISOString(),
      method,
      url: raw.url(),
      requestHeaders: headers,
      requestBody: options.data,
      status: raw.status(),
      durationMs,
      responseBody: body,
    };
    this.log.add(exchange);
    return new ApiResponse<T>(raw.status(), raw.headers(), body, this.log.last() ?? exchange);
  }

  /**
   * The shared environment drops idle keep-alive connections; the next request on that socket then
   * fails with "socket hang up / ECONNRESET" before reaching the server (seen in 8 of 77 tests on
   * 2026-11-14). Such transport errors are retried ONCE on a fresh attempt - HTTP error statuses never are.
   * Playwright's error text includes request headers, so the bearer token is scrubbed before rethrowing.
   */
  private async fetchWithNetworkRetry(
    url: string,
    method: Method,
    init: Parameters<APIRequestContext['fetch']>[1],
  ): Promise<APIResponse> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.request.fetch(url, init);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error);
        if (attempt === 1 && TRANSIENT_NETWORK_ERROR.test(message)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw new Error(`${method} ${url} failed: ${redact(message.split('\n')[0])}`);
      }
    }
  }
}

const TRANSIENT_NETWORK_ERROR = /ECONNRESET|socket hang up|ETIMEDOUT|EPIPE|ECONNREFUSED/;

async function readBody(response: APIResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
