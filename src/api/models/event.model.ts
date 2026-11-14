import { z } from 'zod';
import { Numeric, list, single } from './envelope';

export const EVENT_CATEGORIES = ['Conference', 'Concert', 'Sports', 'Workshop', 'Festival'] as const;

export const EventSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string(),
  venue: z.string(),
  city: z.string(),
  eventDate: z.string().datetime({ offset: true }),
  price: Numeric,
  totalSeats: z.number().int().nonnegative(),
  availableSeats: z.number().int().nonnegative(),
  imageUrl: z.string().nullable().optional(),
  /** Undocumented, but used by the UI ("Featured - always available for practice"). */
  isStatic: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type EventModel = z.infer<typeof EventSchema>;

export const EventResponseSchema = single(EventSchema);
export const EventListResponseSchema = list(EventSchema);

/** POST/PUT /events body (OpenAPI CreateEventInput). */
export interface CreateEventRequest {
  title: string;
  description?: string;
  category: (typeof EVENT_CATEGORIES)[number];
  venue: string;
  city: string;
  eventDate: string;
  price: number;
  totalSeats: number;
  imageUrl?: string;
}

export interface EventQuery {
  category?: (typeof EVENT_CATEGORIES)[number];
  city?: string;
  search?: string;
  page?: number;
  limit?: number;
}
