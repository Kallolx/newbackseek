// Connection problems while submitting pictures (mocked APIs against `next start`):
// dropped connections are retried automatically; a dead connection says so clearly and is reported.
const assert = require('node:assert/strict');
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), __dirname + '/../backend'] }));
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';

async function fillForm(page) {
  const pick = async (label, option) => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('combobox', { name: 'Search ' + label.toLowerCase() }).fill(option); await page.getByRole('option', { name: option, exact: true }).first().click(); };
  await pick('Country', 'United States'); await pick('State or region', 'Alabama'); await pick('City', 'Auburn'); await pick('Category', 'Dating'); await pick('Subcategory', 'Women Seeking Men');
  await page.locator('input[name=headline]').fill('Network check'); await page.locator('input[name=age]').fill('25'); await page.locator('input[name=location]').fill('Downtown');
  await page.locator('.ProseMirror').click(); await page.keyboard.type('A detailed description that is long enough for the form to accept it.'); await page.locator('input[type=checkbox]').check();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const buffers = await Promise.all([0, 1, 2].map(n => sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 60 * n, g: 100, b: 190 } } }).jpeg().toBuffer()));
    for (const scenario of ['recovers', 'dead']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      let attempts = 0, saved = false, ok = 0; const reports = [];
      await context.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'u', username: 'p', email: 'p@example.com', email_verified_at: new Date().toISOString() } } }));
      await context.route('**/api/account/ads', route => { if (route.request().method() === 'POST') { saved = true; return route.fulfill({ status: 201, json: { post: { id: '1' } } }); } return route.fulfill({ json: { posts: [] } }); });
      await context.route('**/api/media/upload-problem', route => { reports.push(route.request().postDataJSON()); return route.fulfill({ status: 204, body: '' }); });
      await context.route('**/api/media/upload', route => {
        attempts += 1;
        if (scenario === 'dead' || attempts <= 2) return route.abort('connectionreset'); // first two attempts drop, then it recovers
        ok += 1; return route.fulfill({ status: 201, json: { id: `00000000-0000-4000-8000-${String(ok).padStart(12, '0')}`, status: 'queued' } });
      });
      const page = await context.newPage();
      await page.goto(base + '/myaccount/post'); await page.getByRole('button', { name: 'Choose pictures' }).waitFor({ timeout: 45000 });
      await page.getByLabel('Upload ad pictures').setInputFiles(buffers.map((buffer, n) => ({ name: `p${n}.jpg`, mimeType: 'image/jpeg', buffer })));
      await fillForm(page);
      await page.getByRole('button', { name: 'Submit ad for review' }).click();
      if (scenario === 'recovers') {
        await page.waitForURL('**/myaccount', { timeout: 30000 });
        assert.ok(saved && ok === 3, 'all three pictures arrived after automatic retries');
        console.log(`recovers: ${attempts} attempts for 3 pictures (2 dropped), ad saved without the member doing anything`);
      } else {
        await page.getByText(/3 pictures could not be uploaded/).first().waitFor({ timeout: 40000 }); assert.ok((await page.getByText(/3 pictures could not be uploaded/).first().innerText()).includes('Could not reach BackpageNew'));
        assert.equal(saved, false, 'ad is not saved when pictures cannot be sent');
        assert.equal(await page.locator('[data-stage=failed]').count(), 3);
        await page.waitForTimeout(800);
        assert.ok(reports.length >= 1 && reports[0].phase === 'upload' && typeof reports[0].online === 'boolean', 'a report reaches the server');
        assert.ok(!JSON.stringify(reports).includes('p0.jpg'), 'file names are never reported');
        console.log(`dead: ${attempts} attempts, clear message shown, nothing saved, ${reports.length} report(s) sent`);
      }
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
