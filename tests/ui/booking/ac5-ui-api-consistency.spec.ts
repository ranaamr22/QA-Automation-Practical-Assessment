import { expectBookingMatches } from '@src/assertions/api.assertions';
import { expectSeatChange } from '@src/assertions/seat.assertions';
import { toBookingRequest } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * US-114 · AC5 - "The same booking behaviour is available through POST /api/bookings."
 *
 * The API contract itself is covered in tests/api. These UI tests prove both channels are the SAME
 * system: possible because the browser and the API client share one identity (the worker's AuthSession).
 */
test.describe('US-114 · AC5 · UI and API consistency', { tag: ['@ui', '@ac5', '@integration'] }, () => {
  test('[AC5-API-01] persists a UI booking in the API with identical data and decrements seats', { tag: '@smoke' }, async ({
    eventPage,
    bookableEvent,
    bookingTracker,
    api,
  }) => {
    let customer = buildCustomer();
    let ref = '';

    // Seats are read right before Confirm and right after the confirmation (shared event: see seat.assertions).
    await expectSeatChange({
      api,
      eventId: bookableEvent.id,
      expectedChange: -4,
      prepare: async () => {
        customer = buildCustomer();
        await eventPage.open(bookableEvent.id);
      },
      act: async () => {
        ref = await eventPage.book(customer, 4);
        bookingTracker.trackRef(ref);
      },
      description: 'a UI booking decrements seats like an API booking',
    });

    const booking = await api.bookings.findByRef(ref);
    expect(booking, `UI reference ${ref} must exist in the API`).toBeDefined();
    expectBookingMatches(booking!, toBookingRequest(bookableEvent.id, customer, 4), bookableEvent);
    expect(await eventPage.confirmation.summary()).toMatchObject({
      tickets: booking!.quantity,
      total: displayedAmount(booking!.totalPrice),
    });
  });

  test('[AC5-API-02] shows a booking created via POST /api/bookings in My Bookings and its details', async ({
    seedBooking,
    myBookingsPage,
    bookingDetailsPage,
    bookableEvent,
  }) => {
    const customer = buildCustomer();
    const booking = await seedBooking({ event: bookableEvent, quantity: 5, customer });

    await myBookingsPage.goto();
    const card = myBookingsPage.cardByRef(booking.bookingRef);
    await expect(card.root).toBeVisible();
    await expect(card.eventTitle).toHaveText(bookableEvent.title);
    await expect(card.status).toHaveText('confirmed');
    expect(await card.ticketCount()).toBe(5);
    expect(await card.totalValue()).toBe(displayedAmount(expectedTotal(bookableEvent.price, 5)));

    await card.viewDetails.click();
    await bookingDetailsPage.waitUntilReady();
    await expect(bookingDetailsPage.value('Name')).toHaveText(customer.name);
    await expect(bookingDetailsPage.value('Email')).toHaveText(customer.email);
    await expect(bookingDetailsPage.value('Phone')).toHaveText(customer.phone);
    await expect(bookingDetailsPage.value('Tickets')).toHaveText('5');
  });
});
