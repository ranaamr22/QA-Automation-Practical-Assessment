import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

/**
 * One run id per `playwright test` invocation. Set here (main process) BEFORE workers start, so all
 * workers inherit it. It is embedded in every customer e-mail the suite creates, which lets the cleanup
 * teardown remove leftovers of *this* run only.
 */
process.env.TEST_RUN_ID ??= process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
  : Date.now().toString(36);

const isCI = env.isCI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  /**
   * One retry in CI only: the target is a shared public environment (latency spikes, rate limits).
   * Retried-then-passed tests are reported as "flaky" in the HTML report - visible, not hidden.
   */
  retries: isCI ? 1 : 0,
  /**
   * Kept low on purpose: every worker owns a sandbox account, and the shared public environment should
   * not be hammered. Raise locally with --workers if needed.
   */
  workers: isCI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ...(isCI ? ([['github']] as const) : []),
  ],

  use: {
    baseURL: env.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    testIdAttribute: 'data-testid',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /preflight\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /cleanup\.teardown\.ts/,
    },
    {
      name: 'api',
      testDir: './tests/api',
      dependencies: ['setup'],
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
  ],
});
