import { z } from 'zod';

export interface AuthRequest {
  email: string;
  password: string;
}

export const AuthResponseSchema = z.object({
  success: z.literal(true),
  token: z.string().min(20),
  user: z.object({ id: z.number().int(), email: z.string() }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const MeResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({ userId: z.number().int(), email: z.string() }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
