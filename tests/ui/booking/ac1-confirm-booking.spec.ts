import { BOOKING_REF_PATTERN } from '@src/api/models/booking.model';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { BOOKING_CREATE_ROUTE, RequestRecorder } from '@src/ui/network';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * US-114 · AC1 - "... and click Confirm Booking, my booking is created and I see a confirmation
 * with a booking reference."
 */
test.describe('US-114 · AC1 · Confirm booking', { tag: ['@ui', '@ac1', '@booking'] }, () => {
  test('[AC1-CNF-01] confirms a valid booking with reference, customer, tickets and total', { tag: '@smoke' }, async ({
    eventPage,
    bookableEvent,
    bookingTracker,
  }) => {
    const customer = buildCustomer();
    await eventPage.open(bookableEvent.id);

    const ref = await eventPage.book(customer, 3);
    bookingTracker.trackRef(ref);

    await expect(eventPage.confirmation.heading).toBeVisible();
    expect(ref).toMatch(BOOKING_REF_PATTERN);
    expect(await eventPage.confirmation.summary()).toEqual({
      ref,
      customer: customer.name,
      tickets: 3,
      total: displayedAmount(expectedTotal(bookableEvent.price, 3)),
    });
    await expect(eventPage.eventTitle).toHaveText(bookableEvent.title);
  });

  test('[AC1-CNF-02] creates exactly one booking when "Confirm Booking" is double-clicked', { tag: '@negative' }, async ({
    eventPage,
    bookableEvent,
    bookingTracker,
    page,
  }) => {
    const posts = RequestRecorder.bookingCreation(page);
    await eventPage.open(bookableEvent.id);
    await eventPage.customer.fill(buildCustomer());

    await eventPage.confirmButton.dblclick();

    await expect(eventPage.confirmation.heading).toBeVisible();
    bookingTracker.trackRef(await eventPage.confirmation.ref());
    expect(posts.count, 'the button must be disabled while the request is in flight').toBe(1);
  });

  /** Network isolation is required here (the real API cannot be made to fail on demand). */
  test('[AC1-CNF-03] shows an error and keeps the entered data when the network fails', { tag: '@negative' }, async ({
    eventPage,
    bookableEvent,
    page,
  }) => {
    await page.route(BOOKING_CREATE_ROUTE, (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    );
    await eventPage.open(bookableEvent.id);
    const customer = buildCustomer();

    await eventPage.fillAndConfirm(customer, 2);

    await expect(eventPage.toast.region).not.toBeEmpty();
    await expect(eventPage.confirmation.heading).toBeHidden();
    await expect(eventPage.customer.email).toHaveValue(customer.email);
    await expect(eventPage.quantity.value).toHaveText('2');
    await expect(eventPage.confirmButton).toBeEnabled();
  });

  test('[AC1-CNF-04] rejects the booking with a clear message when seats were taken after the page loaded', {
    tag: ['@negative', '@availability'],
  }, async ({ seedEvent, seedBooking, eventPage, page }) => {
    const event = await seedEvent({ totalSeats: 8 });
    await eventPage.open(event.id);
    await eventPage.quantity.setTo(8);
    await eventPage.customer.fill(buildCustomer());

    await seedBooking({ event, quantity: 3 }); // another buyer takes 3 seats meanwhile
    await eventPage.confirmButton.click();

    await expect(eventPage.toast.message(/Only 5 seat\(s\) available, but 8 requested/)).toBeVisible();
    await expect(eventPage.confirmation.heading).toBeHidden();
    await page.reload();
    await eventPage.waitUntilReady();
    await expect(eventPage.quantity.maxHint).toHaveText('(max 5)');
  });

  test('[AC1-CNF-05] keeps the booking when the confirmation page is refreshed', async ({
    bookableEvent,
    eventPage,
    myBookingsPage,
    bookingTracker,
    page,
  }) => {
    await eventPage.open(bookableEvent.id);
    const ref = await eventPage.book(buildCustomer(), 1);
    bookingTracker.trackRef(ref);

    await page.reload();
    await eventPage.waitUntilReady();
    // The inline confirmation is not bookmarkable (README D12) - the form is shown again ...
    await expect(eventPage.confirmation.heading).toBeHidden();
    await expect(eventPage.confirmButton).toBeVisible();
    // ... but the booking itself is safe.
    await myBookingsPage.goto();
    await expect(myBookingsPage.cardByRef(ref).root).toHaveCount(1);
  });
});
