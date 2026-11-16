import { z } from 'zod';
export const config = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  SITE_ORIGIN: z.url().default('http://localhost:3000'),
  ADMIN_ORIGIN: z.url().default('http://localhost:3001'),
  DATABASE_URL: z.string().min(1), REDIS_URL: z.string().min(1),
  R2_ENDPOINT: z.url().optional(), R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(), R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BUCKET: z.string().optional(),
  MEDIA_PUBLIC_URL: z.url().optional(),
}).parse(process.env);
