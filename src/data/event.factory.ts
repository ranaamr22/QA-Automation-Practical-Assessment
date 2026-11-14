import { randomBytes } from 'node:crypto';
import type { CreateEventRequest } from '@src/api/models/event.model';
import { runMarker } from './customer.factory';

/** Prefix of every event title created by the suite -> recognisable and sweepable. */
export const TEST_EVENT_PREFIX = 'QA-Auto';

/**
 * Test-data event for BOOKING scenarios that need exact properties the shared catalogue cannot guarantee
 * (e.g. exactly 8 seats, a $0 or $19.99 price). Created via API as setup only - event management itself
 * is out of scope - and deleted again by EventTracker.
 * Title embeds the run marker + random id: unique, searchable and attributable to the run that created it.
 */
export function buildEvent(overrides: Partial<CreateEventRequest> = {}): CreateEventRequest {
  const id = randomBytes(3).toString('hex');
  return {
    title: `${TEST_EVENT_PREFIX} ${runMarker()} ${id}`,
    description: 'Created by automated tests - safe to delete.',
    category: 'Workshop',
    venue: 'Automation Hall',
    city: 'Testville',
    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    price: 250,
    totalSeats: 50,
    ...overrides,
  };
}
