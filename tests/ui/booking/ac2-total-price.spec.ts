import { expectRightOfOnSameRow } from '@src/assertions/layout.assertions';
import { QUANTITY } from '@src/data/booking.factory';
import { buildCustomer } from '@src/data/customer.factory';
import { expect, test } from '@src/fixtures';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * US-114 · AC2 - "The total price equals the ticket price multiplied by the number of tickets."
 *
 * Expected values always come from the API (source of truth for the event price), never from the page
 * itself, so a page that is "consistently wrong" cannot pass. The UI rounds to whole dollars
 * (`maximumFractionDigits: 0`), see src/utils/money.ts.
 */
test.describe('US-114 · AC2 · Total price', { tag: ['@ui', '@ac2', '@pricing'] }, () => {
  test.describe('on an existing event', () => {
    test.beforeEach(async ({ eventPage, bookableEvent }) => {
      await eventPage.open(bookableEvent.id);
    });

    test('[AC2-PRC-01] shows the single-ticket price next to "Book Tickets", matching the event price', { tag: '@smoke' }, async ({
      eventPage,
      bookableEvent,
    }) => {
      await expectRightOfOnSameRow(eventPage.bookTicketsHeading, '"Book Tickets" heading', eventPage.unitPrice, 'unit price');
      expect(await eventPage.unitPriceValue()).toBe(displayedAmount(bookableEvent.price));
      await expect(eventPage.page.getByText('per ticket', { exact: true })).toBeVisible();
    });

    test('[AC2-PRC-02] keeps the single-ticket price constant when the quantity changes', async ({ eventPage, bookableEvent }) => {
      for (const q of [2, 5, QUANTITY.MAX]) {
        await eventPage.quantity.setTo(q);
        expect(await eventPage.unitPriceValue(), `unit price at quantity ${q}`).toBe(displayedAmount(bookableEvent.price));
      }
    });

    test('[AC2-PRC-03] recalculates total = price × quantity on every change, up and down', { tag: ['@smoke', '@boundary'] }, async ({
      eventPage,
      bookableEvent,
    }) => {
      // 1 (min), several, 10 (max) and back down - recalculation must also work on decrease.
      for (const q of [1, 2, 3, 5, QUANTITY.MAX, 7, 1]) {
        await eventPage.quantity.setTo(q);
        await expect(eventPage.quantity.value).toHaveText(String(q));
        await expect
          .poll(() => eventPage.summary.totalValue(), { message: `total at quantity ${q}` })
          .toBe(displayedAmount(expectedTotal(bookableEvent.price, q)));
        await expect(eventPage.summary.breakdown).toContainText(`× ${q} ticket${q > 1 ? 's' : ''}`);
      }
    });
  });

  test('[AC2-PRC-04] calculates the total correctly for events with different prices', async ({ eventPage, eventCatalog }) => {
    const events = await eventCatalog.withDistinctPrices(3);
    test.info().annotations.push({ type: 'price-scenarios', description: events.map((e) => e.price).join(', ') });
    expect(events.length, 'need at least one priced event').toBeGreaterThan(0);

    for (const event of events) {
      await eventPage.open(event.id);
      await eventPage.quantity.setTo(3);
      await expect
        .poll(() => eventPage.summary.totalValue(), { message: `total for "${event.title}" ×3` })
        .toBe(displayedAmount(expectedTotal(event.price, 3)));
    }
  });

  test('[AC2-PRC-05] shows the same price on the event card and on the booking page', async ({ homePage, eventPage, api }) => {
    await homePage.goto();
    const card = homePage.firstBookableCard();
    const [cardPrice, id] = [await card.priceValue(), await card.eventId()];

    await card.bookNowLink.click();
    await eventPage.waitUntilReady();

    const { price } = await api.events.getEvent(id);
    expect(cardPrice, 'card price').toBe(displayedAmount(price));
    expect(await eventPage.unitPriceValue(), 'booking page price').toBe(displayedAmount(price));
  });

  test('[AC2-PRC-06] books a free event with a total of $0', { tag: '@boundary' }, async ({ seedEvent, eventPage, bookingTracker }) => {
    const event = await seedEvent({ price: 0 });
    await eventPage.open(event.id);
    expect(await eventPage.unitPriceValue()).toBe(0);

    bookingTracker.trackRef(await eventPage.book(buildCustomer(), 4));

    expect((await eventPage.confirmation.summary()).total).toBe(0);
  });

  test('[AC2-PRC-07] charges the exact total for a fractional price (UI shows it rounded)', async ({
    seedEvent,
    eventPage,
    bookingTracker,
    api,
  }) => {
    const event = await seedEvent({ price: 19.99 });
    await eventPage.open(event.id);
    await eventPage.quantity.setTo(3);
    await expect.poll(() => eventPage.summary.totalValue()).toBe(displayedAmount(59.97)); // "$60"

    const ref = await eventPage.book(buildCustomer(), 3);
    bookingTracker.trackRef(ref);

    expect((await api.bookings.findByRef(ref))!.totalPrice).toBeCloseTo(expectedTotal(19.99, 3), 2);
  });

  test('[AC2-PRC-08] displays fractional prices with cents', { tag: ['@proposed', '@known-defect'] }, async ({ seedEvent, eventPage }) => {
    // README D10: amounts are formatted with maximumFractionDigits: 0 -> "$20" for 19.99, so the user sees a
    // different price than they are charged. Marked as expected-to-fail: it turns red (unexpected pass)
    // once the defect is fixed, so the marker gets removed.
    test.fail(true, 'Known defect D10 - prices are rounded to whole dollars');
    const event = await seedEvent({ price: 19.99 });
    await eventPage.open(event.id);
    await expect(eventPage.unitPrice).toHaveText('$19.99', { timeout: 5_000 });
  });
});
