import { z } from 'zod';

/** Number that the backend may serialise as a numeric string (UI uses parseFloat on prices). */
export const Numeric = z.union([z.number(), z.string()]).pipe(z.coerce.number());

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PaginationSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export function single<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), data, message: z.string().optional() });
}

export function list<T extends z.ZodTypeAny>(item: T) {
  return z.object({ success: z.literal(true), data: z.array(item), pagination: PaginationSchema });
}
