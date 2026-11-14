import { buildCustomer } from '@src/data/customer.factory';
import { buildEvent, TEST_EVENT_PREFIX } from '@src/data/event.factory';
import { expect, test } from '@src/fixtures';
import { RequestRecorder } from '@src/ui/network';
import { displayedAmount, expectedTotal } from '@src/utils/money';

/**
 * Story: "As a user I want to add (multiple) events so that tickets can be booked for them."
 */
const REQUIRED_MESSAGES = [
  'Title is required',
  'Category is required',
  'Venue is required',
  'City is required',
  'Event date is required',
  'Enter a valid price (≥ 0)',
  'Must have at least 1 seat',
];

test.describe('UI - add events (Admin)', { tag: ['@ui', '@admin-events'] }, () => {
  test.beforeEach(async ({ adminEventsPage }) => {
    await adminEventsPage.goto();
  });

  test('page shows the event form and the events table; featured events are read-only', async ({ adminEventsPage, page }) => {
    await expect(adminEventsPage.formHeading).toHaveText(/New Event/);
    await expect(adminEventsPage.allEventsHeading).toBeVisible();
    const featured = adminEventsPage.rows.filter({ hasText: 'Featured' });
    const count = await featured.count();
    for (let i = 0; i < count; i++) {
      await expect(featured.nth(i)).toContainText('Read-only');
      await expect(featured.nth(i).getByRole('button', { name: /Edit|Delete/ })).toHaveCount(0);
    }
    await expect(page.getByText(/create up to\s*6 events/)).toBeVisible();
  });

  test('empty submit shows every required-field message and creates nothing', async ({ adminEventsPage, page }) => {
    const creates = RequestRecorder.eventCreation(page);
    await adminEventsPage.form.submit.click();
    await expect(adminEventsPage.form.errors).toHaveText(REQUIRED_MESSAGES, { useInnerText: true });
    expect(creates.count).toBe(0);
  });

  test('a date in the past is rejected', async ({ adminEventsPage, page }) => {
    const creates = RequestRecorder.eventCreation(page);
    await adminEventsPage.form.fill(buildEvent({ eventDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString() }));
    await adminEventsPage.form.submit.click();
    await expect(page.getByText('Must be a future date')).toBeVisible();
    expect(creates.count).toBe(0);
  });

  test('zero seats and a negative price are rejected', { tag: '@boundary' }, async ({ adminEventsPage, page }) => {
    const creates = RequestRecorder.eventCreation(page);
    await adminEventsPage.form.fill(buildEvent({ totalSeats: 0, price: -1 }));
    await adminEventsPage.form.submit.click();
    await expect(page.getByText('Must have at least 1 seat')).toBeVisible();
    await expect(page.getByText('Enter a valid price (≥ 0)')).toBeVisible();
    expect(creates.count).toBe(0);
  });

  test('a user can add an event and it is listed with its details', { tag: '@smoke' }, async ({ adminEventsPage, eventTracker }) => {
    const event = buildEvent({ price: 199, totalSeats: 40, city: 'Pune', category: 'Concert' });
    eventTracker.trackTitle(event.title);

    await adminEventsPage.addEvent(event);

    const row = adminEventsPage.row(event.title);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Concert');
    await expect(row).toContainText('Pune');
    await expect(row).toContainText('$199');
    await expect(row).toContainText('40/40');
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('a user can add multiple events; each is listed, searchable and bookable at its own price', async ({
    adminEventsPage,
    eventsListPage,
    eventPage,
    eventTracker,
    bookingTracker,
  }) => {
    const events = [
      buildEvent({ category: 'Conference', price: 100, totalSeats: 30 }),
      buildEvent({ category: 'Sports', price: 75, totalSeats: 8 }),
      buildEvent({ category: 'Festival', price: 0, totalSeats: 200 }),
    ];
    for (const event of events) {
      eventTracker.trackTitle(event.title);
      await adminEventsPage.addEvent(event);
    }
    for (const event of events) await expect(adminEventsPage.row(event.title)).toHaveCount(1);

    for (const event of events) {
      await eventsListPage.open({ search: event.title });
      const card = eventsListPage.cardByTitle(event.title);
      await expect(card.root).toBeVisible();
      await card.bookNowLink.click();
      await eventPage.waitUntilReady();
      await expect(eventPage.eventTitle).toHaveText(event.title);
      expect(await eventPage.unitPriceValue()).toBe(displayedAmount(event.price));
      await expect(eventPage.quantity.maxHint).toHaveText(`(max ${Math.min(10, event.totalSeats)})`);
    }

    // End-to-end: book tickets for one of the newly added events.
    const target = events[1];
    await eventsListPage.open({ search: target.title });
    await eventsListPage.cardByTitle(target.title).bookNowLink.click();
    await eventPage.waitUntilReady();
    const ref = await eventPage.book(buildCustomer(), 2);
    bookingTracker.trackRef(ref);
    expect((await eventPage.confirmation.summary()).total).toBe(displayedAmount(expectedTotal(target.price, 2)));
  });

  test('a newly added event can be found by its category and city filters', async ({ adminEventsPage, eventsListPage, eventTracker }) => {
    const event = buildEvent({ category: 'Workshop', city: `QACity${Date.now() % 100000}` });
    eventTracker.trackTitle(event.title);
    await adminEventsPage.addEvent(event);

    await eventsListPage.open({ category: 'Workshop', city: event.city });
    await eventsListPage.waitForResults();
    expect(await eventsListPage.titles()).toContain(event.title);
  });

  test('editing an event price is reflected on its booking page', async ({ adminEventsPage, eventPage, seedEvent, page }) => {
    const event = await seedEvent({ price: 100 });
    await page.reload();
    await adminEventsPage.waitUntilReady();

    await adminEventsPage.editButton(event.title).click();
    await expect(adminEventsPage.formHeading).toHaveText(/Edit Event/);
    await adminEventsPage.form.price.fill('150');
    await adminEventsPage.form.submit.click();
    await expect(adminEventsPage.toast.message('Event updated!')).toBeVisible();
    await expect(adminEventsPage.row(event.title)).toContainText('$150');

    await eventPage.open(event.id);
    expect(await eventPage.unitPriceValue()).toBe(150);
    await eventPage.quantity.setTo(3);
    await expect.poll(() => eventPage.summary.totalValue()).toBe(450);
  });

  test('deleting an event removes it from the table and its page shows "not found"', async ({
    adminEventsPage,
    eventPage,
    seedEvent,
    page,
  }) => {
    const event = await seedEvent();
    await page.reload();
    await adminEventsPage.waitUntilReady();

    await adminEventsPage.deleteButton(event.title).click();
    await expect(adminEventsPage.deleteDialog).toContainText('permanently delete the event and all associated bookings');
    await adminEventsPage.confirmDelete.click();

    await expect(adminEventsPage.row(event.title)).toHaveCount(0);
    await eventPage.open(event.id);
    await expect(eventPage.notFoundHeading).toBeVisible();
  });

  test('deleting an event also removes its bookings from My Bookings', async ({
    adminEventsPage,
    myBookingsPage,
    seedEvent,
    seedBooking,
    api,
    page,
  }) => {
    const event = await seedEvent();
    const booking = await seedBooking({ event, quantity: 2 });
    await page.reload();
    await adminEventsPage.waitUntilReady();

    await adminEventsPage.deleteEvent(event.title);
    await expect(adminEventsPage.row(event.title)).toHaveCount(0);

    await myBookingsPage.goto();
    await expect(myBookingsPage.cardByRef(booking.bookingRef).root).toHaveCount(0);
    expect(await api.bookings.findByRef(booking.bookingRef)).toBeUndefined();
  });

  test('sandbox limit: adding a 7th custom event replaces the oldest one', { tag: ['@slow', '@boundary'] }, async ({
    adminEventsPage,
    api,
    eventTracker,
    page,
  }) => {
    test.slow();
    const custom = (await api.events.listEvents({ limit: 100 })).filter((e) => !e.isStatic);
    const foreign = custom.filter((e) => !e.title.startsWith(TEST_EVENT_PREFIX));
    // Safety: never let the eviction rule delete events the account owner created by hand.
    test.skip(foreign.length > 0, `Account has ${foreign.length} user-created event(s); refusing to trigger eviction.`);

    const seeded = [];
    for (let i = custom.length; i < 6; i++) {
      const e = await api.events.createEvent(buildEvent());
      eventTracker.trackId(e.id);
      seeded.push(e);
    }
    const before = (await api.events.listEvents({ limit: 100 })).filter((e) => !e.isStatic);
    expect(before).toHaveLength(6);
    const oldest = [...before].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id)[0];

    await page.reload();
    await adminEventsPage.waitUntilReady();
    const seventh = buildEvent();
    eventTracker.trackTitle(seventh.title);
    await adminEventsPage.addEvent(seventh);

    const after = (await api.events.listEvents({ limit: 100 })).filter((e) => !e.isStatic);
    expect(after, 'custom events stay capped at 6').toHaveLength(6);
    expect(after.map((e) => e.id), 'the oldest custom event was replaced').not.toContain(oldest.id);
    expect(after.map((e) => e.title)).toContain(seventh.title);
  });
});
