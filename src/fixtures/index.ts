import { BookingDetailsPage } from '@src/ui/pages/BookingDetailsPage';
import { EventBookingPage } from '@src/ui/pages/EventBookingPage';
import { EventsListPage } from '@src/ui/pages/EventsListPage';
import { HomePage } from '@src/ui/pages/HomePage';
import { MyBookingsPage } from '@src/ui/pages/MyBookingsPage';
import { test as dataTest } from './data.fixture';

export interface PageFixtures {
  homePage: HomePage;
  eventsListPage: EventsListPage;
  eventPage: EventBookingPage;
  myBookingsPage: MyBookingsPage;
  bookingDetailsPage: BookingDetailsPage;
}

/**
 * Layer 4 - page objects. The public entry point for ALL specs:
 *
 *   import { test, expect } from '@src/fixtures';
 *
 * Layering (each file extends the previous one):
 *   auth.fixture  -> identities, authenticated storageState (worker-scoped)
 *   api.fixture   -> API clients + exchange diagnostics      (test-scoped)
 *   data.fixture  -> event selection, seeding, cleanup       (test-scoped)
 *   index         -> page objects                            (test-scoped)
 */
export const test = dataTest.extend<PageFixtures>({
  homePage: async ({ page }, use) => use(new HomePage(page)),
  eventsListPage: async ({ page }, use) => use(new EventsListPage(page)),
  eventPage: async ({ page }, use) => use(new EventBookingPage(page)),
  myBookingsPage: async ({ page }, use) => use(new MyBookingsPage(page)),
  bookingDetailsPage: async ({ page }, use) => use(new BookingDetailsPage(page)),
});

export { expect } from '@playwright/test';
