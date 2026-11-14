import type { Page, Request } from '@playwright/test';

/**
 * Passive observer of the SPA's API calls (no mocking). Lets UI tests assert facts that are invisible
 * on screen, e.g. "client-side validation stopped the request" or "double click sent exactly one POST".
 */
export class RequestRecorder {
  private readonly matched: Request[] = [];

  constructor(page: Page, method: string, pathPattern: RegExp) {
    page.on('request', (req) => {
      if (req.method() === method && pathPattern.test(new URL(req.url()).pathname)) this.matched.push(req);
    });
  }

  /** Records POST /api/bookings (exact path - not /bookings/{id}). */
  static bookingCreation(page: Page): RequestRecorder {
    return new RequestRecorder(page, 'POST', BOOKING_CREATE_ROUTE);
  }

  get count(): number {
    return this.matched.length;
  }
}

/** Matches only the booking-creation endpoint (for page.route / recorders). */
export const BOOKING_CREATE_ROUTE = /\/api\/bookings\/?$/;

/** Matches the bookings list endpoint (GET /api/bookings with any query). */
export const BOOKINGS_LIST_ROUTE = /\/api\/bookings(\?.*)?$/;
