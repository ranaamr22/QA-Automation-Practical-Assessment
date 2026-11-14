import { expectClientError, expectNoBookingPersisted, expectStatus } from '@src/assertions/api.assertions';
import { BookingResponseSchema } from '@src/api/models/booking.model';
import { buildBookingRequest } from '@src/data/booking.factory';
import { expect, test } from '@src/fixtures';

/**
 * Seat availability vs. the 1..10 quantity rule, enforced by the API independently of the UI
 * ("8 seats left, max per booking 10").
 */
test.describe('API - seat availability', { tag: ['@api', '@availability'] }, () => {
  test('requesting 10 tickets for an event with 8 seats is rejected and nothing is reserved', async ({ api, seedEvent }) => {
    const event = await seedEvent({ totalSeats: 8 });
    const payload = buildBookingRequest(event.id, { quantity: 10 });

    const body = expectClientError(await api.bookings.create(payload), 400);
    expect(body.error).toMatch(/Only 8 seat\(s\) available, but 10 requested/);
    await expectNoBookingPersisted(api.bookings, payload.customerEmail);
    expect((await api.events.getEvent(event.id)).availableSeats).toBe(8);
  });

  test('booking exactly the remaining 8 seats succeeds; one more is then rejected', { tag: '@boundary' }, async ({
    api,
    seedEvent,
    bookingTracker,
  }) => {
    const event = await seedEvent({ totalSeats: 8 });

    const all = await api.bookings.create(buildBookingRequest(event.id, { quantity: 8 }));
    expectStatus(all, 201);
    bookingTracker.trackId(all.parse(BookingResponseSchema).data.id);
    expect((await api.events.getEvent(event.id)).availableSeats).toBe(0);

    const extra = buildBookingRequest(event.id, { quantity: 1 });
    const body = expectClientError(await api.bookings.create(extra), 400);
    expect(body.error).toMatch(/Only 0 seat\(s\) available/);
    await expectNoBookingPersisted(api.bookings, extra.customerEmail);
  });

  test('cancelling restores availability so the seats can be booked again', async ({ api, seedEvent, seedBooking }) => {
    const event = await seedEvent({ totalSeats: 8 });
    const booking = await seedBooking({ event, quantity: 8 });
    expectStatus(await api.bookings.cancel(booking.id), 200);
    expect((await api.events.getEvent(event.id)).availableSeats).toBe(8);
    await seedBooking({ event, quantity: 8 });
  });
});
