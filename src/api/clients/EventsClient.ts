import type { ApiClient, AuthMode, RawQuery } from '../core/ApiClient';
import {
  EventListResponseSchema,
  EventResponseSchema,
  type CreateEventRequest,
  type EventModel,
  type EventQuery,
} from '../models/event.model';

/**
 * Events API.
 *
 * Write operations are used ONLY as test-data setup for booking scenarios (e.g. "an event with exactly
 * 8 seats"); event management is not under test. Events are private to the user's sandbox, so this never affects other users;
 * every created event is tracked and deleted again (EventTracker). Featured (isStatic) events are never
 * modified.
 */
export class EventsClient {
  constructor(private readonly http: ApiClient) {}

  /** Accepts raw values too, so negative tests can send invalid query parameters (e.g. limit=abc). */
  list(query: EventQuery | RawQuery = {}, auth?: AuthMode) {
    return this.http.get('events', { params: { ...query }, auth });
  }

  get(id: number | string, auth?: AuthMode) {
    return this.http.get(`events/${id}`, { auth });
  }

  create(payload: CreateEventRequest | Record<string, unknown>, auth?: AuthMode) {
    return this.http.post('events', { data: payload, auth });
  }

  delete(id: number, auth?: AuthMode) {
    return this.http.delete(`events/${id}`, { auth });
  }

  // ---- Convenience helpers (assertive, typed) ------------------------------------------------

  async getEvent(id: number): Promise<EventModel> {
    const res = await this.get(id);
    if (res.status !== 200) throw new Error(`Expected 200 for event ${id}.\n${res.describe()}`);
    return res.parse(EventResponseSchema).data;
  }

  async listEvents(query: EventQuery = {}): Promise<EventModel[]> {
    const res = await this.list(query);
    if (res.status !== 200) throw new Error(`Expected 200 listing events.\n${res.describe()}`);
    return res.parse(EventListResponseSchema).data;
  }

  async createEvent(payload: CreateEventRequest): Promise<EventModel> {
    const res = await this.create(payload);
    if (res.status !== 201) throw new Error(`Event setup failed (expected 201).\n${res.describe()}`);
    return res.parse(EventResponseSchema).data;
  }
}
