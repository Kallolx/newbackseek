// SEO control: settings the admin can change, per-page overrides, redirects, robots.txt, sitemaps, llms.txt and IndexNow.
// The public site (Next.js) reads /api/seo/config for titles, descriptions, canonical tags and structured data;
// search engines read robots.txt and the sitemaps straight from this API (Caddy routes those paths here).
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { redis } from './queue.mjs';
import { config } from './config.mjs';
import { cached } from './public-cache.mjs';

const origin = () => config.SITE_ORIGIN.replace(/\/$/, '');
const host = () => new URL(config.SITE_ORIGIN).hostname;

// ---------- Defaults (what the site uses until the admin changes something) ----------
export const SEO_DEFAULTS = {
  site: {
    name: 'BackpageNew', tagline: 'Local Classifieds & Personal Ads',
    description: 'BackpageNew is the new Backpage alternative: browse and post free local classifieds and personal ads in the US, Canada, the UK and Australia, city by city.',
    ogImage: '', twitter: '', locale: 'en_US',
  },
  organization: { name: 'BackpageNew', logo: '', email: 'support@backpagenew.com', sameAs: [] },
  templates: {
    home: { title: 'BackpageNew – The New Backpage Alternative for Local Classifieds', description: 'BackpageNew is the new Backpage alternative. Browse and post free local classifieds and personal ads in the US, Canada, the UK and Australia, city by city.' },
    country: { title: '{country} Classifieds & Personal Ads – {site}', description: 'Free {country} classifieds and personal ads by state and city. Find dating, services, jobs, rentals and more on {site}, the new Backpage alternative.' },
    region: { title: '{region} Classifieds & Personal Ads – {site}', description: 'Free classifieds and personal ads in {region}, {country}. Choose your city to browse local listings on {site}, a Backpage {region} alternative.' },
    city: { title: '{city}, {region} Classifieds & Personal Ads – {site}', description: 'Browse free classifieds and personal ads in {city}, {region}: dating, services, jobs, rentals, for sale and more. {adsLine} Post your own ad free on {site}.' },
    category: { title: '{category} in {city}, {region} – Free Ads | {site}', description: '{adsLine} Free {category} ads in {city}, {region}. Browse local listings or post your own on {site}, the new Backpage alternative.' },
    ad: { title: '{title} – {category} in {city} | {site}', description: '{excerpt}' },
    blog: { title: '{title} – {site} Blog', description: '{excerpt}' },
    page: { title: '{title} – {site}', description: '{excerpt}' },
  },
  indexing: {
    // City + category pages with fewer published ads than this are kept out of Google (thin pages hurt rankings).
    minAdsForListing: 1,
    // Ads older than this many days are marked noindex (0 = never). Old ads are rarely useful to searchers.
    adMaxAgeDays: 0,
    siteNoindex: false,
    sitemaps: { pages: true, locations: true, listings: true, ads: true },
    imagesInSitemap: true,
    adultRating: true,
  },
  robots: { extra: '', blockTrainingBots: false, blockAllAiBots: false },
  verification: { google: '', bing: '', yandex: '', baidu: '', pinterest: '' },
  analytics: { ga4: '', cloudflareBeacon: '' },
  schema: { organization: true, website: true, breadcrumbs: true, itemList: true, ad: true, blog: true, faq: true },
  indexnow: { enabled: true, key: '' },
  llms: { enabled: true, text: '' },
};

const clean = (max) => z.string().trim().max(max);
const url = z.union([z.literal(''), z.string().trim().max(500).refine((value) => /^https:\/\/[^\s]+$/.test(value) || /^\/[^\s]*$/.test(value), 'Use a full https:// address or a path starting with /')]);
const httpsUrl = z.string().trim().max(500).refine((value) => /^https:\/\/[^\s]+$/.test(value), 'Use a full https:// address');
const token = z.union([z.literal(''), z.string().trim().max(160).regex(/^[A-Za-z0-9_\-:.=]+$/, 'Letters, numbers and - _ : . = only')]);
const tpl = z.object({ title: clean(200), description: clean(400) });
const flag = z.boolean();

