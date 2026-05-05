import { registerAs, type ConfigType } from '@nestjs/config';
import { z } from 'zod';

export const validationSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

type EnvConfig = z.infer<typeof validationSchema>;

export const appConfig = registerAs('app', () => ({
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
}));

export type AppConfig = ConfigType<typeof appConfig>;
