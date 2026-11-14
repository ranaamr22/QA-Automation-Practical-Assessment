import { QUANTITY } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { RequestRecorder } from '@src/ui/network';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * US-114 · AC1 - "When I choose the number of tickets ..."
 *
 * Rules: 1..10 tickets per booking, and never more than the seats still available
 * (app: max = min(10, availableSeats)). Answer to "8 seats left, max 10 - is booking blocked?":
 * NO - the user can book up to the 8 available seats; 9 and 10 are simply not offered.
 */
test.describe('US-114 · AC1 · Ticket quantity', { tag: ['@ui', '@ac1', '@quantity'] }, () => {
  test.describe('quantity controls', () => {
    test.beforeEach(async ({ eventPage, bookableEvent }) => {
      await eventPage.open(bookableEvent.id);
    });

    test('[AC1-QTY-01] starts at 1 ticket with "−" disabled and "+" enabled', { tag: '@smoke' }, async ({ eventPage }) => {
      const { quantity } = eventPage;
      await expect(quantity.value).toHaveText('1');
      await expect(quantity.decrease).toBeDisabled();
      await expect(quantity.increase).toBeEnabled();
      await expect(quantity.maxHint).toHaveText(`(max ${QUANTITY.MAX})`);
    });

    test('[AC1-QTY-02] increases and decreases the quantity one ticket at a time', async ({ eventPage }) => {
      const { quantity } = eventPage;
      await quantity.increase.click();
      await expect(quantity.value).toHaveText('2');
      await expect(quantity.decrease).toBeEnabled();
      await quantity.increase.click();
      await expect(quantity.value).toHaveText('3');
      await quantity.decrease.click();
      await expect(quantity.value).toHaveText('2');
    });

    test('[AC1-QTY-03] never goes below 1 ticket', { tag: '@boundary' }, async ({ eventPage }) => {
      const { quantity } = eventPage;
      await quantity.increase.click();
      await quantity.decrease.click();
      await expect(quantity.value).toHaveText('1');
      await expect(quantity.decrease).toBeDisabled();
      await quantity.decrease.click({ force: true }); // forced click on the disabled control is a no-op
      await expect(quantity.value).toHaveText('1');
    });

    test('[AC1-QTY-04] stops at 10 tickets and disables "+" when 10 or more seats are available', { tag: '@boundary' }, async ({ eventPage }) => {
      const { quantity } = eventPage;
      await quantity.increaseBy(QUANTITY.MAX - 1);
      await expect(quantity.value).toHaveText(String(QUANTITY.MAX));
      await expect(quantity.increase).toBeDisabled();
      await quantity.increase.click({ force: true });
      await expect(quantity.value).toHaveText(String(QUANTITY.MAX));
      await quantity.decrease.click(); // stepping back down re-enables "+"
      await expect(quantity.value).toHaveText(String(QUANTITY.MAX - 1));
      await expect(quantity.increase).toBeEnabled();
    });

    test('[AC1-QTY-05] shows disabled controls as disabled, visually and in their state', async ({ eventPage }) => {
      const { quantity } = eventPage;
      const opacity = (l: typeof quantity.increase) => l.evaluate((el) => Number(getComputedStyle(el).opacity));
      await expect(quantity.decrease).toHaveAttribute('disabled', '');
      expect(await opacity(quantity.decrease)).toBeLessThan(await opacity(quantity.increase));

      await quantity.increaseBy(QUANTITY.MAX - 1);
      await expect(quantity.increase).toHaveAttribute('disabled', '');
      expect(await opacity(quantity.increase)).toBeLessThan(await opacity(quantity.decrease));
    });
  });

  test.describe('seat availability (fewer seats than the maximum)', { tag: '@availability' }, () => {
    const PRICE = 120;

    for (const { seats, expectedMax } of [
      { seats: 1, expectedMax: 1 },
      { seats: 8, expectedMax: 8 },
      { seats: 9, expectedMax: 9 },
      { seats: 10, expectedMax: 10 },
      { seats: 11, expectedMax: 10 },
    ]) {
      test(`[AC1-QTY-06] caps the quantity at ${expectedMax} when ${seats} seat(s) are available`, { tag: '@boundary' }, async ({
        seedEvent,
        eventPage,
      }) => {
        const event = await seedEvent({ totalSeats: seats, price: PRICE });
        await eventPage.open(event.id);

        await expect(eventPage.quantity.maxHint).toHaveText(`(max ${expectedMax})`);
        await eventPage.quantity.increaseBy(expectedMax + 1); // try to go beyond the cap
        await expect(eventPage.quantity.value).toHaveText(String(expectedMax));
        await expect(eventPage.quantity.increase).toBeDisabled();
        await eventPage.quantity.increase.click({ force: true });
        await expect(eventPage.quantity.value, 'quantity must never exceed the cap').toHaveText(String(expectedMax));
        if (expectedMax === 1) await expect(eventPage.quantity.decrease).toBeDisabled();
        await expect.poll(() => eventPage.summary.totalValue()).toBe(displayedAmount(expectedTotal(PRICE, expectedMax)));
      });
    }

    test('[AC1-QTY-07] does not block the booking: all 8 remaining seats can be booked at once', { tag: '@smoke' }, async ({
      seedEvent,
      eventPage,
      bookingTracker,
    }) => {
      const event = await seedEvent({ totalSeats: 8, price: PRICE });
      await eventPage.open(event.id);

      bookingTracker.trackRef(await eventPage.book(buildCustomer(), 8));

      await expect(eventPage.confirmation.value('Tickets')).toHaveText('8');
      expect((await eventPage.confirmation.summary()).total).toBe(displayedAmount(expectedTotal(PRICE, 8)));
    });

    test('[AC1-QTY-08] lowers the cap after a partial booking (5 of 8 booked -> max 3)', async ({
      seedEvent,
      eventPage,
      bookingTracker,
      page,
    }) => {
      const event = await seedEvent({ totalSeats: 8, price: PRICE });
      await eventPage.open(event.id);
      bookingTracker.trackRef(await eventPage.book(buildCustomer(), 5));

      await page.reload();
      await eventPage.waitUntilReady();
      expect(await eventPage.seats()).toEqual({ available: 3, total: 8 });
      await expect(eventPage.quantity.maxHint).toHaveText('(max 3)');
      await eventPage.quantity.increaseBy(5);
      await expect(eventPage.quantity.value).toHaveText('3');
    });

    test('[AC1-QTY-09] shows the event as sold out once the last seat is booked', async ({
      seedEvent,
      seedBooking,
      eventPage,
      eventsListPage,
    }) => {
      const event = await seedEvent({ totalSeats: 8, price: PRICE });
      await seedBooking({ event, quantity: 8 });

      await eventPage.open(event.id);
      await expect(eventPage.availability).toHaveText('SOLD OUT');
      await expect(eventPage.confirmButton).toHaveText('Sold Out');
      await expect(eventPage.confirmButton).toBeDisabled();

      await eventsListPage.open({ search: event.title });
      const card = eventsListPage.cardByTitle(event.title);
      await expect(card.soldOutBadge).toBeVisible();
      await expect(card.bookNowLink).toHaveText('Sold Out');
      await expect(card.bookNowLink).toHaveAttribute('aria-disabled', 'true');
    });

    test('[AC1-QTY-10] caps existing low-availability events (e.g. "World Tech Summit") at their remaining seats', {
      tag: '@existing-data',
    }, async ({ eventCatalog, eventPage, page }) => {
      const limited = await eventCatalog.withLimitedSeats();
      test.skip(limited.length === 0, 'No existing event currently has 1-9 seats left in this sandbox.');
      test.info().annotations.push({ type: 'limited-events', description: limited.map((e) => `${e.title}=${e.availableSeats}`).join('; ') });

      const posts = RequestRecorder.bookingCreation(page);
      for (const event of limited) {
        await eventPage.open(event.id);
        await expect(eventPage.quantity.maxHint, event.title).toHaveText(`(max ${event.availableSeats})`);
        await eventPage.quantity.increaseBy(event.availableSeats + 1);
        await expect(eventPage.quantity.value, event.title).toHaveText(String(event.availableSeats));
        await expect(eventPage.quantity.increase, event.title).toBeDisabled();
      }
      expect(posts.count, 'read-only test must not book').toBe(0);
    });
  });
});
