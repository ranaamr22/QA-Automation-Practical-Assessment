import { ExchangeLog } from '@src/api/core/ExchangeLog';
import { EventHubApi } from '@src/api/EventHubApi';
import { test as authTest } from './auth.fixture';

export interface ApiFixtures {
  /** Per-test HTTP diagnostics; attached to the report automatically when the test fails. */
  exchangeLog: ExchangeLog;
  /** Clients authenticated as the worker's user. */
  api: EventHubApi;
  /** Clients authenticated as a different user (data-isolation scenarios). */
  otherUserApi: EventHubApi;
}

/** Layer 2 - API clients. Every client of every identity shares the test's exchange log. */
export const test = authTest.extend<ApiFixtures>({
  exchangeLog: [
    async ({}, use, testInfo) => {
      const log = new ExchangeLog();
      await use(log);
      if (testInfo.status !== testInfo.expectedStatus && log.size > 0) {
        await testInfo.attach('api-exchanges.json', { body: log.toJSON(), contentType: 'application/json' });
      }
    },
    { auto: true },
  ],

  api: async ({ apiRequest, exchangeLog, session }, use) => {
    await use(new EventHubApi(apiRequest, exchangeLog, session));
  },

  otherUserApi: async ({ apiRequest, exchangeLog, isolationSession }, use) => {
    await use(new EventHubApi(apiRequest, exchangeLog, isolationSession));
  },
});
