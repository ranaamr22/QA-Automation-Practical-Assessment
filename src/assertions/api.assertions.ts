import { expect, test } from '@playwright/test';
import type { BookingsClient } from '@src/api/clients/BookingsClient';
import type { ApiResponse } from '@src/api/core/ApiResponse';
import { BookingResponseSchema, type Booking, type CreateBookingRequest } from '@src/api/models/booking.model';
import { ApiErrorSchema, type ApiError } from '@src/api/models/envelope';
import type { EventModel } from '@src/api/models/event.model';
import { expectedTotal } from '@src/utils/money';

/**
 * Status assertion whose failure message contains the full (redacted) exchange,
 * so a CI failure is diagnosable from the log line alone.
 */
export function expectStatus(res: ApiResponse, expected: number | number[]): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  expect(allowed, `Unexpected HTTP status.\n${res.describe()}`).toContain(res.status);
}

/**
 * 4xx contract: documented error envelope `{ success:false, error, details? }`.
 * When `field` is given and the API returns `details`, the offending field must be named in it.
 */
export function expectClientError(res: ApiResponse, status: number, field?: string): ApiError {
  expectStatus(res, status);
  const body = res.parse(ApiErrorSchema);
  expect(body.error.length, 'error message must not be empty').toBeGreaterThan(0);
  if (field && body.details) {
    expect(
      body.details.map((d) => d.field),
      `validation details should reference "${field}".\n${res.describe()}`,
    ).toContain(field);
  }
  return body;
}

/** Business rules of a created booking, independent of the layer that created it. */
export function expectBookingMatches(booking: Booking, request: CreateBookingRequest, event: EventModel): void {
  expect.soft(booking.eventId, 'booking.eventId').toBe(request.eventId);
  expect.soft(booking.customerName, 'booking.customerName').toBe(request.customerName);
  expect.soft(booking.customerEmail, 'booking.customerEmail').toBe(request.customerEmail);
  expect.soft(booking.customerPhone, 'booking.customerPhone').toBe(request.customerPhone);
  expect.soft(booking.quantity, 'booking.quantity').toBe(request.quantity);
  expect.soft(booking.status, 'booking.status').toBe('confirmed');
  // AC2: total = unit price x quantity (to the cent).
  expect(booking.totalPrice, 'booking.totalPrice must equal price x quantity').toBeCloseTo(
    expectedTotal(event.price, request.quantity),
    2,
  );
}

/**
 * Cancellation outcome.
 *
 * The contract is ambiguous (README discrepancy D3): OpenAPI says DELETE "permanently deletes" the booking
 * (-> GET 404), while the Booking schema and UI model a `cancelled` status (-> GET 200 status=cancelled).
 * Both outcomes are accepted, the observed one is recorded as a test annotation, and anything else
 * (e.g. still `confirmed`) fails. Tighten here - in ONE place - once the Product Owner decides.
 */
export async function expectBookingCancelled(bookings: BookingsClient, id: number): Promise<'deleted' | 'status-cancelled'> {
  const res = await bookings.get(id);
  if (res.status === 404) {
    test.info().annotations.push({ type: 'cancellation-semantics', description: 'hard delete (GET -> 404)' });
    return 'deleted';
  }
  expectStatus(res, 200);
  const booking = res.parse(BookingResponseSchema).data;
  expect(booking.status, `booking #${id} should no longer be confirmed after cancellation`).toBe('cancelled');
  test.info().annotations.push({ type: 'cancellation-semantics', description: 'soft cancel (status=cancelled)' });
  return 'status-cancelled';
}

/** Rejected requests must not leave anything behind. Customer e-mails are unique per test, so this is exact. */
export async function expectNoBookingPersisted(bookings: BookingsClient, customerEmail: unknown): Promise<void> {
  if (typeof customerEmail !== 'string') return;
  const all = await bookings.listAll();
  expect(
    all.filter((b) => b.customerEmail === customerEmail).map((b) => b.bookingRef),
    'a rejected booking request must not be persisted',
  ).toEqual([]);
}

/** Flags documented-number fields that arrive as strings (contract deviation, non-blocking). */
export function annotateNumericDrift(res: ApiResponse, paths: Array<(body: any) => unknown>): void {
  for (const read of paths) {
    const value = read(res.body);
    if (typeof value === 'string') {
      test.info().annotations.push({
        type: 'contract-drift',
        description: `numeric field returned as string ("${value}") by ${res.exchange.method} ${res.exchange.url}`,
      });
    }
  }
}

/**
 * For inputs where the docs do not define the error (e.g. invalid query parameters): the API may reject
 * (4xx) or ignore/clamp the value (200), but it must never crash. A 5xx is always a defect.
 * Returns the observed status so the caller can assert the 200 branch further.
 */
export function expectHandledWithoutServerError(res: ApiResponse, allowed: number[] = [200, 400, 404]): number {
  expect(res.status, `Bad input must be handled, not crash the server.\n${res.describe()}`).toBeLessThan(500);
  expectStatus(res, allowed);
  test.info().annotations.push({ type: 'observed-status', description: `${res.status} for ${res.exchange.method} ${res.exchange.url}` });
  return res.status;
}

/** Pagination envelope must be internally consistent with the request and the returned page. */
export function expectConsistentPagination(
  pagination: { total: number; page: number; limit: number; totalPages: number },
  itemCount: number,
  requested: { page?: number; limit?: number } = {},
): void {
  const { page = 1, limit = 10 } = requested;
  expect(pagination.page, 'pagination.page echoes the request').toBe(page);
  expect(pagination.limit, 'pagination.limit echoes the request').toBe(limit);
  expect(pagination.totalPages, 'totalPages = ceil(total / limit)').toBe(Math.ceil(pagination.total / limit));
  expect(itemCount, 'never more items than the limit').toBeLessThanOrEqual(limit);
  const expectedOnPage = Math.max(0, Math.min(limit, pagination.total - (page - 1) * limit));
  expect(itemCount, `items on page ${page}`).toBe(expectedOnPage);
}
