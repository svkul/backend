import { z } from 'zod';

export const helloResponseSchema = z.object({
  message: z.string(),
});

export type HelloResponse = z.infer<typeof helloResponseSchema>;

export const healthzResponseSchema = z.object({
  ok: z.literal(true),
});

export type HealthzResponse = z.infer<typeof healthzResponseSchema>;