export const settingsSchema = z.object({
  site: z.object({ name: clean(60).min(2), tagline: clean(100), description: clean(400), ogImage: url, twitter: z.union([z.literal(''), z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/, 'A Twitter/X handle, like @backpagenew')]), locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/) }),
  organization: z.object({ name: clean(80).min(2), logo: url, email: z.union([z.literal(''), z.email().max(254)]), sameAs: z.array(httpsUrl).max(15) }),
  templates: z.object({ home: tpl, country: tpl, region: tpl, city: tpl, category: tpl, ad: tpl, blog: tpl, page: tpl }),
  indexing: z.object({
    minAdsForListing: z.number().int().min(0).max(50), adMaxAgeDays: z.number().int().min(0).max(3650), siteNoindex: flag,
    sitemaps: z.object({ pages: flag, locations: flag, listings: flag, ads: flag }), imagesInSitemap: flag, adultRating: flag,
  }),
  robots: z.object({ extra: z.string().max(3000), blockTrainingBots: flag, blockAllAiBots: flag }),
  verification: z.object({ google: token, bing: token, yandex: token, baidu: token, pinterest: token }),
  analytics: z.object({ ga4: z.union([z.literal(''), z.string().trim().regex(/^G-[A-Z0-9]{4,14}$/, 'A GA4 measurement ID looks like G-XXXXXXXXXX')]), cloudflareBeacon: z.union([z.literal(''), z.string().trim().regex(/^[a-f0-9]{32}$/, 'The 32-character token from Cloudflare Web Analytics')]) }),
  schema: z.object({ organization: flag, website: flag, breadcrumbs: flag, itemList: flag, ad: flag, blog: flag, faq: flag }),
  indexnow: z.object({ enabled: flag, key: z.string().regex(/^[a-f0-9]{32}$/).or(z.literal('')) }),
  llms: z.object({ enabled: flag, text: z.string().max(6000) }),
});

function merge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
  const out = {};
  for (const key of Object.keys(base)) out[key] = merge(base[key], extra && typeof extra === 'object' ? extra[key] : undefined);
  return out;
}

// ---------- Settings (cached for a few seconds) ----------
let cache = null; let cacheAt = 0; let pagesCache = null;
export async function loadSeo(force = false) {
  if (!force && cache && Date.now() - cacheAt < 15000) return cache;
  const [row] = await sql`select data from seo_settings where id=1`;
  let data = merge(SEO_DEFAULTS, row?.data || {});
  if (!data.indexnow.key) {
    data = { ...data, indexnow: { ...data.indexnow, key: randomBytes(16).toString('hex') } };
    await sql`update seo_settings set data=${sql.json(data)},updated_at=now() where id=1`;
  }
  const pages = await sql`select path,title,description,h1,intro,canonical,og_image,noindex from seo_pages`;
  pagesCache = Object.fromEntries(pages.map((page) => [page.path, { title: page.title, description: page.description, h1: page.h1, intro: page.intro, canonical: page.canonical, ogImage: page.og_image, noindex: page.noindex }]));
  cache = { settings: data, overrides: pagesCache }; cacheAt = Date.now();
  return cache;
}
const dropCaches = () => { cache = null; sitemapCache.clear(); };

// ---------- robots.txt ----------
const TRAINING_BOTS = ['GPTBot', 'CCBot', 'Google-Extended', 'ClaudeBot', 'anthropic-ai', 'Bytespider', 'Applebot-Extended', 'PerplexityBot-Training', 'Omgilibot', 'FacebookBot', 'Meta-ExternalAgent', 'cohere-ai'];
const ANSWER_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Claude-User', 'DuckAssistBot', 'MistralAI-User'];
export const robotsHidden = ['/api/', '/myaccount', '/auth', '/post', '/bpn-internal/'];

