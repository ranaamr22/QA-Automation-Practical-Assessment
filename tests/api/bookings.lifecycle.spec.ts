import { expectBookingCancelled, expectClientError, expectHandledWithoutServerError, expectStatus } from '@src/assertions/api.assertions';
import { expectSeatChange } from '@src/assertions/seat.assertions';
import { CancelBookingResponseSchema } from '@src/api/models/booking.model';
import { expect, test } from '@src/fixtures';

/** AC4 through the API: DELETE /bookings/{id} and the resulting state. */
test.describe('API - booking cancellation', { tag: ['@api', '@cancellation'] }, () => {
  test('cancelling a booking succeeds and the booking is no longer confirmed', { tag: '@smoke' }, async ({ api, seedBooking }) => {
    const booking = await seedBooking({ quantity: 2 });

    const res = await api.bookings.cancel(booking.id);

    expectStatus(res, 200);
    res.parse(CancelBookingResponseSchema);
    await expectBookingCancelled(api.bookings, booking.id);
  });

  test('cancellation releases the seats back to the event', async ({ api, bookableEvent, seedBooking }) => {
    await expectSeatChange({
      api,
      eventId: bookableEvent.id,
      expectedChange: +3,
      prepare: () => seedBooking({ event: bookableEvent, quantity: 3 }),
      act: async (booking) => {
        expectStatus(await api.bookings.cancel(booking.id), 200);
      },
      description: 'documented: seats are restored atomically on cancel',
    });
  });

  test('a cancelled booking disappears from the confirmed bookings list', async ({ api, seedBooking }) => {
    const booking = await seedBooking();
    expectStatus(await api.bookings.cancel(booking.id), 200);
    const confirmed = await api.bookings.listAll({ status: 'confirmed' });
    expect(confirmed.map((b) => b.id)).not.toContain(booking.id);
  });

  test('cancelling the same booking twice is rejected the second time', async ({ api, seedBooking }) => {
    const booking = await seedBooking();
    expectStatus(await api.bookings.cancel(booking.id), 200);
    const second = await api.bookings.cancel(booking.id);
    expect(second.ok, `second cancel must not succeed again.\n${second.describe()}`).toBe(false);
    expectStatus(second, [400, 404, 409]);
  });

  test('cancelling a non-existent booking returns 404', async ({ api }) => {
    expectClientError(await api.bookings.cancel(999_999_999), 404);
  });

  test('cancelling with a non-numeric id is rejected', { tag: ['@negative', '@known-defect'] }, async ({ api }) => {
    test.fail(true, 'BUG-08: DELETE /bookings/not-a-number answers 500 Internal server error');
    const res = await api.bookings.cancel('not-a-number');
    expectStatus(res, [400, 404]);
  });

  for (const id of ['0', '-1', '1.5']) {
    test(`cancelling with the invalid id "${id}" is rejected with 400/404, never a server error`, { tag: '@negative' }, async ({ api }) => {
      expectHandledWithoutServerError(await api.bookings.cancel(id), [400, 404]);
    });
  }

  test('a successful cancellation answers with success:true and a confirmation message', async ({ api, seedBooking }) => {
    const booking = await seedBooking();
    const body = (await api.bookings.cancel(booking.id)).parse(CancelBookingResponseSchema);
    expect(body.success).toBe(true);
    test.info().annotations.push({ type: 'cancel-message', description: body.message ?? '(none)' });
  });

  test('cancelling a 10-ticket booking restores all 10 seats', { tag: '@boundary' }, async ({ api, seedEvent, seedBooking }) => {
    const event = await seedEvent({ totalSeats: 12 });
    const booking = await seedBooking({ event, quantity: 10 });
    expect((await api.events.getEvent(event.id)).availableSeats).toBe(2);
    expectStatus(await api.bookings.cancel(booking.id), 200);
    expect((await api.events.getEvent(event.id)).availableSeats).toBe(12);
  });

  test('looking up an unknown booking reference returns 404 with an explanatory error', async ({ api }) => {
    const body = expectClientError(await api.bookings.getByRef('EVT-ZZZZZZ'), 404);
    expect(body.error).toContain('EVT-ZZZZZZ');
  });

  /** PO question Q9: can the same customer re-book after cancelling? Verifies it is not blocked. */
  test('the same customer can book the same event again after cancelling', async ({ api, seedBooking, bookableEvent }) => {
    const first = await seedBooking();
    expectStatus(await api.bookings.cancel(first.id), 200);
    const again = await seedBooking({
      event: bookableEvent,
      customer: { name: first.customerName, email: first.customerEmail, phone: first.customerPhone },
    });
    expect(again.bookingRef).not.toBe(first.bookingRef);
    expect(again.status).toBe('confirmed');
  });
});
