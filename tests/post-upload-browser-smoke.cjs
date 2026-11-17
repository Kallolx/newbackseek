// Upload-on-select flow for the member post form, against `next start` with mocked APIs.
// Run: BPN_PLAYWRIGHT_MODULE=<path to playwright> node tests/post-upload-browser-smoke.cjs
const assert = require('node:assert/strict');
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), __dirname + '/../backend'] }));
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    for (const width of [390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const media = new Map(); const events = []; let created = null; let counter = 0;
      await context.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'u1', username: 'poster', email: 'private@example.com', email_verified_at: new Date().toISOString() } } }));
      await context.route('**/api/account/ads', route => {
        if (route.request().method() === 'POST') { created = route.request().postDataJSON(); events.push('create'); return new Promise(resolve => setTimeout(() => resolve(route.fulfill({ status: 201, json: { post: { id: '2001' } } })), 400)); }
        return route.fulfill({ json: { posts: [] } });
      });
      await context.route('**/api/media/uploads', route => {
        const body = route.request().postDataJSON(); const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
        assert.ok(['image/webp', 'image/jpeg'].includes(body.contentType), 'browser re-encodes pictures before upload');
        media.set(id, { status: 'uploading', polls: 0 }); events.push('presign');
        return route.fulfill({ json: { id, url: `${base}/__r2/${id}`, expiresIn: 300 } });
      });
      await context.route('**/__r2/*', route => new Promise(resolve => setTimeout(() => resolve(route.fulfill({ status: 200, body: '' })), 300)));
      await context.route('**/api/media/*/complete', route => { const id = route.request().url().split('/').at(-2); media.get(id).status = 'queued'; events.push('complete'); return route.fulfill({ json: { status: 'queued' } }); });
      await context.route('**/api/media/status?*', route => {
        const ids = new URL(route.request().url()).searchParams.get('ids').split(',');
        events.push('status:' + ids.length);
        return route.fulfill({ json: { media: ids.map(id => { const row = media.get(id); row.polls += 1; if (row.polls >= 3) row.status = 'ready'; return { id, status: row.status, variants: {} }; }) } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => { throw error; });
      await page.goto(base + '/myaccount/post', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Choose pictures' }).waitFor({ timeout: 45000 });

      // Pictures upload the moment they are chosen; the member keeps typing meanwhile.
      const buffers = await Promise.all([0, 1, 2, 3, 4, 5].map(n => sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 40 * n, g: 120, b: 200 } } }).jpeg().toBuffer()));
      await page.getByLabel('Upload ad pictures').setInputFiles(buffers.slice(0, 4).map((buffer, n) => ({ name: `p${n}.jpg`, mimeType: 'image/jpeg', buffer })));
      await page.getByRole('progressbar').first().waitFor();
      assert.ok(await page.locator('[data-stage]:not([data-stage=ready])').count() > 0, 'tiles start blurred with progress');
      await page.getByLabel('Upload ad pictures').setInputFiles(buffers.slice(4).map((buffer, n) => ({ name: `q${n}.jpg`, mimeType: 'image/jpeg', buffer })));
      await page.waitForFunction(() => document.querySelectorAll('[data-stage=ready]').length === 6, null, { timeout: 30000 });
      await page.waitForTimeout(600);
      const blur = await page.locator('[data-stage=ready] img').first().evaluate(img => getComputedStyle(img).filter);
      assert.equal(blur, 'none', 'ready pictures are sharp');
      assert.ok(events.filter(event => event.startsWith('status:')).length < 30, 'status is batched, not one request per picture per tick');
      if (width === 390) await page.locator('section[aria-labelledby=post-pictures-heading]').screenshot({ path: 'artifacts/post-upload-tiles.png' });

      // Remove one, then fill the form and submit.
      await page.getByRole('button', { name: 'Remove picture 6' }).click();
      const pick = async (label, option) => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('combobox', { name: 'Search ' + label.toLowerCase() }).fill(option); await page.getByRole('option', { name: option, exact: true }).first().click(); };
      await pick('Country', 'United States'); await pick('State or region', 'Alabama'); await pick('City', 'Auburn');
      await pick('Category', 'Dating'); await pick('Subcategory', 'Women Seeking Men');
      await page.locator('input[name=headline]').fill('Upload flow browser check');
      await page.locator('input[name=age]').fill('25'); await page.locator('input[name=location]').fill('Downtown'); await page.locator('input[name=phone]').fill('+1 202 555 0142');
      await page.locator('.ProseMirror').click(); await page.keyboard.type('A detailed description that is long enough for the form to accept it.');
      await page.locator('input[type=checkbox]').check();
      await page.getByRole('button', { name: 'Submit ad for review' }).click();
      await page.getByRole('status').filter({ hasText: /Saving your ad/ }).waitFor();
      if (width === 390) { await page.waitForTimeout(250); await page.screenshot({ path: 'artifacts/post-submit-overlay.png' }); }
      await page.waitForURL('**/myaccount', { timeout: 15000 });
      assert.equal(created.cityHref, '/browse/us/alabama/auburn', 'city is sent directly, no extra lookup');
      assert.equal(created.mediaIds.length, 5, 'removed picture is not attached');
      console.log(`${width}px: upload-on-select, progress ring + blur to sharp, batched status, remove, submit overlay, cityHref save passed`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