export function buildRobots(settings) {
  const lines = ['# BackpageNew robots.txt', 'User-agent: *'];
  if (settings.indexing.siteNoindex) lines.push('Disallow: /');
  else { lines.push('Allow: /'); for (const path of robotsHidden) lines.push('Disallow: ' + path); }
  const blocked = [...(settings.robots.blockTrainingBots || settings.robots.blockAllAiBots ? TRAINING_BOTS : []), ...(settings.robots.blockAllAiBots ? ANSWER_BOTS : [])];
  for (const bot of blocked) lines.push('', 'User-agent: ' + bot, 'Disallow: /');
  const extra = settings.robots.extra.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (extra.length) lines.push('', '# Added by the site owner', ...extra);
  lines.push('', 'Sitemap: ' + origin() + '/sitemap.xml', '');
  return lines.join('\n');
}

/** Rejects extra robots lines that could hide the whole site or are not robots syntax. */
export function checkRobotsExtra(text) {
  let group = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const match = /^(user-agent|allow|disallow|crawl-delay|sitemap)\s*:\s*(.*)$/i.exec(line);
    if (!match) return `“${line.slice(0, 60)}” is not valid robots.txt. Use User-agent, Allow, Disallow, Crawl-delay or Sitemap lines.`;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') group = value.toLowerCase();
    if (key === 'disallow' && value === '/' && (group === '*' || /googlebot|bingbot/.test(group))) return 'This would hide the whole site from Google or Bing. Use the “Hide the whole site” switch if you really mean it.';
  }
  return '';
}

// ---------- Sitemaps ----------
const sitemapCache = new Map();
const PAGE = 5000;
const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const iso = (value) => (value ? new Date(value).toISOString() : '');
const urlEntry = (loc, lastmod = '', images = []) => `<url><loc>${xml(origin() + loc)}</loc>${lastmod ? `<lastmod>${iso(lastmod)}</lastmod>` : ''}${images.map((image) => `<image:image><image:loc>${xml(image)}</image:loc></image:image>`).join('')}</url>`;
const urlset = (entries) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>\n`;

async function remember(key, ttlMs, make) {
  const hit = sitemapCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await make(); sitemapCache.set(key, { at: Date.now(), value }); return value;
}

export async function listingStats(minAds) {
  return sql`select c.country_code,c.href,p.category_slug,count(*)::int as n,max(p.ranked_at) as lastmod from placements p join cities c on c.id=p.city_id
    where p.published group by c.country_code,c.href,p.category_slug having count(*) >= ${Math.max(1, minAds)} order by c.href,p.category_slug`;
}

export async function sitemapIndex() {
  const { settings } = await loadSeo();
  return remember('index', 600000, async () => {
    const parts = [];
    const add = (path, lastmod = '') => parts.push(`<sitemap><loc>${xml(origin() + path)}</loc>${lastmod ? `<lastmod>${iso(lastmod)}</lastmod>` : ''}</sitemap>`);
    if (settings.indexing.sitemaps.pages) add('/sitemap-pages.xml');
    if (settings.indexing.sitemaps.locations) add('/sitemap-locations.xml');
    if (settings.indexing.sitemaps.listings) {
      const countries = await sql`select distinct c.country_code from placements p join cities c on c.id=p.city_id where p.published order by 1`;
      for (const row of countries) add(`/sitemap-listings-${row.country_code}.xml`);
    }
    if (settings.indexing.sitemaps.ads) {
      const [{ n, last }] = await sql`select count(*)::int as n,max(updated_at) as last from ads where status='published'`;
      for (let index = 0; index < Math.max(1, Math.ceil(n / PAGE)); index++) if (n) add(`/sitemap-ads-${index + 1}.xml`, last);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join('\n')}\n</sitemapindex>\n`;
  });
}

export async function sitemapLocations() {
  return remember('locations', 600000, async () => {
    const cities = await sql`select c.country_code,c.href,(select max(p.ranked_at) from placements p where p.city_id=c.id and p.published) as lastmod from cities c order by c.href`;
    const entries = []; const seen = new Set();
    for (const city of cities) {
      const [, , code, region] = city.href.split('/');
      for (const path of [`/browse/${code}`, `/browse/${code}/${region}`]) if (!seen.has(path)) { seen.add(path); entries.push(urlEntry(path)); }
      entries.push(urlEntry(city.href, city.lastmod));
    }
    return urlset(entries);
  });
}

