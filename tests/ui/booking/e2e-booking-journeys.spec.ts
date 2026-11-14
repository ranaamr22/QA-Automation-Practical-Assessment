import { expectBookingCancelled, expectBookingMatches } from '@src/assertions/api.assertions';
import { availableSeats, expectEventPageShowsLiveSeats } from '@src/assertions/seat.assertions';
import { toBookingRequest } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { BOOKING_CREATE_ROUTE, RequestRecorder } from '@src/ui/network';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * US-114 · end-to-end user journeys.
 *
 * The AC suites verify each step in isolation (and arrange preconditions via the API to stay focused).
 * These journeys chain the steps the way a real user does - through the UI only, in one browser session -
 * and verify the outcome against the API at the end. They answer "does the whole story work together?".
 */
test.describe('US-114 · E2E · Booking journeys', { tag: ['@ui', '@e2e'] }, () => {
  test('[E2E-01] browse -> book 3 tickets -> seats drop on event page -> My Bookings -> details -> cancel -> seats restored', {
    tag: ['@smoke', '@ac1', '@ac2', '@ac3', '@ac4', '@ac5'],
  }, async ({ homePage, eventPage, myBookingsPage, bookingDetailsPage, bookingTracker, api, page }) => {
    const customer = buildCustomer();
    const quantity = 3;

    await test.step('choose an event from the home page', async () => {
      await homePage.goto();
      await homePage.firstBookableCard().bookNowLink.click();
      await eventPage.waitUntilReady();
    });
    const eventId = eventPage.eventIdFromUrl();
    const event = await api.events.getEvent(eventId);
    test.skip(event.availableSeats < quantity, `"${event.title}" has fewer than ${quantity} seats left`);

    // The event is shared with every user of the public sandbox, so its seat counter can move at any time.
    // Seat changes are therefore measured with API reads taken immediately around the user's click, and the
    // event page is compared with the live API value (see src/assertions/seat.assertions.ts).

    // "Available" tile on the event page, e.g. "46 / 10000 seats".
    await test.step('the event page shows the current available seats', async () => {
      await expectEventPageShowsLiveSeats(eventPage, api, eventId);
    });

    let seatsBeforeBooking = 0;
    let seatsAfterBooking = 0;
    const ref = await test.step('select 3 tickets and check the price (AC1, AC2)', async () => {
      await eventPage.quantity.setTo(quantity);
      expect(await eventPage.unitPriceValue()).toBe(displayedAmount(event.price));
      await expect.poll(() => eventPage.summary.totalValue()).toBe(displayedAmount(expectedTotal(event.price, quantity)));
      await eventPage.customer.fill(customer);
      seatsBeforeBooking = await availableSeats(api, eventId);
      await eventPage.confirmButton.click();
      await expect(eventPage.confirmation.heading).toBeVisible();
      seatsAfterBooking = await availableSeats(api, eventId);
      const bookingRef = await eventPage.confirmation.ref();
      bookingTracker.trackRef(bookingRef);
      return bookingRef;
    });

    const booking = await test.step('the API holds the same booking and the seats dropped by 3 (AC5)', async () => {
      const persisted = await api.bookings.findByRef(ref);
      expect(persisted, `booking ${ref} in the API`).toBeDefined();
      expectBookingMatches(persisted!, toBookingRequest(eventId, customer, quantity), event);
      expect(seatsAfterBooking - seatsBeforeBooking, `seats right before/after Confirm: ${seatsBeforeBooking} -> ${seatsAfterBooking}`).toBe(-quantity);
      return persisted!;
    });

    await test.step(`back on the event page, the dropped seat count is shown`, async () => {
      const shown = await expectEventPageShowsLiveSeats(eventPage, api, eventId);
      expect(shown.total, 'capacity never changes').toBe(event.totalSeats);
      await expect(eventPage.quantity.value, 'a fresh booking form is shown').toHaveText('1');
    });

    await test.step('find it in My Bookings and open its details (AC3)', async () => {
      await myBookingsPage.goto();
      const card = myBookingsPage.cardByRef(ref);
      await expect(card.status).toHaveText('confirmed');
      expect(await card.ticketCount()).toBe(quantity);
      await card.viewDetails.click();
      await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`));
      await bookingDetailsPage.waitUntilReady();
      await expect(bookingDetailsPage.value('Name')).toHaveText(customer.name);
    });

    let seatsBeforeCancel = 0;
    let seatsAfterCancel = 0;
    await test.step('cancel it from the details page (AC4)', async () => {
      await bookingDetailsPage.cancelButton.click();
      await expect(bookingDetailsPage.dialog.confirm).toBeVisible();
      seatsBeforeCancel = await availableSeats(api, eventId);
      await bookingDetailsPage.dialog.confirm.click();
      await expect(page).toHaveURL(/\/bookings$/);
      seatsAfterCancel = await availableSeats(api, eventId);
      await myBookingsPage.waitUntilReady();
      const card = myBookingsPage.cardByRef(ref);
      await expect(card.root.filter({ has: card.cancelButton })).toHaveCount(0);
    });

    await test.step('the API confirms the cancellation and the 3 seats are released', async () => {
      await expectBookingCancelled(api.bookings, booking.id);
      expect(seatsAfterCancel - seatsBeforeCancel, `seats right before/after "Yes, cancel it": ${seatsBeforeCancel} -> ${seatsAfterCancel}`).toBe(quantity);
    });

    await test.step('back on the event page, the restored seat count is shown', async () => {
      await expectEventPageShowsLiveSeats(eventPage, api, eventId);
    });
  });

  test('[E2E-02] fixes validation errors, then books successfully with a single request', { tag: ['@ac1', '@validation'] }, async ({
    eventPage,
    bookableEvent,
    bookingTracker,
    api,
    page,
  }) => {
    const posts = RequestRecorder.bookingCreation(page);
    const customer = buildCustomer();
    await eventPage.open(bookableEvent.id);
    await eventPage.quantity.setTo(2);

    await test.step('submit with an invalid email and a short phone', async () => {
      await eventPage.customer.fill({ ...customer, email: 'qa.tester@', phone: '12345' });
      await eventPage.confirmButton.click();
      await expect(eventPage.customer.error('email')).toBeVisible();
      await expect(eventPage.customer.error('phone')).toBeVisible();
      expect(posts.count).toBe(0);
    });

    await test.step('correct the data and confirm', async () => {
      await eventPage.customer.fill({ email: customer.email, phone: customer.phone });
      await expect(eventPage.quantity.value, 'quantity is kept while correcting').toHaveText('2');
      await eventPage.confirmButton.click();
      await expect(eventPage.confirmation.heading).toBeVisible();
      bookingTracker.trackRef(await eventPage.confirmation.ref());
    });

    expect(posts.count, 'exactly one booking request').toBe(1);
    const booking = await api.bookings.findByRef(await eventPage.confirmation.ref());
    expect(booking).toMatchObject({ customerEmail: customer.email, customerPhone: customer.phone, quantity: 2 });
  });

  test('[E2E-03] 8-seat event: book all 8 -> sold out -> cancel -> bookable again', {
    tag: ['@ac1', '@ac4', '@availability'],
  }, async ({ seedEvent, eventPage, myBookingsPage, bookingTracker, page }) => {
    const event = await seedEvent({ totalSeats: 8, price: 120 });
    await eventPage.open(event.id);

    const ref = await test.step('the cap is 8 (not 10) and all 8 can be booked', async () => {
      await expect(eventPage.quantity.maxHint).toHaveText('(max 8)');
      await eventPage.quantity.increaseBy(10);
      await expect(eventPage.quantity.value).toHaveText('8');
      const bookingRef = await eventPage.book(buildCustomer(), 8);
      bookingTracker.trackRef(bookingRef);
      return bookingRef;
    });

    await test.step('the event is now sold out', async () => {
      await page.reload();
      await eventPage.waitUntilReady();
      await expect(eventPage.availability).toHaveText('SOLD OUT');
      await expect(eventPage.confirmButton).toBeDisabled();
    });

    await test.step('cancelling the booking in My Bookings releases all 8 seats', async () => {
      await myBookingsPage.goto();
      await myBookingsPage.cancel(ref);
      await expect(myBookingsPage.toast.message('Booking cancelled successfully')).toBeVisible();
      await eventPage.open(event.id);
      expect(await eventPage.seats()).toEqual({ available: 8, total: 8 });
      await expect(eventPage.quantity.maxHint).toHaveText('(max 8)');
      await expect(eventPage.confirmButton).toBeEnabled();
    });
  });

  test('[E2E-04] books two events, sees both, cancels one, the other stays', { tag: ['@ac3', '@ac4', '@multi'] }, async ({
    bookableEvent,
    seedEvent,
    eventPage,
    myBookingsPage,
    bookingTracker,
    api,
  }) => {
    const second = await seedEvent({ price: 80, totalSeats: 30 });
    const refs: string[] = [];
    for (const [event, quantity] of [[bookableEvent, 1], [second, 2]] as const) {
      await eventPage.open(event.id);
      refs.push(await eventPage.book(buildCustomer(), quantity));
      bookingTracker.trackRef(refs.at(-1)!);
    }
    const [keepRef, cancelRef] = refs;

    await myBookingsPage.goto();
    await expect(myBookingsPage.cardByRef(keepRef).eventTitle).toHaveText(bookableEvent.title);
    await expect(myBookingsPage.cardByRef(cancelRef).eventTitle).toHaveText(second.title);

    await myBookingsPage.cancel(cancelRef);
    await expect(myBookingsPage.toast.message('Booking cancelled successfully')).toBeVisible();

    await expect(myBookingsPage.cardByRef(keepRef).status).toHaveText('confirmed');
    expect((await api.bookings.findByRef(keepRef))?.status).toBe('confirmed');
    expect((await api.events.getEvent(second.id)).availableSeats, 'seats of the cancelled booking released').toBe(30);
  });

  test('[E2E-05] network drops on confirm -> retry succeeds -> exactly one booking exists', { tag: ['@ac1', '@negative'] }, async ({
    eventPage,
    bookableEvent,
    bookingTracker,
    api,
    page,
  }) => {
    const customer = buildCustomer();
    await page.route(BOOKING_CREATE_ROUTE, (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    );
    await eventPage.open(bookableEvent.id);

    await eventPage.fillAndConfirm(customer, 2);
    await expect(eventPage.toast.region).not.toBeEmpty();
    await expect(eventPage.confirmation.heading).toBeHidden();

    await page.unroute(BOOKING_CREATE_ROUTE); // connection is back
    await eventPage.confirmButton.click(); // the entered data was kept, so a plain retry is enough
    await expect(eventPage.confirmation.heading).toBeVisible();
    bookingTracker.trackRef(await eventPage.confirmation.ref());

    const mine = (await api.bookings.listAll()).filter((b) => b.customerEmail === customer.email);
    expect(mine, 'the failed attempt must not have created a booking').toHaveLength(1);
    expect(mine[0].quantity).toBe(2);
  });

  test('[E2E-06] a booking cancelled via the API is no longer active in My Bookings', { tag: ['@ac4', '@ac5'] }, async ({
    eventPage,
    myBookingsPage,
    bookableEvent,
    bookingTracker,
    api,
  }) => {
    await eventPage.open(bookableEvent.id);
    const ref = await eventPage.book(buildCustomer(), 1);
    bookingTracker.trackRef(ref);
    const booking = await api.bookings.findByRef(ref);

    await api.bookings.cancel(booking!.id); // e.g. cancelled by another client of the same account

    await myBookingsPage.goto();
    const card = myBookingsPage.cardByRef(ref);
    await expect(card.root.filter({ has: card.cancelButton })).toHaveCount(0);
    await expectBookingCancelled(api.bookings, booking!.id);
  });
});
