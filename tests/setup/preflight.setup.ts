import { test as setup, expect } from '@playwright/test';
import { credentials, env } from '@src/config/env';

/**
 * Preflight: fail fast and clearly classify ENVIRONMENT problems before hundreds of tests fail
 * with misleading errors. Read-only - no data is created here.
 */
setup('configuration is complete', async () => {
  expect(() => credentials(), 'EVENTHUB_EMAIL / EVENTHUB_PASSWORD must be configured').not.toThrow();
});

setup('EventHub API is reachable and healthy', async ({ playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: env.apiUrl });
  try {
    const res = await ctx.get('health');
    expect(res.status(), `[ENVIRONMENT] ${env.apiUrl}health is not responding with 200`).toBe(200);
    const body = await res.json();
    expect(body, '[ENVIRONMENT] API reports an unhealthy dependency').toMatchObject({ status: 'ok', dbStatus: 'connected' });
  } finally {
    await ctx.dispose();
  }
});

setup('EventHub web app is reachable', async ({ playwright }) => {
  const ctx = await playwright.request.newContext();
  try {
    const res = await ctx.get(env.baseUrl);
    expect(res.status(), `[ENVIRONMENT] ${env.baseUrl} is not reachable`).toBe(200);
  } finally {
    await ctx.dispose();
  }
});
