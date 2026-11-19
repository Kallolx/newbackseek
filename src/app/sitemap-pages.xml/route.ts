import { staticPages } from '../../content/pages';
import { SITE_ORIGIN, getSeo } from '../../lib/seo';

export const dynamic = 'force-dynamic';

// Sitemap for the site's own pages (home, guides, blog, legal). Location, category and ad sitemaps come from the API.
export async function GET() {
  const { settings } = await getSeo();
  if (!settings.indexing.sitemaps.pages) return new Response('Not found', { status: 404 });
  const urls = staticPages.map((page) => `<url><loc>${SITE_ORIGIN}${page.path === '/' ? '/' : page.path}</loc>${page.changed ? `<lastmod>${page.changed}</lastmod>` : ''}</url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
