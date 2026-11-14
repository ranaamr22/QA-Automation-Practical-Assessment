import { expectClientError, expectNoBookingPersisted, expectStatus } from '@src/assertions/api.assertions';
import type { ApiResponse } from '@src/api/core/ApiResponse';
import { BookingResponseSchema, type CreateBookingRequest } from '@src/api/models/booking.model';
import { buildBookingRequest, buildBookingRequestWithout, toBookingRequest } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import {
  INVALID_EMAILS,
  INVALID_EVENT_IDS,
  INVALID_NAMES,
  INVALID_PHONES,
  INVALID_QUANTITIES,
  type InvalidCase,
} from '@src/data/validation-inputs';
import { expect, test } from '@src/fixtures';
import type { BookingTracker } from '@src/data/BookingTracker';
import { expectedTotal } from '@src/utils/money';

/**
 * POST /bookings - input validation against the documented CreateBookingInput schema
 * (eventId integer · customerName string minLength 2 · customerEmail format email ·
 *  customerPhone string minLength 10 · quantity integer 1..10).
 *
 * Every rejection test asserts: status, error envelope, offending field (when `details` is returned) AND that
 * nothing was persisted - a 400 that still creates a booking would be the worst possible defect.
 * If a case is wrongly ACCEPTED (a bug), the created booking is tracked and cancelled after the test.
 *
 * Tags: @proposed = rule not in the docs yet (to confirm with the PO) · @known-defect = confirmed bug,
 * marked test.fail() so the suite stays green and the test flags the day the bug is fixed.
 */
const tagsFor = (c: InvalidCase) => [...(c.source === 'proposed' ? ['@proposed'] : []), ...(c.knownDefect ? ['@known-defect'] : [])];

/** Tracks a booking that should not exist (validation bug) so cleanup removes it. */
function trackIfCreated(res: ApiResponse, tracker: BookingTracker): void {
  if (res.status === 201) tracker.trackId((res.body as { data: { id: number } }).data.id);
}

