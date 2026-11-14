import type { CreateBookingRequest, RawBookingPayload } from '@src/api/models/booking.model';
import { buildCustomer, type Customer } from './customer.factory';

export const QUANTITY = { MIN: 1, MAX: 10 } as const;

export function toBookingRequest(eventId: number, customer: Customer, quantity: number): CreateBookingRequest {
  return {
    eventId,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    quantity,
  };
}

/** A valid request for `eventId`; override any field (with any type) for negative scenarios. */
export function buildBookingRequest(eventId: number, overrides: RawBookingPayload = {}): RawBookingPayload {
  return { ...toBookingRequest(eventId, buildCustomer(), 1), ...overrides };
}

/** Same as above but with a field removed entirely (missing vs. empty are different cases). */
export function buildBookingRequestWithout(eventId: number, field: keyof CreateBookingRequest): RawBookingPayload {
  const payload = buildBookingRequest(eventId);
  delete payload[field];
  return payload;
}
