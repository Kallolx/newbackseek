// SEO helpers that run anywhere (server pages and the admin preview): types, defaults, and title/description templates.
// Keep SEO_DEFAULTS in step with backend/src/seo.mjs (the API owns the real settings; these are the fallback).
export type Template = { title: string; description: string };
export type SeoSettings = {
  site: { name: string; tagline: string; description: string; ogImage: string; twitter: string; locale: string };
  organization: { name: string; logo: string; email: string; sameAs: string[] };
  templates: Record<'home' | 'country' | 'region' | 'city' | 'category' | 'ad' | 'blog' | 'page', Template>;
  indexing: { minAdsForListing: number; adMaxAgeDays: number; siteNoindex: boolean; sitemaps: { pages: boolean; locations: boolean; listings: boolean; ads: boolean }; imagesInSitemap: boolean; adultRating: boolean };
  robots: { extra: string; blockTrainingBots: boolean; blockAllAiBots: boolean };
  verification: { google: string; bing: string; yandex: string; baidu: string; pinterest: string };
  connected: { google: boolean; bing: boolean };
  analytics: { ga4: string; cloudflareBeacon: string };
  schema: { organization: boolean; website: boolean; breadcrumbs: boolean; itemList: boolean; ad: boolean; blog: boolean; faq: boolean };
  indexnow: { enabled: boolean; key: string };
  llms: { enabled: boolean; text: string };
};
export type PageOverride = { title?: string | null; description?: string | null; h1?: string | null; intro?: string | null; canonical?: string | null; ogImage?: string | null; noindex?: boolean };
export type SeoConfig = { settings: SeoSettings; overrides: Record<string, PageOverride> };

export const SEO_DEFAULTS: SeoSettings = {
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
  indexing: { minAdsForListing: 1, adMaxAgeDays: 0, siteNoindex: false, sitemaps: { pages: true, locations: true, listings: true, ads: true }, imagesInSitemap: true, adultRating: true },
  robots: { extra: '', blockTrainingBots: false, blockAllAiBots: false },
  verification: { google: '', bing: '', yandex: '', baidu: '', pinterest: '' },
  connected: { google: false, bing: false },
  analytics: { ga4: '', cloudflareBeacon: '' },
  schema: { organization: true, website: true, breadcrumbs: true, itemList: true, ad: true, blog: true, faq: true },
  indexnow: { enabled: true, key: '' },
  llms: { enabled: true, text: '' },
};

export const SITE_ORIGIN = (process.env.SITE_ORIGIN || process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://backpagenew.com').replace(/\/$/, '');
export const absolute = (pathOrUrl: string) => (/^https?:\/\//.test(pathOrUrl) ? pathOrUrl : SITE_ORIGIN + (pathOrUrl.startsWith('/') ? '' : '/') + pathOrUrl);

/** Shortens text at a word boundary, with an ellipsis. */
export function truncate(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return cut.replace(/\s+\S*$/, '').replace(/[\s,;:–-]+$/, '') + '…';
}
/** Plain text from the HTML or markdown-ish ad description, ready for a meta description. */
export function excerpt(text: string, max = 155) {
  return truncate(text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[*_#>`]+/g, ' '), max);
}

export type Vars = Record<string, string | number | undefined>;
/** Fills {city}, {region}, … in a template. Long {title}/{excerpt} values are shortened so titles stay near 60 characters. */
export function expand(template: string, vars: Vars, limit = 0) {
  const fill = (values: Vars) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? '')).replace(/\s+/g, ' ').replace(/\s+([,.:;!?])(\s|$)/g, '$1$2').replace(/^[\s|–-]+|[\s|–-]+$/g, '').trim();
  const full = fill(vars);
  if (!limit || full.length <= limit || !('title' in vars) || !template.includes('{title}')) return full;
  const over = full.length - limit;
  return fill({ ...vars, title: truncate(String(vars.title), Math.max(20, String(vars.title).length - over)) });
}

export function merge<T>(base: T, extra: unknown): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return (extra === undefined ? base : extra) as T;
  const source = (typeof extra === 'object' && extra !== null ? extra : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(base)) out[key] = merge((base as Record<string, unknown>)[key], source[key]);
  return out as T;
}

export const TITLE_LIMIT = 62;
export const DESCRIPTION_LIMIT = 158;
