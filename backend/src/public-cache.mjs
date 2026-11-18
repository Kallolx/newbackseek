// Short-lived cache for public reads (feeds and ad details).
//  - Any change to ads bumps a shared version, so cached answers are never stale
//    after a write (the API process bumps it locally at once; Redis shares it).
//  - If the database fails, the last good answer is served instead of an error.
//  - The public site's server-rendered pages are told to refresh (debounced).
import { redis } from './queue.mjs';
import { config } from './config.mjs';

const VERSION_KEY = 'bpn:public:version';
const MAX_ENTRIES = 2000;
const store = new Map();
let version = '0';
let versionCheckedAt = 0;

async function currentVersion() {
  if (Date.now() - versionCheckedAt < 1000) return version;
  versionCheckedAt = Date.now();
  try { version = (await redis.get(VERSION_KEY)) || '0'; } catch {}
  return version;
}

/** Returns a cached value for `key` (fresh for ttlMs within the same data version). */
export async function cached(key, ttlMs, load) {
  const current = await currentVersion();
  const hit = store.get(key);
  if (hit && hit.version === current && Date.now() - hit.at < ttlMs) return hit.value;
  try {
    const value = await load();
    store.delete(key);
    store.set(key, { version: current, at: Date.now(), value });
    if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
    return value;
  } catch (error) {
    if (hit) return hit.value; // fail safe: last good answer beats an error page
    throw error;
  }
}

let revalidateTimer = null;
function revalidateSite() {
  if (!config.FRONTEND_INTERNAL_URL || !config.REVALIDATE_SECRET) return;
  clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => {
    fetch(new URL('/_bpn/revalidate', config.FRONTEND_INTERNAL_URL), { method: 'POST', headers: { 'x-revalidate-secret': config.REVALIDATE_SECRET }, signal: AbortSignal.timeout(5000) })
      .catch(() => {}); // pages still refresh on their own timer
  }, 250);
  revalidateTimer.unref?.();
}

/** Call after any write that can change what the public sees. */
export async function publicDataChanged() {
  store.clear();
  try { version = String(await redis.incr(VERSION_KEY)); versionCheckedAt = Date.now(); } catch { version = String(Date.now()); }
  revalidateSite();
}

// Writes that can change public listings or ad pages.
export const changesPublicData = (req) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  && /^\/api\/(account\/ads|admin\/(ads|publish|posts|bump|distribute|users|media|pictures|verifications))/.test(req.url);
