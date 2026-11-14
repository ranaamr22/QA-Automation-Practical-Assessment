import type { APIRequestContext } from '@playwright/test';
import { AuthClient } from '@src/api/clients/AuthClient';
import { ApiClient, type TokenProvider } from '@src/api/core/ApiClient';
import { ExchangeLog } from '@src/api/core/ExchangeLog';
import { AuthResponseSchema } from '@src/api/models/auth.model';
import { env } from '@src/config/env';
import { jwtExpiry } from '@src/utils/jwt';
import { logger } from '@src/utils/logger';
import type { TestAccount } from './accounts';

/** Refresh this long before `exp` so a token never expires mid-test. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * The single owner of authentication for one account.
 *
 *  - Logs in lazily on first use and caches the JWT for the worker's lifetime.
 *  - Proactively re-authenticates when the token is close to `exp` (docs: 7-day validity).
 *  - `invalidate()` is called by ApiClient on a 401 -> transparent re-login + single retry.
 *  - Optionally self-provisions the account (rejected login -> register once), which is how the
 *    framework satisfies "register your own account" without a manual step or extra secrets.
 *  - Concurrent callers share one in-flight login (no thundering herd on worker start).
 *
 * Credentials never leave this class; logs reference `account.label`, never the e-mail or password.
 */
export class AuthSession implements TokenProvider {
  private token?: string;
  private expiresAt?: Date;
  private pending?: Promise<string>;
  private readonly authClient: AuthClient;

  constructor(
    request: APIRequestContext,
    readonly account: TestAccount,
    private readonly options: { autoRegister: boolean } = { autoRegister: env.autoRegister },
  ) {
    // Auth traffic gets its own log: it is attached to failures, but must never contain the password
    // (ExchangeLog redacts `password` and `token` keys at insertion time).
    this.authClient = new AuthClient(new ApiClient(request, new ExchangeLog(), null));
  }

  async getToken(): Promise<string> {
    if (this.token && !this.isExpiring()) return this.token;
    this.pending ??= this.authenticate().finally(() => (this.pending = undefined));
    return this.pending;
  }

  invalidate(): void {
    this.token = undefined;
    this.expiresAt = undefined;
  }

  private isExpiring(): boolean {
    return !!this.expiresAt && this.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;
  }

  private async authenticate(): Promise<string> {
    const creds = { email: this.account.email, password: this.account.password };
    let res = await this.authClient.login(creds);

    // Docs say an unknown user gets 404, but the live API answers 400 "Invalid email or password" for
    // unknown users too (verified 2026-11-14). So a rejected login triggers ONE registration attempt;
    // if the account already exists, registration is refused and the original login error is reported.
    if ([400, 401, 404].includes(res.status) && this.options.autoRegister) {
      const loginRes = res;
      logger.info(`Login for account "${this.account.label}" rejected (HTTP ${res.status}) - trying to register it.`);
      res = await this.authClient.register(creds);
      if (res.status === 400 || res.status === 409) {
        logger.warn(
          `Registration of account "${this.account.label}" refused (HTTP ${res.status}): ` +
            `${JSON.stringify(res.exchange.responseBody)} - reporting the original login error.`,
        );
        res = loginRes; // most likely already registered -> genuinely wrong credentials
      } else if (res.status !== 201) {
        throw new Error(
          `Auto-registration of account "${this.account.label}" failed (HTTP ${res.status}): ` +
            `${JSON.stringify(res.exchange.responseBody)}. Check EVENTHUB_PASSWORD meets the password policy.`,
        );
      }
    }

    if (res.status !== 200 && res.status !== 201) {
      throw new Error(
        `Authentication failed for account "${this.account.label}" (HTTP ${res.status}): ` +
          `${JSON.stringify(res.exchange.responseBody)}. Verify EVENTHUB_EMAIL / EVENTHUB_PASSWORD ` +
          `(set EVENTHUB_AUTO_REGISTER=true to create derived accounts automatically).`,
      );
    }

    const { token } = res.parse(AuthResponseSchema);
    this.token = token;
    this.expiresAt = jwtExpiry(token);
    return token;
  }
}
