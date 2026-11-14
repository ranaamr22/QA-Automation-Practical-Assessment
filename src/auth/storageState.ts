import type { BrowserContextOptions } from '@playwright/test';
import { env } from '@src/config/env';

/** Key the SPA reads on boot (verified in the production bundle: AuthProvider + axios interceptor). */
export const TOKEN_STORAGE_KEY = 'eventhub_token';

export type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

/**
 * Builds an in-memory Playwright storage state that makes the SPA start authenticated.
 *
 * Why API login + injected localStorage instead of a UI login per test / a setup project:
 *  - The app's auth is a bearer token in localStorage (no cookies), so this is exactly what a real
 *    login produces - no behaviour is faked.
 *  - It reuses the same AuthSession as the API layer -> one token, one identity per worker, which is
 *    what makes UI <-> API integration checks meaningful.
 *  - The state is an object, never written to disk, so tokens cannot leak via artifacts.
 *  The login *page* itself is outside US-114 scope; session-expiry behaviour is covered separately.
 */
export function storageStateFor(token: string): StorageState {
  return {
    cookies: [],
    origins: [{ origin: env.baseUrl, localStorage: [{ name: TOKEN_STORAGE_KEY, value: token }] }],
  };
}
