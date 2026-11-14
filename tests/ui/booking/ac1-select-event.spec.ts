import { expect, test } from '@src/fixtures';

/**
 * US-114 · AC1 (precondition) - the visitor reaches the booking page of the event they chose.
 */
test.describe('US-114 · AC1 · Select an event', { tag: ['@ui', '@ac1'] }, () => {
  test('[AC1-NAV-01] lists the available events, each with a title and a booking action', { tag: '@smoke' }, async ({ homePage }) => {
    await homePage.goto();
    const count = await homePage.eventCards.count();
    expect(count, 'at least one event should be displayed').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(homePage.card(i).title).not.toBeEmpty();
      await expect(homePage.card(i).bookNowLink).toBeVisible();
    }
  });

  test('[AC1-NAV-02] opens the booking page of the event whose title is clicked', async ({ homePage, eventPage, page }) => {
    await homePage.goto();
    const card = homePage.firstBookableCard();
    const [title, id] = [await card.titleText(), await card.eventId()];

    await card.titleLink.click();

    await expect(page).toHaveURL(new RegExp(`/events/${id}$`));
    await eventPage.waitUntilReady();
    await expect(eventPage.eventTitle).toHaveText(title);
    await expect(eventPage.bookTicketsHeading).toBeVisible();
  });

  test('[AC1-NAV-03] opens the booking page of the event whose "Book Now" is clicked', async ({ homePage, eventPage, page }) => {
    await homePage.goto();
    const card = homePage.firstBookableCard();
    const [title, id] = [await card.titleText(), await card.eventId()];

    await card.bookNowLink.click();

    await expect(page).toHaveURL(new RegExp(`/events/${id}$`));
    await eventPage.waitUntilReady();
    await expect(eventPage.eventTitle).toHaveText(title);
  });

  test('[AC1-NAV-04] links the title and "Book Now" of every card to the same event', async ({ homePage }) => {
    await homePage.goto();
    const count = await homePage.eventCards.count();
    for (let i = 0; i < count; i++) {
      const card = homePage.card(i);
      const titleHref = await card.titleLink.getAttribute('href');
      expect(titleHref, `card ${i}: both links must target the same event`).toBe(await card.bookNowLink.getAttribute('href'));
      expect(titleHref).toMatch(/^\/events\/\d+$/);
    }
  });

  test('[AC1-NAV-05] warns about low availability on the event card ("8 seats left!")', async ({ seedEvent, eventsListPage }) => {
    const event = await seedEvent({ totalSeats: 8 });
    await eventsListPage.open({ search: event.title });
    await expect(eventsListPage.cardByTitle(event.title).seatsLeftBadge).toHaveText('8 seats left!');
  });

  test('[AC1-NAV-06] shows "Event not found" instead of a booking form for an unknown event', { tag: '@negative' }, async ({ eventPage }) => {
    await eventPage.open(999_999_999);
    await expect(eventPage.notFoundHeading).toBeVisible();
    await expect(eventPage.form).toHaveCount(0);
  });
});
