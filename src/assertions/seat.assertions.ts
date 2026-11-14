import { expect, test } from '@playwright/test';
import type { EventHubApi } from '@src/api/EventHubApi';
import type { EventBookingPage } from '@src/ui/pages/EventBookingPage';

/**
 * Seat counters of shared (featured) events are changed by OTHER users of the public sandbox at any time
 * (observed: -2 seats within minutes while no test was running). An exact "before - quantity" over a long
 * window is therefore unreliable. These helpers keep the assertions exact, but measure dynamically.
 */

/** Current available seats of an event, straight from the API (source of truth). */
export async function availableSeats(api: EventHubApi, eventId: number): Promise<number> {
  return (await api.events.getEvent(eventId)).availableSeats;
}

/**
 * Asserts that `act` changes an event's available seats by exactly `expectedChange`.
 * The counter is read immediately before and after the action, so only a change by another user inside
 * that short window can interfere. If the change differs, the whole measurement is repeated with a fresh
 * action (`prepare` + `act`). A real defect fails every attempt; random interference does not repeat.
 */
export async function expectSeatChange<T = void>(options: {
  api: EventHubApi;
  eventId: number;
  expectedChange: number;
  /** Runs before the "before" read (e.g. create the booking that `act` will cancel). */
  prepare?: () => Promise<T>;
  act: (prepared: T) => Promise<void>;
  attempts?: number;
  description: string;
}): Promise<void> {
  const { api, eventId, expectedChange, prepare, act, attempts = 3, description } = options;
  const observed: number[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const prepared = (prepare ? await prepare() : undefined) as T;
    const before = await availableSeats(api, eventId);
    await act(prepared);
    const after = await availableSeats(api, eventId);
    observed.push(after - before);
    if (after - before === expectedChange) {
      if (attempt > 1) {
        test.info().annotations.push({
          type: 'shared-data-interference',
          description: `${description}: retried - earlier attempt(s) saw ${observed.slice(0, -1).join(', ')} (another user changed the seats)`,
        });
      }
      return;
    }
  }
  expect(observed, `${description}: seat change per attempt (expected ${expectedChange} every time)`).toContain(expectedChange);
}

/**
 * Asserts that the event page shows the live seat count of the API ("46 / 10000 seats").
 * The page is reloaded until UI and API agree, so another user's booking between the two reads cannot
 * cause a false failure - but a page that shows a wrong number never passes. Returns the agreed value.
 */
export async function expectEventPageShowsLiveSeats(
  eventPage: EventBookingPage,
  api: EventHubApi,
  eventId: number,
): Promise<{ available: number; total?: number }> {
  let seats: { available: number; total?: number } = { available: -1 };
  await expect(async () => {
    await eventPage.open(eventId);
    const shown = await eventPage.seats();
    const live = await api.events.getEvent(eventId);
    expect(shown, 'event page "Available" tile = API seat count').toEqual({ available: live.availableSeats, total: live.totalSeats });
    seats = shown;
  }).toPass({ intervals: [500, 1_000, 2_000], timeout: 20_000 });
  return seats;
}
