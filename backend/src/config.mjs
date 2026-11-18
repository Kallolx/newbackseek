import { z } from 'zod';
const managerOrigin = (adminOrigin) => {
  const url = new URL(adminOrigin);
  if (url.hostname.startsWith('admin.')) url.hostname = 'manager.' + url.hostname.slice(6);
  else url.port = String(Number(url.port || 3001) + 1); // local development: admin on :3001, manager on :3002
  return url.origin;
};
export const config = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  SITE_ORIGIN: z.url().default('http://localhost:3000'),
  ADMIN_ORIGIN: z.url().default('http://localhost:3001'),
  // Manager portal; defaults to the admin host with "admin." swapped for "manager.".
  MANAGER_ORIGIN: z.url().optional(),
  DATABASE_URL: z.string().min(1), REDIS_URL: z.string().min(1),
  R2_ENDPOINT: z.url().optional(), R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(), R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BUCKET: z.string().optional(),
  MEDIA_PUBLIC_URL: z.url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CONTACT_EMAIL: z.email().default('support@backpagenew.com'),
  CAPTCHA_PROVIDER: z.enum(['turnstile']).optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  FRONTEND_INTERNAL_URL: z.url().optional(),
  REVALIDATE_SECRET: z.string().min(24).optional(),
  ADMIN_VPN_IP: z.union([z.ipv4(), z.literal('')]).optional(),
  CLOUDFLARE_ZONE_ID: z.string().regex(/^[a-f0-9]{32}$/).optional().or(z.literal('').transform(() => undefined)),
}).transform((c) => ({ ...c, MANAGER_ORIGIN: c.MANAGER_ORIGIN || managerOrigin(c.ADMIN_ORIGIN) })).parse(process.env);
