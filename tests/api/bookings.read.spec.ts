import {
  expectClientError,
  expectConsistentPagination,
  expectHandledWithoutServerError,
  expectStatus,
} from '@src/assertions/api.assertions';
import { BookingListResponseSchema, BookingResponseSchema } from '@src/api/models/booking.model';
import { expect, test } from '@src/fixtures';

/**
 * Read endpoints of bookings (the API side of AC3 "the booking appears in My Bookings"):
 *   GET /bookings              paginated list; filters eventId, status; page >= 1; 1 <= limit <= 100
 *   GET /bookings/{id}         single booking
 *   GET /bookings/ref/{ref}    look-up by reference
 * Retrieval of a fresh booking by id/ref/list is covered in bookings.create.spec.ts; this file covers
 * filters, pagination, response content and invalid input.
 */
test.describe('API - read bookings', { tag: ['@api', '@bookings-read'] }, () => {
  test.describe('GET /bookings - filters and pagination', () => {
    test('every listed booking includes its full event details (documented)', async ({ api, seedBooking }) => {
      const booking = await seedBooking();
      const res = await api.bookings.list({ eventId: booking.eventId });
      expectStatus(res, 200);
      const listed = res.parse(BookingListResponseSchema).data.find((b) => b.id === booking.id);
      expect(listed, 'seeded booking is listed').toBeDefined();
      expect(listed!.event, 'each booking carries its event').toBeDefined();
      expect(listed!.event!.id).toBe(booking.eventId);
    });

    test('eventId filter returns only bookings of that event', async ({ api, seedEvent, seedBooking, bookableEvent }) => {
      const event = await seedEvent({ totalSeats: 20 });
      const mine = [await seedBooking({ event }), await seedBooking({ event })];
      await seedBooking({ event: bookableEvent }); // must NOT appear

      const res = await api.bookings.list({ eventId: event.id });
      expectStatus(res, 200);
      const data = res.parse(BookingListResponseSchema).data;
      expect(data.map((b) => b.eventId), 'only the filtered event').toEqual(data.map(() => event.id));
      expect(data.map((b) => b.id).sort()).toEqual(mine.map((b) => b.id).sort());
    });

    test('status=confirmed returns only confirmed bookings', async ({ api, seedBooking }) => {
      await seedBooking();
      const res = await api.bookings.list({ status: 'confirmed', limit: 100 });
      expectStatus(res, 200);
      const statuses = res.parse(BookingListResponseSchema).data.map((b) => b.status);
      expect(statuses.length).toBeGreaterThan(0);
      expect(new Set(statuses)).toEqual(new Set(['confirmed']));
    });

    test('status=cancelled never returns confirmed bookings', async ({ api, seedBooking }) => {
      const booking = await seedBooking();
      expectStatus(await api.bookings.cancel(booking.id), 200);
      const res = await api.bookings.list({ status: 'cancelled', limit: 100 });
      expectStatus(res, 200);
      const data = res.parse(BookingListResponseSchema).data;
      expect(data.filter((b) => b.status !== 'cancelled'), 'only cancelled bookings').toEqual([]);
      test.info().annotations.push({ type: 'cancel-semantics', description: `${data.length} cancelled booking(s) kept in history` });
    });

    test('paginates consistently: limit=2 over 3 bookings gives pages of 2, 1 and 0', async ({ api, seedEvent, seedBooking }) => {
      const event = await seedEvent({ totalSeats: 20 });
      for (let i = 0; i < 3; i++) await seedBooking({ event });

      const seen: number[] = [];
      for (const page of [1, 2, 3]) {
        const res = await api.bookings.list({ eventId: event.id, page, limit: 2 });
        expectStatus(res, 200);
        const body = res.parse(BookingListResponseSchema);
        expect(body.pagination.total, 'total counts all matching bookings').toBe(3);
        expectConsistentPagination(body.pagination, body.data.length, { page, limit: 2 });
        seen.push(...body.data.map((b) => b.id));
      }
      expect(new Set(seen).size, 'no booking appears on two pages').toBe(3);
    });

    test('defaults to page 1 and limit 10 when no pagination is sent (documented defaults)', async ({ api }) => {
      const res = await api.bookings.list();
      expectStatus(res, 200);
      const body = res.parse(BookingListResponseSchema);
      expectConsistentPagination(body.pagination, body.data.length, { page: 1, limit: 10 });
    });

    // Documented constraints: page >= 1, 1 <= limit <= 100, status in [confirmed, cancelled], eventId integer.
    // The docs list no 400 for this endpoint, so rejecting OR safely ignoring/clamping is accepted - a 500 is not.
    const invalidQueries: Array<{ query: Record<string, string | number>; bug?: string }> = [
      { query: { page: 0 } },
      { query: { page: -1 }, bug: 'BUG-08' },
      { query: { limit: 0 } },
      { query: { limit: 101 }, bug: 'BUG-09' },
      { query: { limit: 'abc' } },
      { query: { status: 'pending' } },
      { query: { eventId: 'abc' }, bug: 'BUG-08' },
    ];
    for (const { query, bug } of invalidQueries) {
      test(`handles the invalid query ${JSON.stringify(query)} without a server error`, { tag: ['@negative', ...(bug ? ['@known-defect'] : [])] }, async ({ api }) => {
        test.fail(!!bug, `${bug}: query ${JSON.stringify(query)} is not handled`);
        const res = await api.bookings.list(query);
        if (expectHandledWithoutServerError(res, [200, 400]) === 200) {
          const body = res.parse(BookingListResponseSchema);
          expect(body.pagination.limit, 'a clamped limit stays within 1..100').toBeLessThanOrEqual(100);
          expect(body.pagination.limit).toBeGreaterThanOrEqual(1);
          expect(body.pagination.page).toBeGreaterThanOrEqual(1);
          if ('status' in query) expect(body.data.filter((b) => b.status === query.status)).toEqual([]);
        }
      });
    }
  });

  test.describe('GET /bookings/{id}', () => {
    test('returns the booking with its event details', async ({ api, seedBooking }) => {
      const booking = await seedBooking({ quantity: 2 });
      const res = await api.bookings.get(booking.id);
      expectStatus(res, 200);
      const fetched = res.parse(BookingResponseSchema).data;
      expect(fetched).toMatchObject({ id: booking.id, bookingRef: booking.bookingRef, quantity: 2, customerName: booking.customerName });
      expect(fetched.event?.id).toBe(booking.eventId);
    });

    test('an unknown id returns 404 with an error message', { tag: '@negative' }, async ({ api }) => {
      expectClientError(await api.bookings.get(999_999_999), 404);
    });

    const invalidIds: Array<{ id: string; bug?: string }> = [{ id: 'abc', bug: 'BUG-08' }, { id: '0' }, { id: '-1' }, { id: '1.5' }, { id: '1 OR 1=1', bug: 'BUG-08' }];
    for (const { id, bug } of invalidIds) {
      test(`the invalid id "${id}" is rejected with 400/404, never a server error`, { tag: ['@negative', ...(bug ? ['@known-defect'] : [])] }, async ({ api }) => {
        test.fail(!!bug, `${bug}: GET /bookings/${id} answers 500`);
        expectHandledWithoutServerError(await api.bookings.get(encodeURIComponent(id)), [400, 404]);
      });
    }

    test('a cancelled booking can no longer be fetched as confirmed', async ({ api, seedBooking }) => {
      const booking = await seedBooking();
      expectStatus(await api.bookings.cancel(booking.id), 200);
      const res = await api.bookings.get(booking.id);
      expectStatus(res, [200, 404]); // documented "permanently deletes" -> 404; status model -> cancelled (D3)
      if (res.status === 200) expect(res.parse(BookingResponseSchema).data.status).toBe('cancelled');
    });
  });

  test.describe('GET /bookings/ref/{ref}', () => {
    test('returns the booking with its event details', async ({ api, seedBooking }) => {
      const booking = await seedBooking();
      const res = await api.bookings.getByRef(booking.bookingRef);
      expectStatus(res, 200);
      const fetched = res.parse(BookingResponseSchema).data;
      expect(fetched.id).toBe(booking.id);
      expect(fetched.event?.id).toBe(booking.eventId);
    });

    test('a lower-case reference finds the booking or returns 404 - never a server error', async ({ api, seedBooking }) => {
      const booking = await seedBooking();
      const res = await api.bookings.getByRef(booking.bookingRef.toLowerCase());
      if (expectHandledWithoutServerError(res, [200, 404]) === 200) {
        expect(res.parse(BookingResponseSchema).data.id).toBe(booking.id);
      }
    });

    for (const ref of ["' OR '1'='1", '../../events', 'X'.repeat(500), '%00']) {
      test(`the malicious/odd reference ${JSON.stringify(ref.slice(0, 20))} returns 404, never data or a server error`, {
        tag: ['@negative', '@security'],
      }, async ({ api }) => {
        expectHandledWithoutServerError(await api.bookings.getByRef(ref), [400, 404]);
      });
    }

    test('the reference of a cancelled booking no longer returns a confirmed booking', async ({ api, seedBooking }) => {
      const booking = await seedBooking();
      expectStatus(await api.bookings.cancel(booking.id), 200);
      const res = await api.bookings.getByRef(booking.bookingRef);
      expectStatus(res, [200, 404]);
      if (res.status === 200) expect(res.parse(BookingResponseSchema).data.status).toBe('cancelled');
    });
  });
});
