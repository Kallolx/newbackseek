// Server-side SEO: loads the settings the admin controls and builds each page's metadata and structured data.
import { cache } from 'react';
import type { Metadata } from 'next';
import { DESCRIPTION_LIMIT, SEO_DEFAULTS, SITE_ORIGIN, TITLE_LIMIT, absolute, expand, merge, truncate, type PageOverride, type SeoConfig, type SeoSettings, type Vars } from './seo-core';

const API = process.env.API_INTERNAL_URL || 'http://api:4000';
export { SITE_ORIGIN, absolute, excerpt, truncate } from './seo-core';

/** Settings + per-page overrides. Cached for 2 minutes and refreshed at once when the admin saves. */
export const getSeo = cache(async (): Promise<SeoConfig> => {
  const fallback: SeoConfig = { settings: SEO_DEFAULTS, overrides: {} };
  if (process.env.NEXT_PHASE === 'phase-production-build') return fallback;
  try {
    const response = await fetch(API + '/api/seo/config', { next: { revalidate: 120, tags: ['seo'] }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return fallback;
    const body = await response.json() as SeoConfig;
    return { settings: merge(SEO_DEFAULTS, body.settings), overrides: body.overrides || {} };
  } catch { return fallback; }
});

export type Kind = 'home' | 'country' | 'region' | 'city' | 'category' | 'ad' | 'blog' | 'page';
export type MetaInput = {
  path: string; kind: Kind; vars?: Vars;
  /** Used instead of the template when given (still overridden by the admin's per-page settings). */
  title?: string; description?: string;
  image?: string; noindex?: boolean; canonical?: string;
  type?: 'website' | 'article'; published?: string; modified?: string;
};

export function siteVars(settings: SeoSettings): Vars { return { site: settings.site.name, tagline: settings.site.tagline, year: new Date().getFullYear() }; }

export async function pageMetadata(input: MetaInput): Promise<Metadata> {
  const { settings, overrides } = await getSeo();
  const override: PageOverride = overrides[input.path] || {};
  const vars = { ...siteVars(settings), ...input.vars };
  const template = settings.templates[input.kind];
  const title = override.title || input.title || expand(template.title, vars, TITLE_LIMIT);
  const description = truncate(override.description || input.description || expand(template.description, vars) || settings.site.description, DESCRIPTION_LIMIT + 20);
  const canonical = absolute(override.canonical || input.canonical || input.path);
  const image = absolute(override.ogImage || input.image || settings.site.ogImage || '/og-default.png');
  const noindex = Boolean(settings.indexing.siteNoindex || override.noindex || input.noindex);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true, googleBot: { index: false, follow: true } } : { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: {
      title, description, url: canonical, siteName: settings.site.name, locale: settings.site.locale, type: input.type || 'website',
      images: [{ url: image, alt: title }],
      ...(input.type === 'article' ? { publishedTime: input.published, modifiedTime: input.modified } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, images: [image], ...(settings.site.twitter ? { site: '@' + settings.site.twitter.replace(/^@/, '') } : {}) },
  };
}

/** The page's own heading and intro text when the admin wrote one. */
export async function pageOverride(path: string): Promise<PageOverride> { return (await getSeo()).overrides[path] || {}; }

/** Pages members use (account, login) are never shown in search. */
export const privateMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });

// ----- Structured data (JSON-LD) -----
type Crumb = { name: string; path: string };
export const breadcrumbLd = (crumbs: Crumb[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: absolute(crumb.path) })),
});

export const organizationLd = (settings: SeoSettings) => ({
  '@context': 'https://schema.org', '@type': 'Organization', '@id': SITE_ORIGIN + '/#organization',
  name: settings.organization.name, url: SITE_ORIGIN + '/',
  ...(settings.organization.logo ? { logo: absolute(settings.organization.logo) } : {}),
  ...(settings.organization.sameAs.length ? { sameAs: settings.organization.sameAs } : {}),
  ...(settings.organization.email ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: settings.organization.email, availableLanguage: 'English' } } : {}),
});

export const websiteLd = (settings: SeoSettings) => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': SITE_ORIGIN + '/#website',
  url: SITE_ORIGIN + '/', name: settings.site.name, description: settings.site.description, inLanguage: 'en',
  publisher: { '@id': SITE_ORIGIN + '/#organization' },
});

export const collectionLd = (opts: { name: string; path: string; description: string; place?: { city?: string; region?: string; country?: string }; items?: { name: string; path: string }[] }) => ({
  '@context': 'https://schema.org', '@type': 'CollectionPage', name: opts.name, url: absolute(opts.path), description: opts.description, inLanguage: 'en',
  isPartOf: { '@id': SITE_ORIGIN + '/#website' },
  ...(opts.place ? { about: { '@type': 'Place', name: [opts.place.city, opts.place.region, opts.place.country].filter(Boolean).join(', '), address: { '@type': 'PostalAddress', ...(opts.place.city ? { addressLocality: opts.place.city } : {}), ...(opts.place.region ? { addressRegion: opts.place.region } : {}), addressCountry: opts.place.country } } } : {}),
  ...(opts.items?.length ? { mainEntity: { '@type': 'ItemList', numberOfItems: opts.items.length, itemListElement: opts.items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: absolute(item.path) })) } } : {}),
});

export const faqLd = (items: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
});

export const adLd = (opts: { title: string; description: string; path: string; images: string[]; published?: string; modified?: string }) => ({
  '@context': 'https://schema.org', '@type': 'WebPage', name: opts.title, description: opts.description, url: absolute(opts.path), inLanguage: 'en',
  isPartOf: { '@id': SITE_ORIGIN + '/#website' },
  ...(opts.images.length ? { primaryImageOfPage: { '@type': 'ImageObject', url: opts.images[0] }, image: opts.images } : {}),
  ...(opts.published ? { datePublished: opts.published } : {}), ...(opts.modified ? { dateModified: opts.modified } : {}),
});

export const articleLd = (opts: { title: string; description: string; path: string; image: string; published: string; settings: SeoSettings }) => ({
  '@context': 'https://schema.org', '@type': 'BlogPosting', headline: opts.title, description: opts.description, image: [opts.image],
  datePublished: opts.published + 'T12:00:00Z', dateModified: opts.published + 'T12:00:00Z', mainEntityOfPage: absolute(opts.path), inLanguage: 'en',
  author: { '@type': 'Organization', name: opts.settings.organization.name, url: SITE_ORIGIN + '/' },
  publisher: { '@id': SITE_ORIGIN + '/#organization' },
});