export async function sitemapListings(code) {
  const { settings } = await loadSeo();
  return remember('listings:' + code + ':' + settings.indexing.minAdsForListing, 600000, async () => {
    const rows = (await listingStats(settings.indexing.minAdsForListing)).filter((row) => row.country_code === code);
    return urlset(rows.map((row) => urlEntry(`${row.href}/${row.category_slug}`, row.lastmod)));
  });
}

export async function sitemapAds(page) {
  const { settings } = await loadSeo();
  return remember('ads:' + page + ':' + settings.indexing.imagesInSitemap + ':' + settings.indexing.adMaxAgeDays, 300000, async () => {
    const maxAge = settings.indexing.adMaxAgeDays;
    const rows = await sql`select a.id,a.category_slug,a.updated_at,c.href,
        ${settings.indexing.imagesInSitemap ? sql`coalesce((select json_agg(m.variants->'full'->>'url') from (select variants from media where ad_id=a.id and status='ready' and purpose='ad' order by created_at,id limit 3) m),'[]')` : sql`'[]'::json`} as images
      from ads a join cities c on c.id=(select min(city_id) from placements where ad_id=a.id)
      where a.status='published' and (${maxAge}=0 or a.created_at > now() - (${maxAge} || ' days')::interval)
      order by a.id limit ${PAGE} offset ${(page - 1) * PAGE}`;
    return urlset(rows.map((row) => urlEntry(`${row.href}/${row.category_slug}/${row.id}`, row.updated_at, (row.images || []).filter(Boolean))));
  });
}

export function buildLlms(settings) {
  if (settings.llms.text.trim()) return settings.llms.text.trim() + '\n';
  return `# ${settings.site.name}\n\n> ${settings.site.description}\n\n## Main pages\n- [Home](${origin()}/): countries, regions and cities\n- [All cities](${origin()}/browse): browse by city\n- [Blog](${origin()}/blog): tips for posting and staying safe\n- [Guidelines](${origin()}/guidelines): rules for ads and members\n- [Contact](${origin()}/contact): support\n\n## About\n${settings.site.name} lists free local classifieds and personal ads in the United States, Canada, the United Kingdom and Australia. Ads are organised by country, state or region, city and category. Members must be 18 or older.\n`;
}

// ---------- Redirects (applied by the geo gate on every page request) ----------
let redirects = null; let redirectsAt = 0;
const normal = (path) => { const clean = path.split('?')[0].split('#')[0]; return clean.length > 1 ? clean.replace(/\/+$/, '').toLowerCase() : clean; };
export async function redirectFor(uri) {
  if (!redirects || Date.now() - redirectsAt > 30000) {
    const rows = await sql`select from_path,to_path,status from seo_redirects`;
    redirects = new Map(rows.map((row) => [normal(row.from_path), row])); redirectsAt = Date.now();
  }
  if (!redirects.size) return null;
  const [path, query] = String(uri || '').split('?');
  const row = redirects.get(normal(path));
  if (!row) return null;
  void sql`update seo_redirects set hits=hits+1 where from_path=${row.from_path}`.catch(() => {});
  const target = row.to_path ? (row.to_path.startsWith('http') ? row.to_path : origin() + row.to_path) : '';
  return { status: row.status, location: target ? target + (query && !target.includes('?') ? '?' + query : '') : '' };
}

