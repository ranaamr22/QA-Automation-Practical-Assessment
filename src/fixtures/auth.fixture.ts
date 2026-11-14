import { test as base, type APIRequestContext } from '@playwright/test';
import { isolationAccount, workerAccount } from '@src/auth/accounts';
import { AuthSession } from '@src/auth/AuthSession';
import { storageStateFor, type StorageState } from '@src/auth/storageState';
import { env } from '@src/config/env';

export interface AuthWorkerFixtures {
  /** Worker-scoped HTTP transport for the EventHub API (base URL ends with /api/). */
  apiRequest: APIRequestContext;
  /** The worker's own authenticated identity - shared by API clients and the browser. */
  session: AuthSession;
  /** A second, independent user (lazy: only created when a test asks for it). */
  isolationSession: AuthSession;
}

export interface AuthTestFixtures {
  /** Set `test.use({ authenticated: false })` for specs that must start logged out. */
  authenticated: boolean;
}

/**
 * Layer 1 - authentication. This is the ONLY place where identities are wired up; specs never log in.
 * Browser contexts start authenticated by overriding Playwright's built-in `storageState` option with
 * the worker session's token (no UI login, no token on disk).
 */
export const test = base.extend<AuthTestFixtures, AuthWorkerFixtures>({
  apiRequest: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({ baseURL: env.apiUrl });
      await use(ctx);
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],

  session: [
    async ({ apiRequest }, use, workerInfo) => {
      await use(new AuthSession(apiRequest, workerAccount(workerInfo.parallelIndex)));
    },
    { scope: 'worker' },
  ],

  isolationSession: [
    async ({ apiRequest }, use, workerInfo) => {
      await use(new AuthSession(apiRequest, isolationAccount(workerInfo.parallelIndex)));
    },
    { scope: 'worker' },
  ],

  authenticated: [true, { option: true }],

  storageState: async ({ authenticated, session }, use) => {
    const anonymous: StorageState = { cookies: [], origins: [] };
    await use(authenticated ? storageStateFor(await session.getToken()) : anonymous);
  },
});
