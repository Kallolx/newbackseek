import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { PUBLIC_TAG } from '../../../lib/public-data';

// Called by the API (private network only; Caddy hides /bpn-internal) when ads or SEO settings change.
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET || '';
  const given = request.headers.get('x-revalidate-secret') || '';
  if (secret.length < 24 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response('Not found', { status: 404 });
  revalidateTag(PUBLIC_TAG, { expire: 0 });
  revalidateTag('seo', { expire: 0 });
  return Response.json({ ok: true });
}
