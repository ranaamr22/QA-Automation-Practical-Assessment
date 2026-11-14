import { z } from 'zod';
import { Numeric, list, single } from './envelope';
import { EventSchema } from './event.model';

/**
 * Documented format is "EVT-XXXXXX", but the live API (verified 2026-11-14) issues refs like "D-4GCDSW":
 * a short upper-case prefix + "-" + 6 characters (README D18). Both shapes are accepted.
 */
export const BOOKING_REF_PATTERN = /^[A-Z0-9]{1,5}-[A-Z0-9]{6}$/;

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BookingSchema = z.object({
  id: z.number().int().positive(),
  eventId: z.number().int().positive(),
  customerName: z.string(),
  customerEmail: z.string(),
  customerPhone: z.string(),
  quantity: z.number().int(),
  totalPrice: Numeric,
  status: z.enum(BOOKING_STATUSES),
  bookingRef: z.string().regex(BOOKING_REF_PATTERN, 'bookingRef must match PREFIX-XXXXXX'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  event: EventSchema.optional(),
});
export type Booking = z.infer<typeof BookingSchema>;

export const BookingResponseSchema = single(BookingSchema);
export const BookingListResponseSchema = list(BookingSchema);
export const CancelBookingResponseSchema = z.object({ success: z.literal(true), message: z.string().optional() });

/**
 * Strictly typed request model for POST /bookings. Negative tests that need to send wrong types use
 * the separate `RawBookingPayload` so they still go *through the same client* instead of bypassing it.
 */
export interface CreateBookingRequest {
  eventId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quantity: number;
}

export type RawBookingPayload = Partial<Record<keyof CreateBookingRequest, unknown>> & Record<string, unknown>;

export interface BookingQuery {
  eventId?: number;
  status?: BookingStatus;
  page?: number;
  limit?: number;
}
