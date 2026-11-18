// Server-side reads for public pages. Listing and ad pages are rendered fresh on
// every visit (never a stale saved copy): the API answers from its own short
// cache, which is cleared the moment any ad changes, so this stays ~15 ms.
// The site's own server talks to the API directly on the private network.
export const PUBLIC_TAG = 'public-ads';
const API = process.env.API_INTERNAL_URL || 'http://api:4000';

export type FeedPost = { id: string; title: string; description: string; age: number; location: string; image?: { card?: { url: string }; thumb?: { url: string } } | null };
export type Feed = { posts: FeedPost[]; hasMore: boolean };
export type AdPage = { post: { id: string; title: string; description: string; age: number; location: string; phone: string; contact_email?: string; created_at: string; category_slug: string }; images: { id: string; variants: Record<string, { url: string }> }[]; cities: { href: string }[] };

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

export async function getFeed(cityHref: string, category: string): Promise<Feed | null> {
  const result = await get<Feed>(`/api/ads?cityHref=${encodeURIComponent(cityHref)}&category=${encodeURIComponent(category)}&page=1`);
  return result === 'missing' ? null : result;
}

export async function getAd(id: string): Promise<AdPage | 'missing' | null> {
  return get<AdPage>(`/api/ads/${encodeURIComponent(id)}`);
}
