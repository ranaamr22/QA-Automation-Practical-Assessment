import {
  expectClientError,
  expectConsistentPagination,
  expectHandledWithoutServerError,
  expectStatus,
} from '@src/assertions/api.assertions';
import { EventListResponseSchema, EventResponseSchema } from '@src/api/models/event.model';
import { expect, test } from '@src/fixtures';

/**
 * Event read endpoints as used by the booking story (choosing an event, reading price and seats):
 *   GET /events        paginated list; filters category (enum), city, search; page >= 1; 1 <= limit <= 100
 *   GET /events/{id}   single event
 * Creating/updating events is out of scope (POST /events is only used as test setup).
 */
test.describe('API - read events', { tag: ['@api', '@events-read'] }, () => {
  test.describe('GET /events - filters and pagination', () => {
    test('lists events with consistent, bookable data (seats never above capacity)', { tag: '@smoke' }, async ({ api }) => {
      const res = await api.events.list({ limit: 100 });
      expectStatus(res, 200);
      const body = res.parse(EventListResponseSchema);
      expect(body.data.length).toBeGreaterThan(0);
      for (const e of body.data) {
        expect(e.availableSeats, `"${e.title}": available <= total`).toBeLessThanOrEqual(e.totalSeats);
        expect(e.price, `"${e.title}": price is not negative`).toBeGreaterThanOrEqual(0);
      }
    });

    test('search finds an event by its exact title', async ({ api, seedEvent }) => {
      const event = await seedEvent();
      const res = await api.events.list({ search: event.title });
      expectStatus(res, 200);
      expect(res.parse(EventListResponseSchema).data.map((e) => e.id)).toEqual([event.id]);
    });

    test('search with no match returns an empty list, not an error', async ({ api }) => {
      const res = await api.events.list({ search: 'zz-no-such-event-qa-zz' });
      expectStatus(res, 200);
      const body = res.parse(EventListResponseSchema);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    test('category filter returns only events of that category', async ({ api, seedEvent }) => {
      const event = await seedEvent({ category: 'Workshop' });
      const res = await api.events.list({ category: 'Workshop', limit: 100 });
      expectStatus(res, 200);
      const data = res.parse(EventListResponseSchema).data;
      expect(data.map((e) => e.id)).toContain(event.id);
      expect(new Set(data.map((e) => e.category))).toEqual(new Set(['Workshop']));
    });

    test('city filter returns only events in that city', async ({ api, seedEvent }) => {
      const event = await seedEvent({ city: 'Qa Test City' });
      const res = await api.events.list({ city: 'Qa Test City', limit: 100 });
      expectStatus(res, 200);
      const data = res.parse(EventListResponseSchema).data;
      expect(data.map((e) => e.id)).toContain(event.id);
      expect(new Set(data.map((e) => e.city))).toEqual(new Set(['Qa Test City']));
    });

    test('combined filters (category + city + search) must all match', async ({ api, seedEvent }) => {
      const event = await seedEvent({ category: 'Concert', city: 'Qa Combo City' });
      const hit = await api.events.list({ category: 'Concert', city: 'Qa Combo City', search: event.title });
      expect(hit.parse(EventListResponseSchema).data.map((e) => e.id)).toEqual([event.id]);
      const miss = await api.events.list({ category: 'Sports', city: 'Qa Combo City', search: event.title });
      expect(miss.parse(EventListResponseSchema).data, 'wrong category -> no result').toEqual([]);
    });

    test('limit=1 returns exactly one event with consistent pagination', async ({ api }) => {
      const res = await api.events.list({ limit: 1 });
      expectStatus(res, 200);
      const body = res.parse(EventListResponseSchema);
      expectConsistentPagination(body.pagination, body.data.length, { page: 1, limit: 1 });
    });

    test('a page beyond the last one returns an empty list', async ({ api }) => {
      const res = await api.events.list({ page: 9999, limit: 10 });
      expectStatus(res, 200);
      expect(res.parse(EventListResponseSchema).data).toEqual([]);
    });

    const invalidQueries: Array<{ query: Record<string, string | number>; bug?: string }> = [
      { query: { page: 0 } },
      { query: { limit: 0 } },
      { query: { limit: 101 }, bug: 'BUG-09' },
      { query: { limit: -5 }, bug: 'BUG-09' },
      { query: { page: 'abc' } },
      { query: { category: 'Opera' } },
    ];
    for (const { query, bug } of invalidQueries) {
      test(`handles the invalid query ${JSON.stringify(query)} without a server error`, { tag: ['@negative', ...(bug ? ['@known-defect'] : [])] }, async ({ api }) => {
        test.fail(!!bug, `${bug}: query ${JSON.stringify(query)} is not handled`);
        const res = await api.events.list(query);
        if (expectHandledWithoutServerError(res, [200, 400]) === 200) {
          const body = res.parse(EventListResponseSchema);
          expect(body.pagination.limit).toBeGreaterThanOrEqual(1);
          expect(body.pagination.limit).toBeLessThanOrEqual(100);
          if ('category' in query) expect(body.data, 'an unknown category matches nothing').toEqual([]);
        }
      });
    }
  });

  test.describe('GET /events/{id}', () => {
    test('returns the same event (price, seats) as the list', async ({ api, bookableEvent }) => {
      const res = await api.events.get(bookableEvent.id);
      expectStatus(res, 200);
      const event = res.parse(EventResponseSchema).data;
      expect(event).toMatchObject({
        id: bookableEvent.id,
        title: bookableEvent.title,
        price: bookableEvent.price,
        totalSeats: bookableEvent.totalSeats,
      });
    });

    test('a newly created event starts with availableSeats = totalSeats (documented)', async ({ api, seedEvent }) => {
      const created = await seedEvent({ totalSeats: 37 });
      const event = (await api.events.get(created.id)).parse(EventResponseSchema).data;
      expect(event.availableSeats).toBe(37);
      expect(event.totalSeats).toBe(37);
    });

    test('an unknown id returns 404 with an error message', { tag: '@negative' }, async ({ api }) => {
      expectClientError(await api.events.get(999_999_999), 404);
    });

    const invalidIds: Array<{ id: string; bug?: string }> = [{ id: 'abc', bug: 'BUG-08' }, { id: '0' }, { id: '-1' }, { id: '1.5' }];
    for (const { id, bug } of invalidIds) {
      test(`the invalid id "${id}" is rejected with 400/404, never a server error`, { tag: ['@negative', ...(bug ? ['@known-defect'] : [])] }, async ({ api }) => {
        test.fail(!!bug, `${bug}: GET /events/${id} answers 500`);
        expectHandledWithoutServerError(await api.events.get(id), [400, 404]);
      });
    }
  });
});