test.describe('API - booking validation (POST /bookings)', { tag: ['@api', '@validation'] }, () => {
  test.describe('required fields', () => {
    const required: Array<keyof CreateBookingRequest> = ['eventId', 'customerName', 'customerEmail', 'customerPhone', 'quantity'];
    for (const field of required) {
      test(`missing ${field} is rejected with 400`, async ({ api, bookableEvent, bookingTracker }) => {
        const payload = buildBookingRequestWithout(bookableEvent.id, field);
        const res = await api.bookings.create(payload);
        trackIfCreated(res, bookingTracker);
        expectClientError(res, 400, field);
        await expectNoBookingPersisted(api.bookings, payload.customerEmail);
      });
    }
  });

  test.describe('invalid field values', () => {
    const fieldCases: Array<{ field: keyof CreateBookingRequest; cases: InvalidCase[] }> = [
      { field: 'customerName', cases: INVALID_NAMES },
      { field: 'customerEmail', cases: INVALID_EMAILS },
      { field: 'customerPhone', cases: INVALID_PHONES },
      { field: 'quantity', cases: INVALID_QUANTITIES },
    ];

    for (const { field, cases } of fieldCases) {
      const all = field === 'quantity' ? cases : [{ title: 'empty string', value: '', source: 'documented' } as InvalidCase, ...cases];
      for (const c of all) {
        test(`${field}: ${c.title} is rejected with 400`, { tag: tagsFor(c) }, async ({ api, bookableEvent, bookingTracker }) => {
          test.fail(!!c.knownDefect, `${c.knownDefect}: accepted by the API`);
          const payload = buildBookingRequest(bookableEvent.id, { [field]: c.value });
          const res = await api.bookings.create(payload);
          trackIfCreated(res, bookingTracker);
          expectClientError(res, 400, field);
          await expectNoBookingPersisted(api.bookings, payload.customerEmail);
        });
      }
    }

    for (const c of INVALID_EVENT_IDS) {
      test(`eventId: ${c.title} is rejected with ${c.expectedStatus}`, { tag: tagsFor(c) }, async ({ api, bookableEvent, bookingTracker }) => {
        test.fail(!!c.knownDefect, `${c.knownDefect}: wrong handling of eventId`);
        const payload = buildBookingRequest(bookableEvent.id, { eventId: c.value });
        const res = await api.bookings.create(payload);
        trackIfCreated(res, bookingTracker);
        expectClientError(res, c.expectedStatus, c.expectedStatus === 400 ? 'eventId' : undefined);
        await expectNoBookingPersisted(api.bookings, payload.customerEmail);
      });
    }

    test('eventId: an existing id sent as a string ("285") is rejected with 400 (documented type integer)', { tag: '@known-defect' }, async ({
      api,
      bookableEvent,
      bookingTracker,
    }) => {
      test.fail(true, 'BUG-06: numeric string is coerced and the booking is created');
      const payload = buildBookingRequest(bookableEvent.id, { eventId: String(bookableEvent.id) });
      const res = await api.bookings.create(payload);
      trackIfCreated(res, bookingTracker);
      expectClientError(res, 400, 'eventId');
    });
  });

  test.describe('request body shape', () => {
    test('an empty JSON object is rejected with 400', async ({ api }) => {
      expectClientError(await api.bookings.create({}), 400);
    });

    test('a JSON array instead of an object is rejected with 400', async ({ api, bookableEvent }) => {
      const res = await api.bookings.create([buildBookingRequest(bookableEvent.id)] as unknown as Record<string, unknown>);
      expectClientError(res, 400);
    });

    test('malformed JSON body is rejected with 400', { tag: '@known-defect' }, async ({ api }) => {
      test.fail(true, 'BUG-07: malformed JSON answers 500 Internal server error');
      expectClientError(await api.bookings.create('{"eventId": 1,' as unknown as Record<string, unknown>), 400);
    });

    test('unknown extra fields are ignored and the booking is still created', async ({ api, bookableEvent, bookingTracker }) => {
      const res = await api.bookings.create({ ...buildBookingRequest(bookableEvent.id), couponCode: 'FREE100', notes: 'aisle seat' });
      trackIfCreated(res, bookingTracker);
      expectStatus(res, 201);
      expect(res.parse(BookingResponseSchema).data).not.toHaveProperty('couponCode');
    });
  });

  /** The other half of every limit: values that ARE valid must not be rejected (rules not too strict). */
  test.describe('valid edge values are accepted', { tag: '@boundary' }, () => {
    const base = buildCustomer();
    const cases: Array<{ title: string; overrides: Partial<CreateBookingRequest> }> = [
      { title: 'a 2-character name (minimum)', overrides: { customerName: 'Al' } },
      { title: 'a name with accents and an apostrophe', overrides: { customerName: "Zoë O'Brien-Núñez" } },
      { title: 'a phone with exactly 10 digits (minimum)', overrides: { customerPhone: '9876543210' } },
      { title: 'the documented phone format "+91-9876543210"', overrides: { customerPhone: '+91-9876543210' } },
      { title: 'an e-mail on a sub-domain', overrides: { customerEmail: base.email.replace('@example.com', '@mail.example.com') } },
      { title: 'an upper-case e-mail', overrides: { customerEmail: base.email.toUpperCase() } },
    ];
    for (const { title, overrides } of cases) {
      test(`accepts ${title}`, async ({ api, bookableEvent, bookingTracker }) => {
        const payload = { ...toBookingRequest(bookableEvent.id, buildCustomer(), 1), ...overrides };
        const res = await api.bookings.create(payload);
        trackIfCreated(res, bookingTracker);
        expectStatus(res, 201);
        const booking = res.parse(BookingResponseSchema).data;
        expect(booking.customerName).toBe(payload.customerName);
        expect(booking.customerPhone, 'phone is stored exactly as sent').toBe(payload.customerPhone);
      });
    }
  });

  /**
   * Security: server-controlled fields must never be settable by the client ("mass assignment").
   * A client that could send totalPrice: 1 would buy tickets for $1.
   */
  test.describe('server-controlled fields cannot be set by the client', { tag: '@security' }, () => {
    test('totalPrice, status, bookingRef and id in the request are ignored', async ({ api, bookableEvent, bookingTracker }) => {
      const quantity = 2;
      const res = await api.bookings.create({
        ...buildBookingRequest(bookableEvent.id, { quantity }),
        totalPrice: 1,
        status: 'cancelled',
        bookingRef: 'EVT-HACK01',
        id: 1,
      });
      trackIfCreated(res, bookingTracker);
      // Rejecting the request (400) would also be acceptable - but a 201 must ignore the injected values.
      expectStatus(res, [201, 400]);
      if (res.status === 201) {
        const booking = res.parse(BookingResponseSchema).data;
        expect(booking.totalPrice, 'price is always calculated by the server').toBeCloseTo(expectedTotal(bookableEvent.price, quantity), 2);
        expect(booking.status).toBe('confirmed');
        expect(booking.bookingRef).not.toBe('EVT-HACK01');
        expect(booking.id).not.toBe(1);
      }
    });

    test('userId in the request cannot assign the booking to another account', async ({ api, bookableEvent, bookingTracker }) => {
      const res = await api.bookings.create({ ...buildBookingRequest(bookableEvent.id), userId: 1 });
      trackIfCreated(res, bookingTracker);
      expectStatus(res, [201, 400]);
      if (res.status === 201) {
        const created = res.body as { data: { id: number; userId?: number } };
        expect(created.data.userId, 'booking belongs to the caller, not to the injected user').not.toBe(1);
        // ... and the caller can still read it (it was not moved to user 1).
        expectStatus(await api.bookings.get(created.data.id), 200);
      }
    });
  });
});
