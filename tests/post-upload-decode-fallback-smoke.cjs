// Reproduces "The source image could not be decoded" on phones: pictures must
// still upload when the browser cannot decode them (fallback reader, then original file).
const assert = require('node:assert/strict');
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), __dirname + '/../backend'] }));
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';
const scenarios = {
  'createImageBitmap fails': () => { window.createImageBitmap = () => Promise.reject(new DOMException('The source image could not be decoded.', 'InvalidStateError')); },
  'all browser decoding fails': () => { window.createImageBitmap = () => Promise.reject(new DOMException('The source image could not be decoded.', 'InvalidStateError')); HTMLImageElement.prototype.decode = () => Promise.reject(new DOMException('decode failed', 'EncodingError')); },
};
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const buffers = await Promise.all([0, 1, 2, 3].map(n => sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 60 * n, g: 110, b: 190 } } }).jpeg().toBuffer()));
    for (const [name, breakDecoding] of Object.entries(scenarios)) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true });
      await context.addInitScript(breakDecoding);
      const presigns = []; const media = new Map(); let n = 0;
      await context.route('**/api/auth/me', r => r.fulfill({ json: { user: { id: 'u', username: 'p', email: 'p@example.com', email_verified_at: new Date().toISOString() } } }));
      await context.route('**/api/account/ads', r => r.fulfill({ json: { posts: [] } }));
      await context.route('**/api/media/uploads', r => { const body = r.request().postDataJSON(); presigns.push(body); const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; media.set(id, 0); return r.fulfill({ json: { id, url: `${base}/__r2/${id}` } }); });
      await context.route('**/__r2/*', r => r.fulfill({ status: 200, body: '' }));
      await context.route('**/api/media/*/complete', r => r.fulfill({ json: { status: 'queued' } }));
      await context.route('**/api/media/status?*', r => { const ids = new URL(r.request().url()).searchParams.get('ids').split(','); return r.fulfill({ json: { media: ids.map(id => { media.set(id, media.get(id) + 1); return { id, status: media.get(id) > 1 ? 'ready' : 'processing' }; }) } }); });
      const page = await context.newPage();
      await page.goto(base + '/myaccount/post'); await page.getByRole('button', { name: 'Choose pictures' }).waitFor({ timeout: 45000 });
      await page.getByLabel('Upload ad pictures').setInputFiles(buffers.map((buffer, i) => ({ name: `phone-${i}.jpg`, mimeType: 'image/jpeg', buffer })));
      await page.waitForFunction(() => document.querySelectorAll('[data-stage=ready]').length === 4, null, { timeout: 30000 });
      assert.equal(await page.locator('[data-stage=failed]').count(), 0, name + ': no picture fails');
      if (name === 'createImageBitmap fails') assert.ok(presigns.every(p => p.contentType === 'image/webp' && p.bytes < buffers[0].length), 'fallback reader still shrinks to WebP');
      else assert.ok(presigns.every((p, i) => p.contentType === 'image/jpeg' && buffers.some(b => b.length === p.bytes)), 'original file is uploaded for the server to shrink');
      console.log(`${name}: 4/4 pictures ready (${presigns[0].contentType}, ${presigns[0].bytes} bytes)`);
      await context.close();
    }
    // Failed tile layout: compact, no overlapping cover label.
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true });
    await context.route('**/api/auth/me', r => r.fulfill({ json: { user: { id: 'u', username: 'p', email: 'p@example.com', email_verified_at: new Date().toISOString() } } }));
    await context.route('**/api/account/ads', r => r.fulfill({ json: { posts: [] } }));
    await context.route('**/api/media/uploads', r => r.fulfill({ status: 503, json: { error: 'Image storage is not configured' } }));
    const page = await context.newPage();
    await page.goto(base + '/myaccount/post'); await page.getByRole('button', { name: 'Choose pictures' }).waitFor({ timeout: 45000 });
    await page.getByLabel('Upload ad pictures').setInputFiles(buffers.slice(0, 3).map((buffer, i) => ({ name: `x-${i}.jpg`, mimeType: 'image/jpeg', buffer })));
    await page.waitForFunction(() => document.querySelectorAll('[data-stage=failed]').length === 3, null, { timeout: 20000 });
    assert.equal(await page.getByText('Cover photo').count(), 0, 'cover label hidden on failed tile');
    await page.locator('section[aria-labelledby=post-pictures-heading]').screenshot({ path: 'artifacts/post-upload-failed-tiles.png' });
    console.log('failed tiles: compact layout passed');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
