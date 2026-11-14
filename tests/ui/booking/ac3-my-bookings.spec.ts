import { toBookingRequest } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { BOOKINGS_LIST_ROUTE } from '@src/ui/network';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * US-114 · AC3 - "The booking appears in My Bookings."
 * Includes the booking details page reached from My Bookings, and that only the user's OWN bookings are visible.
 */
test.describe('US-114 · AC3 · My Bookings', { tag: ['@ui', '@ac3', '@my-bookings'] }, () => {
  test.describe('a new booking is listed', () => {
    test('[AC3-MYB-01] lists a booking made in the UI with event, status, tickets and total', { tag: '@smoke' }, async ({
      eventPage,
      myBookingsPage,
      bookableEvent,
      bookingTracker,
    }) => {
      await eventPage.open(bookableEvent.id);
      const ref = await eventPage.book(buildCustomer(), 2);
      bookingTracker.trackRef(ref);

      await eventPage.confirmation.viewMyBookings.click();
      await myBookingsPage.waitUntilReady();

      const card = myBookingsPage.cardByRef(ref);
      await expect(card.root).toHaveCount(1);
      await expect(card.eventTitle).toHaveText(bookableEvent.title);
      await expect(card.status).toHaveText('confirmed');
      expect(await card.ticketCount()).toBe(2);
      expect(await card.totalValue()).toBe(displayedAmount(expectedTotal(bookableEvent.price, 2)));
      await expect(card.cancelButton).toBeVisible();
    });

    test('[AC3-MYB-02] shows the full booking on its details page (event, customer, tickets, total)', async ({
      eventPage,
      bookingDetailsPage,
      bookableEvent,
      bookingTracker,
      api,
      page,
    }) => {
      const customer = buildCustomer();
      await eventPage.open(bookableEvent.id);
      const ref = await eventPage.book(customer, 3);
      bookingTracker.trackRef(ref);
      const booking = await api.bookings.findByRef(ref);
      expect(booking, `booking ${ref} should exist in the API`).toBeDefined();

      await bookingDetailsPage.open(booking!.id);

      await expect(bookingDetailsPage.eventTitle).toHaveText(bookableEvent.title);
      await expect(page.getByText(ref).first()).toBeVisible();
      await expect(page.getByText(`#${booking!.id}`)).toBeVisible();
      await expect(bookingDetailsPage.value('Name')).toHaveText(customer.name);
      await expect(bookingDetailsPage.value('Email')).toHaveText(customer.email);
      await expect(bookingDetailsPage.value('Phone')).toHaveText(customer.phone);
      await expect(bookingDetailsPage.value('Tickets')).toHaveText('3');
      await expect(bookingDetailsPage.value('Venue')).toHaveText(bookableEvent.venue);
      await expect(bookingDetailsPage.value('City')).toHaveText(bookableEvent.city);
      await expect(bookingDetailsPage.totalPaid).toHaveText(
        `$${displayedAmount(expectedTotal(bookableEvent.price, 3)).toLocaleString('en-US')}`,
      );
    });
  });

  test.describe('navigation', () => {
    test('[AC3-MYB-03] opens the matching booking via "View Details"', async ({ seedBooking, myBookingsPage, bookingDetailsPage, page }) => {
      const booking = await seedBooking();
      await myBookingsPage.goto();

      await myBookingsPage.cardByRef(booking.bookingRef).viewDetails.click();

      await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`));
      await bookingDetailsPage.waitUntilReady();
      await expect(page.getByText(booking.bookingRef).first()).toBeVisible();
    });

    test('[AC3-MYB-04] returns to My Bookings via the breadcrumb and the back button', async ({
      seedBooking,
      bookingDetailsPage,
      myBookingsPage,
      page,
    }) => {
      const booking = await seedBooking();
      await bookingDetailsPage.open(booking.id);
      await bookingDetailsPage.breadcrumbMyBookings.click();
      await expect(page).toHaveURL(/\/bookings$/);

      await bookingDetailsPage.open(booking.id);
      await bookingDetailsPage.backToMyBookings.click();
      await expect(page).toHaveURL(/\/bookings$/);
      await myBookingsPage.waitUntilReady();
    });
  });

  test.describe('multiple bookings', { tag: '@multi' }, () => {
    test('[AC3-MYB-05] lists bookings for two different events, each with its own details', async ({
      bookableEvent,
      seedEvent,
      eventPage,
      myBookingsPage,
      bookingTracker,
    }) => {
      const plan = [
        { event: bookableEvent, quantity: 2 },
        { event: await seedEvent({ price: 80, totalSeats: 30 }), quantity: 3 },
      ];
      const refs: string[] = [];
      for (const { event, quantity } of plan) {
        await eventPage.open(event.id);
        refs.push(await eventPage.book(buildCustomer(), quantity));
        bookingTracker.trackRef(refs.at(-1)!);
      }
      expect(new Set(refs).size, 'each booking has its own reference').toBe(2);

      await myBookingsPage.goto();
      for (const [i, { event, quantity }] of plan.entries()) {
        const card = myBookingsPage.cardByRef(refs[i]);
        await expect(card.eventTitle).toHaveText(event.title);
        await expect(card.status).toHaveText('confirmed');
        expect(await card.ticketCount()).toBe(quantity);
        expect(await card.totalValue()).toBe(displayedAmount(expectedTotal(event.price, quantity)));
      }
    });

    test('[AC3-MYB-06] lists two separate bookings for the same event, both reducing availability', async ({
      seedEvent,
      eventPage,
      myBookingsPage,
      bookingTracker,
    }) => {
      const event = await seedEvent({ totalSeats: 20 });
      const refs: string[] = [];
      for (const quantity of [2, 3]) {
        await eventPage.open(event.id);
        refs.push(await eventPage.book(buildCustomer(), quantity));
        bookingTracker.trackRef(refs.at(-1)!);
      }

      await eventPage.open(event.id);
      expect(await eventPage.seats()).toEqual({ available: 15, total: 20 });
      await myBookingsPage.goto();
      for (const ref of refs) await expect(myBookingsPage.cardByRef(ref).root).toHaveCount(1);
    });

    test('[AC3-MYB-07] keeps at most 9 bookings: a 10th replaces the oldest (sandbox rule)', { tag: ['@slow', '@boundary'] }, async ({
      api,
      seedEvent,
      seedBooking,
      eventPage,
      myBookingsPage,
      bookingTracker,
    }) => {
      test.slow();
      const existing = await api.bookings.listAll();
      const foreign = existing.filter((b) => !b.customerEmail.startsWith('eventhub.qa+'));
      // Safety: the eviction rule would silently delete the account owner's real bookings.
      test.skip(foreign.length > 0, `Account has ${foreign.length} booking(s) not created by the suite; refusing to trigger eviction.`);

      const event = await seedEvent({ totalSeats: 100, price: 10 });
      for (let i = existing.length; i < 9; i++) await seedBooking({ event });
      const before = await api.bookings.listAll();
      expect(before).toHaveLength(9);
      const oldest = [...before].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id)[0];

      await eventPage.open(event.id);
      const ref = await eventPage.book(buildCustomer(), 1);
      bookingTracker.trackRef(ref);

      const after = await api.bookings.listAll();
      expect(after, 'bookings stay capped at 9').toHaveLength(9);
      expect(after.map((b) => b.bookingRef)).toContain(ref);
      expect(after.map((b) => b.id), 'oldest booking was replaced').not.toContain(oldest.id);
      await myBookingsPage.goto();
      await expect(myBookingsPage.bookingCards).toHaveCount(9);
      await expect(myBookingsPage.cardByRef(oldest.bookingRef).root).toHaveCount(0);
      test.info().annotations.push({ type: 'finding', description: 'Oldest booking silently removed without user notice (README D9)' });
    });
  });

  test.describe('edge states', () => {
    test('[AC3-MYB-08] shows an empty state with a "Browse Events" link when there are no bookings', async ({ myBookingsPage, page }) => {
      // Isolated rendering check: a truly empty account cannot be guaranteed in a shared sandbox.
      await page.route(BOOKINGS_LIST_ROUTE, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ json: { success: true, data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } } })
          : route.continue(),
      );
      await myBookingsPage.goto();
      await expect(myBookingsPage.bookingCards).toHaveCount(0);
      await expect(myBookingsPage.emptyState).toBeVisible();
    });

    test('[AC3-MYB-09] shows "Booking not found" for an unknown booking id', { tag: '@negative' }, async ({ bookingDetailsPage }) => {
      await bookingDetailsPage.open(999_999_999);
      await expect(bookingDetailsPage.notFound).toBeVisible();
    });

    test("[AC3-MYB-10] does not show another user's booking", { tag: ['@negative', '@security'] }, async ({
      otherUserApi,
      bookingDetailsPage,
      myBookingsPage,
      bookableEvent,
      page,
    }) => {
      // Owned by the isolation user -> not in our tracker, cleaned up explicitly.
      const foreign = await otherUserApi.bookings.createBooking(toBookingRequest(bookableEvent.id, buildCustomer(), 1));
      try {
        await bookingDetailsPage.open(foreign.id);
        await expect(bookingDetailsPage.accessDenied.or(bookingDetailsPage.notFound)).toBeVisible();
        await expect(page.getByText(foreign.customerEmail)).toHaveCount(0);

        await myBookingsPage.goto();
        await expect(myBookingsPage.cardByRef(foreign.bookingRef).root).toHaveCount(0);
      } finally {
        await otherUserApi.bookings.cancel(foreign.id);
      }
    });
  });
});
