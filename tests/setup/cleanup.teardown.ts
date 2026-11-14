import { test as teardown } from '@playwright/test';
import { BookingsClient } from '@src/api/clients/BookingsClient';
import { EventsClient } from '@src/api/clients/EventsClient';
import { TEST_EVENT_PREFIX } from '@src/data/event.factory';
import { ApiClient } from '@src/api/core/ApiClient';
import { ExchangeLog } from '@src/api/core/ExchangeLog';
import { isolationAccount, workerAccount, type TestAccount } from '@src/auth/accounts';
import { AuthSession } from '@src/auth/AuthSession';
import { env } from '@src/config/env';
import { runMarker } from '@src/data/customer.factory';
import { logger } from '@src/utils/logger';

/** Every suite-created booking e-mail starts with this ("eventhub.qa+run-<id>-<suffix>@example.com"). */
const SUITE_EMAIL_PREFIX = 'eventhub.qa+run-';
/** Every suite-created event title starts with this ("QA-Auto run-<id> <suffix>"). */
const SUITE_EVENT_PREFIX = `${TEST_EVENT_PREFIX} run-`;
/** Data of OTHER runs is only removed once it is this old, so a run still in progress is never disturbed. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/** True only for a known, old timestamp - missing or unparsable dates are never treated as stale. */
function isStale(createdAt: string | undefined): boolean {
  const created = Date.parse(createdAt ?? '');
  return !Number.isNaN(created) && Date.now() - created > STALE_AFTER_MS;
}

/**
 * Safety net after all projects finished. Per-test fixtures already cancel what they create; this sweep
 * catches anything left behind by crashed workers, failed cleanups or interrupted earlier runs.
 *
 * Scope is strictly limited to:
 *  - accounts owned by this framework (derived worker/isolation accounts of this namespace), and
 *  - data carrying the suite's marker: bookings whose customer e-mail starts with "eventhub.qa+run-" and
 *    custom (non-featured) events whose title starts with "QA-Auto run-";
 *  - of that data: everything from THIS run, plus leftovers of earlier runs older than 60 minutes.
 * Other users' data, featured events and bookings made by hand are never touched.
 */
teardown('cancel leftover bookings created by this run', async ({ playwright }, testInfo) => {
  const ctx = await playwright.request.newContext({ baseURL: env.apiUrl });
  const marker = runMarker();
  const workers = Math.max(1, testInfo.config.workers);
  const accounts = new Map<string, TestAccount>();
  for (let i = 0; i < workers; i++) {
    for (const account of [workerAccount(i), isolationAccount(i)]) accounts.set(account.email, account);
  }

  let current = 0;
  let older = 0;
  const count = (fromThisRun: boolean) => (fromThisRun ? current++ : older++);
  try {
    for (const account of accounts.values()) {
      try {
        const http = new ApiClient(ctx, new ExchangeLog(), new AuthSession(ctx, account, { autoRegister: false }));
        const bookings = new BookingsClient(http);
        const leftovers = (await bookings.listAll({ status: 'confirmed' })).filter(
          (b) => b.customerEmail.startsWith(SUITE_EMAIL_PREFIX) && (b.customerEmail.includes(marker) || isStale(b.createdAt)),
        );
        for (const booking of leftovers) {
          const res = await bookings.cancel(booking.id);
          if (res.ok || res.status === 404) count(booking.customerEmail.includes(marker));
        }
        // Custom events created by the suite; featured (isStatic) events are never touched.
        const events = new EventsClient(http);
        const ownEvents = (await events.listEvents({ search: TEST_EVENT_PREFIX, limit: 100 })).filter(
          (e) => !e.isStatic && e.title.startsWith(SUITE_EVENT_PREFIX) && (e.title.includes(marker) || isStale(e.createdAt)),
        );
        for (const event of ownEvents) {
          const res = await events.delete(event.id);
          if (res.ok || res.status === 404) count(event.title.includes(marker));
        }
      } catch (error) {
        const message = String(error).split('\n')[0];
        // An account that was never used (e.g. the isolation user when no cross-user test ran) does not
        // exist yet and cannot hold leftovers - expected, not a problem. Anything else is worth a warning.
        if (message.includes('Authentication failed')) {
          logger.info(`Cleanup sweep: account "${account.label}" not registered / not used - nothing to clean.`);
        } else {
          logger.warn(`Cleanup sweep skipped account "${account.label}": ${message}`);
        }
      }
    }
  } finally {
    await ctx.dispose();
  }
  testInfo.annotations.push({
    type: 'cleanup-sweep',
    description: `${current} leftover item(s) of ${marker} and ${older} of older runs (> 60 min) removed`,
  });
});
