// Admin → SEO (mocked API): tabs, health score, title templates with live preview, page overrides, redirects, tools, save bar. Phone + desktop.
// Run: BPN_PLAYWRIGHT_MODULE=<path> BPN_ADMIN_BASE=http://localhost:3101 node tests/seo-admin-smoke.cjs
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_ADMIN_BASE || 'http://localhost:3101';
const shots = process.env.BPN_SHOTS || '.';

const defaults = {
  site: { name: 'BackpageNew', tagline: 'Local Classifieds & Personal Ads', description: 'BackpageNew is the new Backpage alternative.', ogImage: '', twitter: '', locale: 'en_US' },
  organization: { name: 'BackpageNew', logo: '', email: 'support@backpagenew.com', sameAs: [] },
  templates: Object.fromEntries(['home', 'country', 'region', 'city', 'category', 'ad', 'blog', 'page'].map((k) => [k, { title: k === 'city' ? '{city}, {region} Classifieds & Personal Ads – {site}' : '{title} – {site}', description: 'Browse free classifieds in {city}, {region}. {adsLine} Post on {site}.' }])),
  indexing: { minAdsForListing: 1, adMaxAgeDays: 0, siteNoindex: false, sitemaps: { pages: true, locations: true, listings: true, ads: true }, imagesInSitemap: true, adultRating: true },
  robots: { extra: '', blockTrainingBots: false, blockAllAiBots: false },
  verification: { google: '', bing: '', yandex: '', baidu: '', pinterest: '' },
  analytics: { ga4: '', cloudflareBeacon: '' },
  schema: { organization: true, website: true, breadcrumbs: true, itemList: true, ad: true, blog: true, faq: true },
  indexnow: { enabled: true, key: 'a'.repeat(32) }, llms: { enabled: true, text: '' },
};
const locations = [{ code: 'us', name: 'United States', regions: [{ name: 'Arizona', id: '/browse/us/arizona', cities: [{ name: 'Phoenix', id: '/browse/us/arizona/phoenix' }] }] }];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
      const context = await browser.newContext({ viewport, isMobile: name === 'phone' });
      await context.addCookies([{ name: 'bpn-admin-session', value: 'test', url: base }]);
      const saved = { settings: null, page: null, redirect: null, inspect: 0, pages: [], redirects: [] };
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url()); const method = route.request().method(); const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname === '/api/auth/me') return json({ user: { id: 'a', username: 'boss', role: 'admin', permissions: [] } });
        if (url.pathname === '/api/admin/summary') return json({ counts: {}, daily: [] });
        if (url.pathname === '/api/admin/seo' && method === 'GET') return json({ settings: saved.settings || defaults, defaults, pages: saved.pages, redirects: saved.redirects, submissions: [], origin: 'https://backpagenew.com' });
        if (url.pathname === '/api/admin/seo' && method === 'PUT') { saved.settings = route.request().postDataJSON(); return json({ ok: true }); }
        if (url.pathname === '/api/admin/seo/health') return json({ robots: { status: 200, sitemapListed: true, blocksEverything: false }, sitemap: { status: 200, children: 5 }, indexnow: { status: 200, matches: true, last: null }, counts: { ads: 120, cities: 564, overrides: 0, redirects: 0, listingPages: 340 }, verification: { google: false, bing: false, yandex: false, baidu: false, pinterest: false }, siteNoindex: false, hasOgImage: false, hasLogo: false, sameAsCount: 0, analytics: { ga4: false, cloudflareBeacon: false } });
        if (url.pathname === '/api/admin/seo/page' && method === 'PUT') { saved.page = route.request().postDataJSON(); saved.pages = [{ path: saved.page.path, title: saved.page.title, description: saved.page.description, h1: '', intro: saved.page.intro, canonical: null, og_image: null, noindex: false, updated_at: new Date().toISOString() }]; return json({ ok: true }); }
        if (url.pathname === '/api/admin/seo/redirect' && method === 'PUT') { saved.redirect = route.request().postDataJSON(); saved.redirects = [{ from_path: saved.redirect.from, to_path: saved.redirect.to, status: saved.redirect.status, hits: 0, note: null }]; return json({ ok: true }); }
        if (url.pathname === '/api/admin/seo/inspect') { saved.inspect += 1; return json({ path: '/', status: 200, redirect: '', ms: 41, title: 'BackpageNew – The New Backpage Alternative for Local Classifieds', description: 'BackpageNew is the new Backpage alternative. Browse and post free local classifieds and personal ads in the US, Canada, the UK and Australia.', canonical: 'https://backpagenew.com', robots: 'index, follow', xRobots: '', og: { title: 't', description: 'd', image: 'https://backpagenew.com/og-default.png', type: 'website' }, twitterCard: 'summary_large_image', h1: ['Local Classifieds'], schemas: ['Organization', 'WebSite', 'FAQPage'], words: 420, links: 90, images: 4, imagesWithoutAlt: 0 }); }
        return json({ error: 'not mocked ' + url.pathname }, 404);
      });
      const page = await context.newPage();
      await page.goto(base + '/admin/seo');
      await page.getByText('SEO score').waitFor({ timeout: 90000 });
      assert.ok(await page.getByText('Checklist').isVisible());
      await page.screenshot({ path: `${shots}/seo-${name}-overview.png` });

      // Titles: edit the city template and see the preview change.
      await page.getByRole('tab', { name: 'Titles' }).click();
      await page.getByRole('textbox', { name: 'Title template' }).fill('{city} Classifieds, {region} | {site}');
      await page.getByText('Phoenix Classifieds, Arizona | BackpageNew').first().waitFor();
      await page.screenshot({ path: `${shots}/seo-${name}-titles.png` });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForFunction(() => !document.body.innerText.includes('Unsaved changes'));
      assert.equal(saved.settings.templates.city.title, '{city} Classifieds, {region} | {site}');

      // Pages: choose a city, write text, save.
      await page.getByRole('tab', { name: 'Pages' }).click();
      await page.getByRole('combobox', { name: 'Country', exact: true }).click(); await page.getByRole('option', { name: 'United States' }).click();
      await page.getByRole('combobox', { name: 'State / region' }).click(); await page.getByRole('option', { name: 'Arizona' }).click();
      await page.getByRole('combobox', { name: 'City', exact: true }).click(); await page.getByRole('option', { name: 'Phoenix' }).click();
      assert.equal(await page.getByPlaceholder('/browse/us/arizona/phoenix').first().inputValue(), '/browse/us/arizona/phoenix');
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Phoenix classifieds and personal ads');
      await page.getByRole('textbox', { name: 'Text shown on the page' }).fill('Phoenix is the biggest city in Arizona.');
      await page.getByRole('button', { name: 'Save page' }).click();
      await page.getByText('Customised pages (1)').waitFor();
      assert.equal(saved.page.path, '/browse/us/arizona/phoenix');
      await page.screenshot({ path: `${shots}/seo-${name}-pages.png` });

      // Redirects.
      await page.getByRole('tab', { name: 'Redirects' }).click();
      await page.getByRole('textbox', { name: 'From' }).fill('/old-page'); await page.getByRole('textbox', { name: 'To' }).fill('/new-page');
      await page.getByRole('button', { name: 'Add redirect' }).click();
      await page.getByText('/old-page → /new-page').waitFor();

      // Tools: check a page.
      await page.getByRole('tab', { name: 'Tools' }).click();
      await page.getByRole('button', { name: 'Check', exact: true }).click();
      await page.getByText('Structured data: Organization, WebSite, FAQPage').waitFor();
      await page.screenshot({ path: `${shots}/seo-${name}-tools.png`, fullPage: true });

      // Indexing: the emergency switch asks first.
      await page.getByRole('tab', { name: 'Indexing' }).click();
      await page.getByLabel('Hide the whole site').click({ force: true });
      await page.getByText('Hide the whole site?').waitFor();
      await page.getByRole('button', { name: 'Cancel' }).click();
      assert.ok(!(await page.getByText('Unsaved changes').isVisible().catch(() => false)), 'cancelled: nothing changed');
      await page.getByRole('tab', { name: 'Connect' }).click();
      await page.getByRole('textbox', { name: 'Google Search Console' }).fill('abc123');
      await page.getByText('Unsaved changes').waitFor();
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scroll');
      console.log(name, 'ok');
      await context.close();
    }
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
