import { annotateNumericDrift, expectBookingMatches, expectStatus } from '@src/assertions/api.assertions';
import { expectSeatChange } from '@src/assertions/seat.assertions';
import { BOOKING_REF_PATTERN, BookingResponseSchema } from '@src/api/models/booking.model';
import { QUANTITY, toBookingRequest } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';

/** AC5 (+AC1/AC2 business rules) through POST /bookings. */
test.describe('API - create booking (POST /bookings)', { tag: ['@api', '@booking'] }, () => {
  test('creates a confirmed booking with a reference, correct event, quantity and total', { tag: '@smoke' }, async ({
    api,
    bookableEvent,
    bookingTracker,
  }) => {
    const request = toBookingRequest(bookableEvent.id, buildCustomer(), 2);

    const res = await api.bookings.create(request);

    expectStatus(res, 201);
    const body = res.parse(BookingResponseSchema);
    bookingTracker.trackId(body.data.id);
    expect(body.data.bookingRef).toMatch(BOOKING_REF_PATTERN);
    expectBookingMatches(body.data, request, bookableEvent);
    annotateNumericDrift(res, [(b) => b?.data?.totalPrice, (b) => b?.data?.event?.price]);
  });

  for (const quantity of [QUANTITY.MIN, QUANTITY.MAX]) {
    test(`boundary: quantity ${quantity} is accepted and priced correctly`, { tag: '@boundary' }, async ({
      api,
      bookableEvent,
      bookingTracker,
    }) => {
      const request = toBookingRequest(bookableEvent.id, buildCustomer(), quantity);
      const res = await api.bookings.create(request);
      expectStatus(res, 201);
      const booking = res.parse(BookingResponseSchema).data;
      bookingTracker.trackId(booking.id);
      expectBookingMatches(booking, request, bookableEvent);
    });
  }

  test('created booking is persisted and retrievable by id, by reference and in the list', async ({ api, seedBooking }) => {
    const created = await seedBooking({ quantity: 3 });

    const byId = await api.bookings.get(created.id);
    expectStatus(byId, 200);
    const byRef = await api.bookings.getByRef(created.bookingRef);
    expectStatus(byRef, 200);

    const fromId = byId.parse(BookingResponseSchema).data;
    const fromRef = byRef.parse(BookingResponseSchema).data;
    for (const fetched of [fromId, fromRef]) {
      expect(fetched).toMatchObject({
        id: created.id,
        bookingRef: created.bookingRef,
        eventId: created.eventId,
        quantity: created.quantity,
        totalPrice: created.totalPrice,
        status: 'confirmed',
      });
    }

    const list = await api.bookings.listAll();
    expect(list.map((b) => b.bookingRef)).toContain(created.bookingRef);
  });

  test('booking decrements the event available seats by the booked quantity', async ({ api, bookableEvent, seedBooking }) => {
    await expectSeatChange({
      api,
      eventId: bookableEvent.id,
      expectedChange: -4,
      act: async () => {
        await seedBooking({ event: bookableEvent, quantity: 4 });
      },
      description: 'documented: seats are decremented atomically',
    });
  });

  test('every booking gets a unique reference', async ({ seedBooking }) => {
    const refs = [(await seedBooking()).bookingRef, (await seedBooking()).bookingRef];
    expect(new Set(refs).size).toBe(refs.length);
  });

  /**
   * Characterisation of duplicate submissions (PO question Q7). There is no idempotency key in the API.
   * Either outcome is accepted, the observed one is recorded, so a behaviour change is visible in reports.
   */
  test('identical consecutive submissions: duplicate handling is characterised', { tag: '@duplicate' }, async ({
    api,
    bookableEvent,
    bookingTracker,
  }) => {
    const request = toBookingRequest(bookableEvent.id, buildCustomer(), 1);
    const first = await api.bookings.create(request);
    expectStatus(first, 201);
    bookingTracker.trackId(first.parse(BookingResponseSchema).data.id);

    const second = await api.bookings.create(request);
    expectStatus(second, [201, 400, 409]);
    if (second.status === 201) {
      const dup = second.parse(BookingResponseSchema).data;
      bookingTracker.trackId(dup.id);
      expect(dup.bookingRef, 'a duplicate, if allowed, must still be a distinct booking').not.toBe(
        first.parse(BookingResponseSchema).data.bookingRef,
      );
    }
    test.info().annotations.push({
      type: 'duplicate-submission',
      description: second.status === 201 ? 'accepted as a second booking (no duplicate prevention)' : `rejected with ${second.status}`,
    });
  });

  test('the response contains the documented fields and a confirmation message', async ({ api, bookableEvent, bookingTracker }) => {
    const res = await api.bookings.create(toBookingRequest(bookableEvent.id, buildCustomer(), 1));
    expectStatus(res, 201);
    const body = res.parse(BookingResponseSchema);
    bookingTracker.trackId(body.data.id);
    expect(body.message, 'documented: "Booking confirmed"').toMatch(/booking confirmed/i);
    expect(body.data.event?.id, 'response embeds the booked event').toBe(bookableEvent.id);
    expect(Date.parse(body.data.createdAt ?? ''), 'createdAt is an ISO date').not.toBeNaN();
  });

  /**
   * PO question Q10 / D15: may an event that already took place be booked? Proposed rule: no.
   * POST /events itself refuses past dates ("Event date must be in the future"), so a past event cannot be
   * created as test data - the test uses an existing past-dated event from the catalogue instead.
   */
  test('booking an event that already took place is rejected', { tag: ['@proposed', '@business-rule', '@known-defect'] }, async ({
    api,
    bookingTracker,
  }) => {
    test.fail(true, 'BUG-10: past events can still be booked (201)');
    const past = (await api.events.listEvents({ limit: 100 })).find((e) => Date.parse(e.eventDate) < Date.now() && e.availableSeats > 0);
    test.skip(!past, 'No past-dated event with free seats exists in this account');
    test.info().annotations.push({ type: 'past-event', description: `#${past!.id} "${past!.title}" on ${past!.eventDate}` });
    const res = await api.bookings.create(toBookingRequest(past!.id, buildCustomer(), 1));
    if (res.status === 201) bookingTracker.trackId(res.parse(BookingResponseSchema).data.id);
    expectStatus(res, 400);
  });
});
