// Post an Ad picture flow against `next start` with mocked APIs:
// pictures stay on the phone until Submit, then the original files go to /api/media/upload.
// Run: BPN_PLAYWRIGHT_MODULE=<path to playwright> node tests/post-upload-browser-smoke.cjs
const assert = require('node:assert/strict');
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), __dirname + '/../backend'] }));
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const buffers = await Promise.all([0, 1, 2, 3, 4, 5].map(n => sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 40 * n, g: 120, b: 200 } } }).jpeg().toBuffer()));
    for (const width of [390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const uploads = []; let created = null; let failNext = width === 390; let counter = 0; const early = [];
      await context.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'u1', username: 'poster', email: 'private@example.com', email_verified_at: new Date().toISOString() } } }));
      await context.route('**/api/account/ads', route => {
        if (route.request().method() === 'POST') { created = route.request().postDataJSON(); return new Promise(resolve => setTimeout(() => resolve(route.fulfill({ status: 201, json: { post: { id: '2001' } } })), 700)); }
        return route.fulfill({ json: { posts: [] } });
      });
      await context.route('**/api/media/**', route => { early.push(route.request().url()); return route.fulfill({ status: 500, json: { error: 'unexpected' } }); });
      await context.route('**/api/media/upload', async route => {
        const request = route.request();
        const body = request.postDataBuffer();
        const position = uploads.push({ type: request.headers()['content-type'], bytes: body.length });
        await new Promise(resolve => setTimeout(resolve, 250));
        // On phones, reject the 3rd picture once to exercise the failure path.
        if (failNext && position === 3) { failNext = false; return route.fulfill({ status: 400, json: { error: 'This file is not a picture we can use. Choose a JPG, PNG, WebP or AVIF photo.' } }); }
        return route.fulfill({ status: 201, json: { id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, status: 'queued' } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => { throw error; });
      await page.goto(base + '/myaccount/post', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Choose pictures' }).waitFor({ timeout: 45000 });

      await page.getByLabel('Upload ad pictures').setInputFiles(buffers.map((buffer, n) => ({ name: `p${n}.jpg`, mimeType: 'image/jpeg', buffer })));
      assert.equal(await page.getByAltText(/^Ad picture /).count(), 6);
      await page.waitForTimeout(800);
      assert.equal(uploads.length + early.length, 0, 'nothing is uploaded before Submit');
      assert.equal(await page.getByRole('progressbar').count(), 0, 'no progress rings before Submit');
      const filter = await page.getByAltText('Ad picture 1').evaluate(img => getComputedStyle(img).filter);
      assert.equal(filter, 'none', 'previews are not blurred');
      await page.getByRole('button', { name: 'Remove picture 6' }).click();

      const pick = async (label, option) => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('combobox', { name: 'Search ' + label.toLowerCase() }).fill(option); await page.getByRole('option', { name: option, exact: true }).first().click(); };
      await pick('Country', 'United States'); await pick('State or region', 'Alabama'); await pick('City', 'Auburn');
      await pick('Category', 'Dating'); await pick('Subcategory', 'Women Seeking Men');
      await page.locator('input[name=headline]').fill('Upload flow browser check');
      await page.locator('input[name=age]').fill('25'); await page.locator('input[name=location]').fill('Downtown');
      if (width !== 390) await page.locator('input[name=phone]').fill('+1 202 555 0142');
      await page.locator('.ProseMirror').click(); await page.keyboard.type('A detailed description that is long enough for the form to accept it.');
      await page.locator('input[type=checkbox]').check();

      await page.getByRole('button', { name: 'Submit ad for review' }).click();
      await page.getByRole('button', { name: /Uploading pictures \d\/5 · \d+%/ }).waitFor();
      if (width === 390) {
        // One picture is rejected: nothing is saved, the tile says Failed, the reason is shown.
        await page.getByText('This file is not a picture we can use').first().waitFor();
        assert.equal(created, null, 'ad not created when a picture fails');
        assert.equal(await page.locator('[data-stage=failed]').count(), 1);
        assert.equal(await page.locator('[data-stage=uploaded]').count(), 4);
        const before = uploads.length;
        await page.getByRole('button', { name: 'Submit ad for review' }).click();
        await page.waitForURL('**/myaccount', { timeout: 15000 });
        assert.equal(uploads.length - before, 1, 'second submit only sends the failed picture');
      } else {
        await page.waitForURL('**/myaccount', { timeout: 15000 });
      }
      assert.ok(uploads.every(item => item.type === 'image/jpeg'), 'original files are sent as-is');
      assert.ok(uploads.every(item => buffers.some(buffer => buffer.length === item.bytes)), 'no re-encoding on the phone');
      assert.equal(created.mediaIds.length, 5, 'removed picture is not attached');
      assert.equal(new Set(created.mediaIds).size, 5);
      assert.equal(created.cityHref, '/browse/us/alabama/auburn');
      assert.equal(created.phone, width === 390 ? '' : '+1 202 555 0142', 'phone is optional');
      console.log(`${width}px: no upload before submit, originals sent on submit with progress, ${width === 390 ? 'failed picture retried alone, ' : ''}optional phone, ad saved passed`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
