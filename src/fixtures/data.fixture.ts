import type { Booking } from '@src/api/models/booking.model';
import type { CreateEventRequest, EventModel } from '@src/api/models/event.model';
import { toBookingRequest } from '@src/data/booking.factory';
import { BookingTracker } from '@src/data/BookingTracker';
import { buildCustomer, type Customer } from '@src/data/customer.factory';
import { EventCatalog } from '@src/data/EventCatalog';
import { buildEvent } from '@src/data/event.factory';
import { EventTracker } from '@src/data/EventTracker';
import { test as apiTest } from './api.fixture';

export interface DataFixtures {
  /** Registry of bookings created by the test; everything in it is cancelled in teardown. */
  bookingTracker: BookingTracker;
  /** Registry of custom events created by the test; everything in it is deleted in teardown. */
  eventTracker: EventTracker;
  eventCatalog: EventCatalog;
  /** An existing event with >= 10 free seats in the worker's sandbox (fresh per test). */
  bookableEvent: EventModel;
  /** Arrange helper: creates a booking via API (setup, not under test) and tracks it for cleanup. */
  seedBooking: (options?: { event?: EventModel; quantity?: number; customer?: Customer }) => Promise<Booking>;
  /** Arrange helper: creates a custom event via API with exact properties (e.g. totalSeats: 8) and tracks it. */
  seedEvent: (overrides?: Partial<CreateEventRequest>) => Promise<EventModel>;
}

/** Layer 3 - test data: selection, seeding and guaranteed cleanup. */
export const test = apiTest.extend<DataFixtures>({
  bookingTracker: async ({ api }, use, testInfo) => {
    const tracker = new BookingTracker();
    await use(tracker);
    // Runs on pass, fail and timeout.
    if (!tracker.isEmpty) {
      const report = await tracker.cleanup(api.bookings);
      testInfo.annotations.push({
        type: 'cleanup',
        description: `bookings cancelled=${report.cancelled.length} alreadyGone=${report.alreadyGone.length} failed=${report.failed.length}`,
      });
    }
  },

  // Declared to depend on bookingTracker so it is torn down FIRST: bookings are cancelled
  // (seats released) before their events are deleted.
  eventTracker: async ({ api, bookingTracker }, use, testInfo) => {
    void bookingTracker;
    const tracker = new EventTracker();
    await use(tracker);
    if (!tracker.isEmpty) {
      const report = await tracker.cleanup(api.events);
      testInfo.annotations.push({ type: 'cleanup', description: `events deleted=${report.deleted} failed=${report.failed}` });
    }
  },

  eventCatalog: async ({ api }, use) => {
    await use(new EventCatalog(api.events));
  },

  bookableEvent: async ({ eventCatalog }, use, testInfo) => {
    const event = await eventCatalog.bookable();
    testInfo.annotations.push({ type: 'event', description: `#${event.id} "${event.title}" @ ${event.price}` });
    await use(event);
  },

  seedBooking: async ({ api, bookingTracker, eventCatalog }, use) => {
    await use(async ({ event, quantity = 1, customer = buildCustomer() } = {}) => {
      const target = event ?? (await eventCatalog.bookable());
      const booking = await api.bookings.createBooking(toBookingRequest(target.id, customer, quantity));
      bookingTracker.trackId(booking.id);
      return booking;
    });
  },

  seedEvent: async ({ api, eventTracker }, use, testInfo) => {
    await use(async (overrides = {}) => {
      const event = await api.events.createEvent(buildEvent(overrides));
      eventTracker.trackId(event.id);
      testInfo.annotations.push({ type: 'seeded-event', description: `#${event.id} seats=${event.totalSeats} price=${event.price}` });
      return event;
    });
  },
});
