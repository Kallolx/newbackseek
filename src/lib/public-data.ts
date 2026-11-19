// Server-side reads for public pages. Listing and ad pages are rendered fresh on
// every visit (never a stale saved copy): the API answers from its own short
// cache, which is cleared the moment any ad changes, so this stays ~15 ms.
// The site's own server talks to the API directly on the private network.
import { cache } from 'react';
export const PUBLIC_TAG = 'public-ads';
const API = process.env.API_INTERNAL_URL || 'http://api:4000';

export type FeedPost = { id: string; title: string; description: string; age: number; location: string; verified?: boolean; image?: { card?: { url: string }; thumb?: { url: string } } | null };
export type Feed = { posts: FeedPost[]; hasMore: boolean };
export type AdPage = { post: { id: string; title: string; description: string; age: number; location: string; phone: string; contact_email?: string; created_at: string; category_slug: string }; canonicalHref?: string | null; images: { id: string; variants: Record<string, { url: string }> }[]; cities: { href: string }[] };

async function get<T>(path: string): Promise<T | null | 'missing'> {
  // No API during `next build`: the page renders without data and the browser loads it.
  if (process.env.NEXT_PHASE === 'phase-production-build') return null;
  try {
    const response = await fetch(API + path, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (response.status === 404) return 'missing';
    if (!response.ok) return null;
    return await response.json() as T;
  } catch { return null; } // fail safe: the browser fetches the data itself
}

// Wrapped in cache(): the page and its metadata ask for the same thing, so it is fetched once per visit.
export const getFeed = cache(async (cityHref: string, category: string): Promise<Feed | null> => {
  const result = await get<Feed>(`/api/ads?cityHref=${encodeURIComponent(cityHref)}&category=${encodeURIComponent(category)}&page=1`);
  return result === 'missing' ? null : result;
});

export const getAd = cache(async (id: string): Promise<AdPage | 'missing' | null> => get<AdPage>(`/api/ads/${encodeURIComponent(id)}`));

/** Live counts for a country, region or city page (used for unique, useful page text). */
export type PlaceStats = { level: 'city' | 'region' | 'country'; total: number; categories?: { slug: string; n: number }[]; cities?: { href: string; n: number }[]; regions?: { region: string; n: number }[] };
export const getStats = cache(async (href: string): Promise<PlaceStats | null> => {
  const result = await get<PlaceStats>(`/api/seo/stats?href=${encodeURIComponent(href)}`);
  return result === 'missing' ? null : result;
});
