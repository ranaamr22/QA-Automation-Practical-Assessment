import type { BookingsClient } from '@src/api/clients/BookingsClient';
import { logger } from '@src/utils/logger';

export interface CleanupReport {
  cancelled: string[];
  alreadyGone: string[];
  failed: Array<{ item: string; reason: string }>;
}

/**
 * Records every booking a test creates (by id when created via API, by reference when created via UI)
 * and cancels them in fixture teardown - which Playwright runs even if the test failed or timed out.
 *
 * Safety rules:
 *  - Only cancels what was explicitly tracked -> never touches data owned by other tests/users.
 *  - 404 on cancel is treated as success (the test itself may have cancelled it).
 *  - Failures are collected and reported (annotation + log), not thrown, so a cleanup hiccup does not
 *    mask the real test result; the run-level sweep in the teardown project is the safety net.
 */
export class BookingTracker {
  private readonly ids = new Set<number>();
  private readonly refs = new Set<string>();

  trackId(id: number): void {
    this.ids.add(id);
  }

  trackRef(ref: string): void {
    this.refs.add(ref);
  }

  get isEmpty(): boolean {
    return this.ids.size === 0 && this.refs.size === 0;
  }

  async cleanup(bookings: BookingsClient): Promise<CleanupReport> {
    const report: CleanupReport = { cancelled: [], alreadyGone: [], failed: [] };

    for (const ref of this.refs) {
      try {
        const booking = await bookings.findByRef(ref);
        if (booking && booking.status !== 'cancelled') this.ids.add(booking.id);
        else report.alreadyGone.push(ref);
      } catch (error) {
        report.failed.push({ item: ref, reason: String(error) });
      }
    }

    for (const id of this.ids) {
      try {
        const res = await bookings.cancel(id);
        if (res.ok) report.cancelled.push(`#${id}`);
        else if (res.status === 404) report.alreadyGone.push(`#${id}`);
        else report.failed.push({ item: `#${id}`, reason: `HTTP ${res.status}` });
      } catch (error) {
        report.failed.push({ item: `#${id}`, reason: String(error) });
      }
    }

    if (report.failed.length) logger.warn('Booking cleanup incomplete', report.failed);
    this.ids.clear();
    this.refs.clear();
    return report;
  }
}
