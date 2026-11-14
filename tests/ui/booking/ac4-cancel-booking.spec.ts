import { expectBookingCancelled } from '@src/assertions/api.assertions';
import { expect, test } from '@src/fixtures';

/**
 * US-114 · AC4 - "I can cancel the booking."
 *
 * Bookings are arranged via the API (creation in the UI is covered by AC1/AC3) to keep each test
 * focused on cancellation. The app's cancel semantics (hard delete vs. status "cancelled") are not
 * specified - `expectBookingCancelled` accepts both and reports which one happened.
 */
test.describe('US-114 · AC4 · Cancel booking', { tag: ['@ui', '@ac4', '@cancellation'] }, () => {
  test('[AC4-CAN-01] cancels a booking from My Bookings after confirming the dialog', { tag: '@smoke' }, async ({
    myBookingsPage,
    seedBooking,
    api,
  }) => {
    const booking = await seedBooking({ quantity: 2 });
    await myBookingsPage.goto();
    const card = myBookingsPage.cardByRef(booking.bookingRef);
    await expect(card.root).toBeVisible();

    await card.cancelButton.click();
    await expect(myBookingsPage.dialog.root).toBeVisible();
    await expect(myBookingsPage.dialog.root).toContainText(booking.bookingRef);
    await myBookingsPage.dialog.confirm.click();

    await expect(myBookingsPage.toast.message('Booking cancelled successfully')).toBeVisible();
    // Either removed from the list or shown as cancelled - in both cases it can no longer be cancelled.
    await expect(card.root.filter({ has: card.cancelButton })).toHaveCount(0);
    await expectBookingCancelled(api.bookings, booking.id);
  });

  test('[AC4-CAN-02] keeps the booking when the cancel dialog is closed', { tag: '@negative' }, async ({
    myBookingsPage,
    seedBooking,
    api,
  }) => {
    const booking = await seedBooking();
    await myBookingsPage.goto();
    const card = myBookingsPage.cardByRef(booking.bookingRef);

    await card.cancelButton.click();
    await myBookingsPage.dialog.close.click();

    await expect(myBookingsPage.dialog.root).toBeHidden();
    await expect(card.status).toHaveText('confirmed');
    await expect(card.cancelButton).toBeVisible();
    expect((await api.bookings.findByRef(booking.bookingRef))?.status).toBe('confirmed');
  });

  test('[AC4-CAN-03] cancels only the selected booking when several exist', { tag: '@multi' }, async ({
    seedEvent,
    seedBooking,
    myBookingsPage,
    api,
  }) => {
    const event = await seedEvent({ totalSeats: 20 });
    const keep = await seedBooking({ event, quantity: 1 });
    const cancel = await seedBooking({ event, quantity: 2 });

    await myBookingsPage.goto();
    await myBookingsPage.cancel(cancel.bookingRef);
    await expect(myBookingsPage.toast.message('Booking cancelled successfully')).toBeVisible();

    const cancelled = myBookingsPage.cardByRef(cancel.bookingRef);
    await expect(cancelled.root.filter({ has: cancelled.cancelButton })).toHaveCount(0);
    await expect(myBookingsPage.cardByRef(keep.bookingRef).status).toHaveText('confirmed');
    expect((await api.bookings.findByRef(keep.bookingRef))?.status).toBe('confirmed');
  });

  test('[AC4-CAN-04] cancels from the booking details page and releases the seats', async ({
    seedEvent,
    seedBooking,
    bookingDetailsPage,
    api,
    page,
  }) => {
    const event = await seedEvent({ totalSeats: 20 });
    const booking = await seedBooking({ event, quantity: 2 });
    expect((await api.events.getEvent(event.id)).availableSeats).toBe(18);

    await bookingDetailsPage.open(booking.id);
    await bookingDetailsPage.cancelButton.click();
    await bookingDetailsPage.dialog.confirm.click();

    await expect(page).toHaveURL(/\/bookings$/);
    await expectBookingCancelled(api.bookings, booking.id);
    expect((await api.events.getEvent(event.id)).availableSeats, 'cancelled seats are released').toBe(20);
  });
});
