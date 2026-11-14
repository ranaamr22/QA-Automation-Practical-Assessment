import type { EventsClient } from '@src/api/clients/EventsClient';

/**
 * Same contract as BookingTracker, for the setup events seeded by booking tests: deleted in fixture
 * teardown regardless of the test outcome (bookings are cancelled first by BookingTracker).
 */
export class EventTracker {
  private readonly ids = new Set<number>();

  trackId(id: number): void {
    this.ids.add(id);
  }

  get isEmpty(): boolean {
    return this.ids.size === 0;
  }

  async cleanup(events: EventsClient): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;
    for (const id of this.ids) {
      const res = await events.delete(id).catch(() => undefined);
      if (res && (res.ok || res.status === 404)) deleted++;
      else failed++;
    }
    this.ids.clear();
    return { deleted, failed };
  }
}
