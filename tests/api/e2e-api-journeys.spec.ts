import { expectBookingCancelled, expectBookingMatches, expectClientError, expectStatus } from '@src/assertions/api.assertions';
import { BookingListResponseSchema, BookingResponseSchema } from '@src/api/models/booking.model';
import { EventListResponseSchema } from '@src/api/models/event.model';
import { buildBookingRequest, toBookingRequest } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { expectedTotal } from '@src/utils/money';

/**
 * US-114 · API end-to-end journeys.
 *
 * The other API specs check one endpoint/rule each. These journeys chain the endpoints the way a client
 * application (e.g. the website or a mobile app) uses them, and verify the system state after every step:
 * the booking itself, the event's seat counter and the list views.
 */
test.describe('US-114 · API E2E · Booking journeys', { tag: ['@api', '@e2e'] }, () => {
  test('[E2E-API-01] find event -> book -> read it back 3 ways -> seats drop -> cancel -> gone & seats restored', {
    tag: ['@smoke', '@ac1', '@ac2', '@ac3', '@ac4', '@ac5'],
  }, async ({ api, seedEvent, bookingTracker }) => {
    const created = await seedEvent({ totalSeats: 30, price: 120 });
    const customer = buildCustomer();
    const quantity = 4;

    const event = await test.step('find the event via search and read its details', async () => {
      const found = (await api.events.list({ search: created.title })).parse(EventListResponseSchema).data;
      expect(found.map((e) => e.id)).toEqual([created.id]);
      const details = await api.events.getEvent(created.id);
      expect(details.availableSeats).toBe(30);
      return details;
    });

    const booking = await test.step('book 4 tickets (POST /bookings)', async () => {
      const request = toBookingRequest(event.id, customer, quantity);
      const res = await api.bookings.create(request);
      expectStatus(res, 201);
      const data = res.parse(BookingResponseSchema).data;
      bookingTracker.trackId(data.id);
      expectBookingMatches(data, request, event);
      expect(data.totalPrice, 'AC2: 4 × 120').toBe(expectedTotal(120, quantity));
      return data;
    });

    await test.step('read it back by id, by reference and in the filtered list (AC3)', async () => {
      const byId = (await api.bookings.get(booking.id)).parse(BookingResponseSchema).data;
      const byRef = (await api.bookings.getByRef(booking.bookingRef)).parse(BookingResponseSchema).data;
      const listed = (await api.bookings.list({ eventId: event.id })).parse(BookingListResponseSchema).data;
      for (const b of [byId, byRef]) expect(b).toMatchObject({ id: booking.id, quantity, status: 'confirmed' });
      expect(listed.map((b) => b.id)).toEqual([booking.id]);
    });

    await test.step('the event lost exactly 4 seats', async () => {
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(26);
    });

    await test.step('cancel (DELETE /bookings/{id}) (AC4)', async () => {
      expectStatus(await api.bookings.cancel(booking.id), 200);
      await expectBookingCancelled(api.bookings, booking.id);
    });

    await test.step('no longer confirmed anywhere, and all 30 seats are back', async () => {
      const confirmed = (await api.bookings.list({ eventId: event.id, status: 'confirmed' })).parse(BookingListResponseSchema).data;
      expect(confirmed).toEqual([]);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(30);
    });
  });

  test('[E2E-API-02] sell out an 8-seat event in two bookings -> further booking refused -> cancel -> re-book', {
    tag: ['@ac1', '@ac4', '@availability'],
  }, async ({ api, seedEvent, bookingTracker }) => {
    const event = await seedEvent({ totalSeats: 8 });
    const book = async (quantity: number) => {
      const res = await api.bookings.create(toBookingRequest(event.id, buildCustomer(), quantity));
      if (res.status === 201) bookingTracker.trackId(res.parse(BookingResponseSchema).data.id);
      return res;
    };

    const first = await test.step('book 5, then the remaining 3', async () => {
      const five = await book(5);
      expectStatus(five, 201);
      expectStatus(await book(3), 201);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(0);
      return five.parse(BookingResponseSchema).data;
    });

    await test.step('the sold-out event refuses even 1 more ticket and reserves nothing', async () => {
      const body = expectClientError(await book(1), 400);
      expect(body.error).toMatch(/seat/i);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(0);
    });

    await test.step('cancelling the 5-ticket booking makes exactly 5 seats bookable again', async () => {
      expectStatus(await api.bookings.cancel(first.id), 200);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(5);
      expectClientError(await book(6), 400); // 6 > 5 still refused
      expectStatus(await book(5), 201);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(0);
    });
  });

  /**
   * The docs promise the booking is created and seats decremented "atomically". Two buyers racing for the
   * last seats must never both succeed (over-selling) and the counter must never go negative.
   */
  test('[E2E-API-03] two simultaneous requests for the last seats: only one wins, no over-selling', {
    tag: ['@availability', '@concurrency'],
  }, async ({ api, seedEvent, bookingTracker }) => {
    const event = await seedEvent({ totalSeats: 8 });

    const results = await Promise.all([
      api.bookings.create(toBookingRequest(event.id, buildCustomer(), 5)),
      api.bookings.create(toBookingRequest(event.id, buildCustomer(), 5)),
    ]);
    const won = results.filter((r) => r.status === 201);
    for (const r of won) bookingTracker.trackId(r.parse(BookingResponseSchema).data.id);

    expect(results.map((r) => r.status).sort(), 'exactly one 201 and one 400').toEqual([201, 400]);
    const after = await api.events.getEvent(event.id);
    expect(after.availableSeats, '8 - 5 = 3, never negative').toBe(3);
    const booked = (await api.bookings.list({ eventId: event.id })).parse(BookingListResponseSchema).data;
    expect(booked.reduce((sum, b) => sum + b.quantity, 0), 'never more tickets than seats').toBeLessThanOrEqual(8);
  });

  test('[E2E-API-04] rejected request changes nothing -> corrected request books exactly once', {
    tag: ['@ac5', '@validation'],
  }, async ({ api, seedEvent, bookingTracker }) => {
    const event = await seedEvent({ totalSeats: 10 });
    const customer = buildCustomer();

    await test.step('an invalid request (bad e-mail, 11 tickets) is rejected and reserves nothing', async () => {
      const res = await api.bookings.create(buildBookingRequest(event.id, { customerEmail: 'not-an-email', quantity: 11 }));
      expectClientError(res, 400);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(10);
      expect((await api.bookings.list({ eventId: event.id })).parse(BookingListResponseSchema).data).toEqual([]);
    });

    await test.step('the corrected request succeeds once', async () => {
      const res = await api.bookings.create(toBookingRequest(event.id, customer, 3));
      expectStatus(res, 201);
      bookingTracker.trackId(res.parse(BookingResponseSchema).data.id);
      const listed = (await api.bookings.list({ eventId: event.id })).parse(BookingListResponseSchema).data;
      expect(listed.map((b) => b.customerEmail)).toEqual([customer.email]);
      expect((await api.events.getEvent(event.id)).availableSeats).toBe(7);
    });
  });

  test('[E2E-API-05] bookings on two events stay independent: list filters, totals and cancelling one', {
    tag: ['@ac2', '@ac3', '@ac4', '@multi'],
  }, async ({ api, seedEvent, seedBooking }) => {
    const [cheap, pricey] = [await seedEvent({ price: 50, totalSeats: 20 }), await seedEvent({ price: 300, totalSeats: 20 })];
    const a = await seedBooking({ event: cheap, quantity: 2 });
    const b = await seedBooking({ event: pricey, quantity: 3 });

    expect(a.totalPrice).toBe(100);
    expect(b.totalPrice).toBe(900);
    for (const [event, booking] of [[cheap, a], [pricey, b]] as const) {
      const listed = (await api.bookings.list({ eventId: event.id })).parse(BookingListResponseSchema).data;
      expect(listed.map((x) => x.id), `only "${event.title}" bookings`).toEqual([booking.id]);
    }

    expectStatus(await api.bookings.cancel(a.id), 200);

    expect((await api.events.getEvent(cheap.id)).availableSeats, 'cancelled event fully restored').toBe(20);
    expect((await api.events.getEvent(pricey.id)).availableSeats, 'other event untouched').toBe(17);
    expect((await api.bookings.get(b.id)).parse(BookingResponseSchema).data.status).toBe('confirmed');
  });
});