// ---------- IndexNow (Bing, Yandex, Seznam, Naver, Yep and others hear about changes within minutes) ----------
const INDEXNOW = 'https://api.indexnow.org/indexnow';
export async function submitIndexNow(urls, note = '') {
  const { settings } = await loadSeo();
  if (!settings.indexnow.enabled || !settings.indexnow.key || !urls.length) return { sent: 0 };
  let sent = 0;
  for (let i = 0; i < urls.length; i += 5000) {
    const chunk = urls.slice(i, i + 5000);
    let ok = false, status = 0, error = '';
    try {
      const response = await fetch(INDEXNOW, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ host: host(), key: settings.indexnow.key, keyLocation: `${origin()}/${settings.indexnow.key}.txt`, urlList: chunk }) });
      status = response.status; ok = response.status === 200 || response.status === 202;
      if (!ok) error = (await response.text().catch(() => '')).slice(0, 200);
    } catch (cause) { error = String(cause.message || cause).slice(0, 200); }
    await sql`insert into seo_submissions(engine,url_count,ok,status_code,note) values('IndexNow',${chunk.length},${ok},${status || null},${note || error || null})`;
    if (ok) sent += chunk.length;
  }
  return { sent };
}

const CURSOR = 'bpn:indexnow:cursor';
/** Worker: tell search engines about ads that were published, edited or removed since the last run. */
export async function flushIndexNow() {
  const { settings } = await loadSeo(true);
  if (!settings.indexnow.enabled) return { sent: 0 };
  const since = await redis.get(CURSOR);
  const now = new Date().toISOString();
  if (!since) { await redis.set(CURSOR, now); return { sent: 0 }; } // never blast the whole history automatically
  const rows = await sql`select a.id,a.category_slug,c.href from ads a join cities c on c.id=(select min(city_id) from placements where ad_id=a.id)
    where a.updated_at > ${since}::timestamptz and a.updated_at <= ${now}::timestamptz and a.status in ('published','paused','rejected','deleted') order by a.updated_at limit 2000`;
  await redis.set(CURSOR, now);
  if (!rows.length) return { sent: 0 };
  return submitIndexNow(rows.map((row) => `${origin()}${row.href}/${row.category_slug}/${row.id}`), 'ads changed');
}

// ---------- Routes ----------
const pagePath = z.string().trim().max(300).regex(/^\/[A-Za-z0-9\-._~\/%]*$/, 'A path like /browse/us/alabama').transform((value) => (value.length > 1 ? value.replace(/\/+$/, '') : value));
const overrideInput = z.object({
  path: pagePath, title: clean(200).default(''), description: clean(400).default(''), h1: clean(200).default(''), intro: clean(4000).default(''),
  canonical: url.default(''), ogImage: url.default(''), noindex: flag.default(false),
});
const blockedFrom = /^\/(api|_next|admin|bpn-internal)(\/|$)/;
const redirectInput = z.object({
  from: pagePath, to: z.union([z.literal(''), z.string().trim().max(500).refine((value) => /^https:\/\/[^\s]+$/.test(value) || /^\/[^\s]*$/.test(value), 'Use a path like /new-page or a full https:// address')]).default(''),
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308), z.literal(410)]).default(301), note: clean(200).default(''),
});

