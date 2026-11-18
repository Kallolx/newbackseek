// Gallery loading behaviour with slow "large" pictures (mocked CDN against `next start`):
// a medium preview shows before the large picture arrives, the next picture is fetched in the
// background, and tapping an arrow shows something immediately.
const assert = require('node:assert/strict');
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), __dirname + '/../backend'] }));
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const picture = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).webp().toBuffer();
    const colors = ['#c0392b', '#2980b9', '#27ae60'];
    const ids = [1, 2, 3];
    const bytes = { thumb: await Promise.all(colors.map(c => picture(160, 160, c))), card: await Promise.all(colors.map(c => picture(480, 480, c))), full: await Promise.all(colors.map(c => picture(1280, 1280, c))) };
    const photos = ids.map((n, i) => ({ id: `0000000${n}-0000-4000-8000-000000000000`, variants: { thumb: { url: `https://cdn.test/${n}/thumb.webp` }, card: { url: `https://cdn.test/${n}/card.webp` }, full: { url: `https://cdn.test/${n}/full.webp` } } }));
    const post = { id: '1001', title: 'Gallery loading check', description: 'A detailed description for the gallery test.', age: 25, location: 'Auburn', phone: '', contact_email: '', status: 'published', created_at: new Date().toISOString(), category_slug: 'automotive-services' };
    for (const width of [390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const log = [];
      await context.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'u', username: 'owner', email: 'o@example.com', email_verified_at: new Date().toISOString() } } }));
      await context.route('**/api/locations?*', route => route.fulfill({ json: { cities: [{ id: 1, href: '/browse/us/alabama/auburn' }] } }));
      await context.route('**/api/ads?*', route => route.fulfill({ json: { posts: [], hasMore: false } }));
      await context.route('**/api/account/ads**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/1001') ? { post, images: photos, cities: [{ href: '/browse/us/alabama/auburn' }] } : { posts: [{ ...post, city_name: 'Auburn', city_href: '/browse/us/alabama/auburn', image: photos[0].variants, images: photos.map(p => p.variants), media_ids: photos.map(p => p.id) }] } }));
      await context.route('https://cdn.test/**', async route => {
        const [, n, name] = new URL(route.request().url()).pathname.match(/\/(\d)\/(\w+)\.webp/);
        log.push(`${n}/${name}`);
        if (name === 'full') await new Promise(resolve => setTimeout(resolve, n === '3' ? 9000 : 1500)); // slow large pictures (the third is very slow)
        return route.fulfill({ status: 200, contentType: 'image/webp', body: bytes[name][Number(n) - 1] });
      });
      const page = await context.newPage();
      await page.goto(base + '/myaccount/posts/1001');
      const section = page.locator('section[aria-label="Ad pictures"]');
      const opacity = selector => section.locator(selector).first().evaluate(el => Number(getComputedStyle(el).opacity)).catch(() => -1);
      // 1. A preview is visible while the large picture is still downloading.
      await section.locator('img[aria-hidden=true][src$="1/card.webp"]').waitFor({ timeout: 15000 });
      assert.ok(await opacity('img[alt*="picture 1"]') < 0.5, 'large picture is hidden until it has loaded');
      // 2. The large picture then fades in and the preview goes away.
      await page.waitForFunction(() => { const i = document.querySelector('section[aria-label="Ad pictures"] img[alt*="picture 1"]'); return i && i.complete && Number(getComputedStyle(i).opacity) > 0.95; }, null, { timeout: 15000 });
      assert.equal(await section.locator('img[aria-hidden=true][src$="1/card.webp"]').count(), 0, 'preview removed once the large picture shows');
      // 3. The next picture is downloaded in the background without being asked.
      await page.waitForTimeout(2500);
      assert.ok(log.includes('2/full'), 'next picture is preloaded: ' + log.join(','));
      assert.ok(log.indexOf('1/full') < log.indexOf('2/full'), 'the picture on screen loads first');
      // 4. Tapping next shows picture 2 at once (already downloaded: no preview needed, full is visible).
      await page.getByRole('button', { name: 'Next photo' }).first().click();
      await page.waitForFunction(() => { const i = document.querySelector('section[aria-label="Ad pictures"] img[alt*="picture 2"]'); return i && i.complete && Number(getComputedStyle(i).opacity) > 0.9; }, null, { timeout: 1000 });
      // 5. A picture that was NOT preloaded (jump straight to the last one) shows its preview immediately.
      await page.getByRole('button', { name: 'Show picture 3' }).first().click();
      await section.locator('img[aria-hidden=true]').first().waitFor({ timeout: 1000 });
      assert.ok(await section.locator('img[aria-hidden=true]').count() >= 1, 'preview shown instantly for a picture still downloading');
      console.log(`${width}px: preview before large, large fades in, next preloaded, instant next, preview for jump passed`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
