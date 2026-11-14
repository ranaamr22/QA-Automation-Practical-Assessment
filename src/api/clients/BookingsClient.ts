import type { ApiClient, AuthMode, RawQuery } from '../core/ApiClient';
import {
  BookingListResponseSchema,
  BookingResponseSchema,
  type Booking,
  type BookingQuery,
  type CreateBookingRequest,
  type RawBookingPayload,
} from '../models/booking.model';

/**
 * Bookings API (documented endpoints only).
 *
 * Intentionally NOT exposed: `DELETE /bookings` ("clear all"), which the My Bookings page calls.
 * It is undocumented and would wipe every booking in the account - unacceptable for a framework
 * whose cleanup contract is "only remove what this test created".
 */
export class BookingsClient {
  constructor(private readonly http: ApiClient) {}

  create(payload: CreateBookingRequest | RawBookingPayload, auth?: AuthMode) {
    return this.http.post('bookings', { data: payload, auth });
  }

  /** Accepts raw values too, so negative tests can send invalid query parameters (e.g. limit=abc). */
  list(query: BookingQuery | RawQuery = {}, auth?: AuthMode) {
    return this.http.get('bookings', { params: { ...query }, auth });
  }

  get(id: number | string, auth?: AuthMode) {
    return this.http.get(`bookings/${id}`, { auth });
  }

  getByRef(ref: string, auth?: AuthMode) {
    return this.http.get(`bookings/ref/${encodeURIComponent(ref)}`, { auth });
  }

  cancel(id: number | string, auth?: AuthMode) {
    return this.http.delete(`bookings/${id}`, { auth });
  }

  // ---- Convenience helpers for setup/teardown (assertive, typed) ---------------------------

  async createBooking(payload: CreateBookingRequest): Promise<Booking> {
    const res = await this.create(payload);
    if (res.status !== 201) throw new Error(`Booking setup failed (expected 201).\n${res.describe()}`);
    return res.parse(BookingResponseSchema).data;
  }

  async findByRef(ref: string): Promise<Booking | undefined> {
    const res = await this.getByRef(ref);
    if (res.status === 404) return undefined;
    if (res.status !== 200) throw new Error(`Unexpected status looking up ${ref}.\n${res.describe()}`);
    return res.parse(BookingResponseSchema).data;
  }

  /** All bookings in the account (sandbox max is 9, documented UI copy, so one page of 100 is enough). */
  async listAll(query: Omit<BookingQuery, 'page' | 'limit'> = {}): Promise<Booking[]> {
    const res = await this.list({ ...query, page: 1, limit: 100 });
    if (res.status !== 200) throw new Error(`Listing bookings failed.\n${res.describe()}`);
    return res.parse(BookingListResponseSchema).data;
  }
}