export function seoRoutes(app, { admin, fail }) {
  // Public: what the website needs to build titles, canonical tags and structured data.
  app.get('/api/seo/config', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return loadSeo();
  });

  // Live counts for city / region / country pages (unique, useful text for each place). Cleared whenever ads change.
  app.get('/api/seo/stats', async (req, reply) => {
    const { href } = z.object({ href: z.string().regex(/^\/browse(\/[a-z0-9-]+){1,3}$/) }).parse(req.query);
    reply.header('Cache-Control', 'no-store');
    const parts = href.split('/').slice(2);
    return cached('seo-stats:' + href, 300000, async () => {
      if (parts.length === 3) {
        const rows = await sql`select p.category_slug as slug,count(*)::int as n from placements p join cities c on c.id=p.city_id where c.href=${href} and p.published group by 1 order by 2 desc`;
        return { level: 'city', total: rows.reduce((sum, row) => sum + row.n, 0), categories: rows };
      }
      if (parts.length === 2) {
        const rows = await sql`select c.href,count(*)::int as n from placements p join cities c on c.id=p.city_id where c.country_code=${parts[0]} and c.href like ${href + '/%'} and p.published group by 1 order by 2 desc`;
        return { level: 'region', total: rows.reduce((sum, row) => sum + row.n, 0), cities: rows };
      }
      const rows = await sql`select split_part(c.href,'/',4) as region,count(*)::int as n from placements p join cities c on c.id=p.city_id where c.country_code=${parts[0]} and p.published group by 1 order by 2 desc`;
      return { level: 'country', total: rows.reduce((sum, row) => sum + row.n, 0), regions: rows };
    });
  });

  app.get('/robots.txt', async (req, reply) => { const { settings } = await loadSeo(); return reply.header('cache-control', 'public, max-age=300').type('text/plain; charset=utf-8').send(buildRobots(settings)); });
  const sendXml = (reply, body) => reply.header('cache-control', 'public, max-age=600').type('application/xml; charset=utf-8').send(body);
  app.get('/sitemap.xml', async (req, reply) => sendXml(reply, await sitemapIndex()));
  app.get('/sitemap-locations.xml', async (req, reply) => sendXml(reply, await sitemapLocations()));
  app.get('/sitemap-listings-:code.xml', async (req, reply) => {
    const code = z.string().regex(/^[a-z]{2}$/).safeParse(req.params.code); if (!code.success) throw fail(404, 'Not found');
    return sendXml(reply, await sitemapListings(code.data));
  });
  app.get('/sitemap-ads-:page.xml', async (req, reply) => {
    const page = z.coerce.number().int().min(1).max(200).safeParse(req.params.page); if (!page.success) throw fail(404, 'Not found');
    return sendXml(reply, await sitemapAds(page.data));
  });
  app.get('/llms.txt', async (req, reply) => { const { settings } = await loadSeo(); if (!settings.llms.enabled) throw fail(404, 'Not found'); return reply.header('cache-control', 'public, max-age=3600').type('text/plain; charset=utf-8').send(buildLlms(settings)); });
  app.get('/:key.txt', async (req, reply) => { // IndexNow ownership proof
    const { settings } = await loadSeo();
    if (!/^[a-f0-9]{32}$/.test(req.params.key) || req.params.key !== settings.indexnow.key) throw fail(404, 'Not found');
    return reply.header('cache-control', 'public, max-age=3600').type('text/plain; charset=utf-8').send(settings.indexnow.key);
  });

  // ----- Admin -----
  app.get('/api/admin/seo', { preHandler: admin }, async () => {
    const { settings } = await loadSeo(true);
    const [pages, redirectRows, submissions] = await Promise.all([
      sql`select path,title,description,h1,intro,canonical,og_image,noindex,updated_at from seo_pages order by updated_at desc limit 500`,
      sql`select from_path,to_path,status,hits,note,created_at from seo_redirects order by created_at desc limit 500`,
      sql`select engine,url_count,ok,status_code,note,created_at from seo_submissions order by created_at desc limit 15`,
    ]);
    return { settings, defaults: SEO_DEFAULTS, pages, redirects: redirectRows, submissions, origin: origin() };
  });

  app.put('/api/admin/seo', { preHandler: admin }, async (req) => {
    const input = settingsSchema.parse(req.body);
    const problem = checkRobotsExtra(input.robots.extra);
    if (problem) throw fail(400, problem);
    const { settings: current } = await loadSeo(true);
    if (!input.indexnow.key) input.indexnow.key = current.indexnow.key; // the key never changes by accident
    await sql.begin(async (tx) => {
      await tx`update seo_settings set data=${tx.json(input)},updated_by=${req.user.id},updated_at=now() where id=1`;
      await audit(tx, req.user.id, 'seo.settings', 'seo', { siteNoindex: input.indexing.siteNoindex });
    });
    dropCaches(); await refreshSite();
    return { ok: true };
  });

  app.put('/api/admin/seo/page', { preHandler: admin }, async (req) => {
    const input = overrideInput.parse(req.body);
    if (blockedFrom.test(input.path)) throw fail(400, 'That address is not a public page.');
    await sql.begin(async (tx) => {
      await tx`insert into seo_pages(path,title,description,h1,intro,canonical,og_image,noindex,updated_by,updated_at)
        values(${input.path},${input.title || null},${input.description || null},${input.h1 || null},${input.intro || null},${input.canonical || null},${input.ogImage || null},${input.noindex},${req.user.id},now())
        on conflict (path) do update set title=excluded.title,description=excluded.description,h1=excluded.h1,intro=excluded.intro,canonical=excluded.canonical,og_image=excluded.og_image,noindex=excluded.noindex,updated_by=excluded.updated_by,updated_at=now()`;
      await audit(tx, req.user.id, 'seo.page', input.path);
    });
    dropCaches(); await refreshSite();
    return { ok: true };
  });

  app.delete('/api/admin/seo/page', { preHandler: admin }, async (req) => {
    const { path } = z.object({ path: pagePath }).parse(req.query);
    await sql`delete from seo_pages where path=${path}`;
    dropCaches(); await refreshSite();
    return { ok: true };
  });

  app.put('/api/admin/seo/redirect', { preHandler: admin }, async (req) => {
    const input = redirectInput.parse(req.body);
    if (blockedFrom.test(input.from)) throw fail(400, 'That address cannot be redirected.');
    if (input.status !== 410 && !input.to) throw fail(400, 'Enter where visitors should go.');
    if (input.to && normal(input.to.replace(origin(), '')) === normal(input.from)) throw fail(400, 'A page cannot redirect to itself.');
    if (input.to.startsWith('/')) {
      // Following one hop must not lead back here (simple loop guard).
      const [back] = await sql`select 1 from seo_redirects where lower(from_path)=${normal(input.to)} and lower(coalesce(to_path,''))=${normal(input.from)}`;
      if (back) throw fail(400, 'That would create a redirect loop.');
    }
    await sql.begin(async (tx) => {
      await tx`insert into seo_redirects(from_path,to_path,status,note,created_by) values(${input.from},${input.to || null},${input.status},${input.note || null},${req.user.id})
        on conflict (from_path) do update set to_path=excluded.to_path,status=excluded.status,note=excluded.note`;
      await audit(tx, req.user.id, 'seo.redirect', input.from, { to: input.to, status: input.status });
    });
    redirects = null;
    return { ok: true };
  });

  app.delete('/api/admin/seo/redirect', { preHandler: admin }, async (req) => {
    const { from } = z.object({ from: pagePath }).parse(req.query);
    await sql`delete from seo_redirects where from_path=${from}`; redirects = null;
    return { ok: true };
  });

  // Fetches a page of the live site the way a crawler would and reports what search engines see.
  app.post('/api/admin/seo/inspect', { preHandler: admin, config: { rateLimit: { max: 30, timeWindow: '5 minutes' } } }, async (req) => {
    const { path } = z.object({ path: pagePath }).parse(req.body);
    if (blockedFrom.test(path) || !config.FRONTEND_INTERNAL_URL) throw fail(400, 'That page cannot be checked.');
    const started = Date.now();
    let response;
    try { response = await fetch(new URL(path, config.FRONTEND_INTERNAL_URL), { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'BackpageNew SEO inspector' } }); }
    catch { throw fail(502, 'The page did not answer in time.'); }
    const html = (await response.text()).slice(0, 2000000);
    const tag = (pattern) => (pattern.exec(html)?.[1] || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
    const meta = (name) => tag(new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]*content="([^"]*)"`, 'i')) || tag(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="${name}"`, 'i'));
    const schemas = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((match) => { try { const data = JSON.parse(match[1]); return [].concat(data['@graph'] || data).map((item) => item['@type']).flat(); } catch { return ['(invalid JSON-LD)']; } });
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    return {
      path, status: response.status, redirect: response.headers.get('location') || '', ms: Date.now() - started,
      title: tag(/<title[^>]*>([^<]*)<\/title>/i), description: meta('description'), canonical: tag(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i),
      robots: meta('robots'), xRobots: response.headers.get('x-robots-tag') || '',
      og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image'), type: meta('og:type') }, twitterCard: meta('twitter:card'),
      h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => match[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean),
      schemas, words: text.split(' ').filter(Boolean).length, links: (html.match(/<a\s[^>]*href="/gi) || []).length,
      images: (html.match(/<img\s/gi) || []).length, imagesWithoutAlt: (html.match(/<img\s(?![^>]*\balt=)[^>]*>/gi) || []).length,
    };
  });

  app.post('/api/admin/seo/indexnow', { preHandler: admin, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const input = z.object({ urls: z.array(pagePath).max(500).default([]), everything: z.boolean().default(false) }).parse(req.body);
    let list = input.urls.map((path) => origin() + path);
    if (input.everything) {
      const rows = await sql`select c.href,a.category_slug,a.id from ads a join cities c on c.id=(select min(city_id) from placements where ad_id=a.id) where a.status='published' order by a.id desc limit 10000`;
      const listings = await listingStats(1);
      list = [origin() + '/', ...rows.map((row) => `${origin()}${row.href}/${row.category_slug}/${row.id}`), ...listings.map((row) => `${origin()}${row.href}/${row.category_slug}`)];
    }
    if (!list.length) throw fail(400, 'Add at least one address.');
    const result = await submitIndexNow(list, input.everything ? 'submitted by admin (everything)' : 'submitted by admin');
    if (!result.sent) throw fail(502, 'The search engines did not accept the request. Check the log below and that IndexNow is on.');
    return result;
  });

  app.get('/api/admin/seo/health', { preHandler: admin, config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } }, async () => {
    const { settings } = await loadSeo(true);
    const probe = async (path) => { try { const response = await fetch(origin() + path, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'BackpageNew SEO health' } }); return { status: response.status, text: response.ok ? await response.text() : '' }; } catch { return { status: 0, text: '' }; } };
    const [robots, sitemap, key] = await Promise.all([probe('/robots.txt'), probe('/sitemap.xml'), probe(`/${settings.indexnow.key}.txt`)]);
    const [counts] = await sql`select (select count(*)::int from ads where status='published') as ads,(select count(*)::int from cities) as cities,(select count(*)::int from seo_pages) as overrides,(select count(*)::int from seo_redirects) as redirects`;
    const listings = await listingStats(settings.indexing.minAdsForListing);
    const [last] = await sql`select created_at,ok,url_count from seo_submissions order by created_at desc limit 1`;
    return {
      robots: { status: robots.status, sitemapListed: /Sitemap:\s*https?:\/\//i.test(robots.text), blocksEverything: /^Disallow:\s*\/\s*$/m.test(robots.text.split(/User-agent:\s*(?!\*)/i)[0] || '') },
      sitemap: { status: sitemap.status, children: (sitemap.text.match(/<sitemap>/g) || []).length },
      indexnow: { status: key.status, matches: key.text.trim() === settings.indexnow.key, last: last || null },
      counts: { ...counts, listingPages: listings.length },
      verification: Object.fromEntries(Object.entries(settings.verification).map(([name, value]) => [name, Boolean(value)])),
      siteNoindex: settings.indexing.siteNoindex, hasOgImage: Boolean(settings.site.ogImage), hasLogo: Boolean(settings.organization.logo), sameAsCount: settings.organization.sameAs.length,
      analytics: { ga4: Boolean(settings.analytics.ga4), cloudflareBeacon: Boolean(settings.analytics.cloudflareBeacon) },
    };
  });
}

/** Tells the public site its cached SEO data changed (the same hook the ad pages use). */
async function refreshSite() {
  if (!config.FRONTEND_INTERNAL_URL || !config.REVALIDATE_SECRET) return;
  await fetch(new URL('/bpn-internal/revalidate', config.FRONTEND_INTERNAL_URL), { method: 'POST', headers: { 'x-revalidate-secret': config.REVALIDATE_SECRET }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}
