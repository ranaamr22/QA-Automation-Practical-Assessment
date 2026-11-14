import type { EventsClient } from '@src/api/clients/EventsClient';
import type { EventModel } from '@src/api/models/event.model';
import { QUANTITY } from './booking.factory';

/**
 * Chooses events for tests from the account's live catalogue instead of hard-coding IDs.
 *
 * Why not hard-coded IDs: each user has an isolated sandbox, so IDs are not guaranteed to be stable or
 * shared across accounts. Why not create events: event management is outside US-114 and would add
 * shared-environment side effects (sandbox caps custom events at 6, evicting the oldest).
 *
 * Preference order: "featured" (isStatic) events - documented in the UI as "always available for practice"
 * - then any event with enough seats to exercise the maximum quantity (10).
 */
export class EventCatalog {
  constructor(private readonly events: EventsClient) {}

  async bookable(minSeats: number = QUANTITY.MAX): Promise<EventModel> {
    const [event] = await this.bookableEvents(1, minSeats);
    return event;
  }

  /** Up to `count` bookable events with DISTINCT prices (for multi-price scenarios, AC9). */
  async withDistinctPrices(count: number, minSeats: number = QUANTITY.MAX): Promise<EventModel[]> {
    const candidates = await this.candidates(minSeats);
    const byPrice = new Map<number, EventModel>();
    for (const e of candidates) if (!byPrice.has(e.price)) byPrice.set(e.price, e);
    return [...byPrice.values()].slice(0, count);
  }

  /** Existing events with fewer seats left than the per-booking maximum (e.g. "World Tech Summit": 8). */
  async withLimitedSeats(): Promise<EventModel[]> {
    const all = await this.events.listEvents({ limit: 100 });
    return all.filter((e) => e.availableSeats > 0 && e.availableSeats < QUANTITY.MAX);
  }

  private async bookableEvents(count: number, minSeats: number): Promise<EventModel[]> {
    const candidates = await this.candidates(minSeats);
    if (candidates.length < count) {
      throw new Error(
        `Test data precondition failed: need ${count} event(s) with >= ${minSeats} available seats and price > 0, ` +
          `found ${candidates.length}. The account's sandbox may be exhausted - inspect it via GET /events.`,
      );
    }
    return candidates.slice(0, count);
  }

  private async candidates(minSeats: number): Promise<EventModel[]> {
    const all = await this.events.listEvents({ limit: 100 });
    // NOTE: no "upcoming" filter. Verified 2026-11-14: every seeded (featured) event is dated in the
    // past, yet the app still lists and sells them (README D15). Filtering would leave no test data.
    return all
      .filter((e) => e.availableSeats >= minSeats && e.price > 0)
      .sort((a, b) => Number(b.isStatic ?? false) - Number(a.isStatic ?? false));
  }
}
