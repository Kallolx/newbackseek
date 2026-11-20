// The header (logo included) must stay in place when moving between pages: no full page reload.
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const c = await b.newContext({ viewport: { width: 1000, height: 800 } });
  await c.route('**/api/**', (r) => { const p = new URL(r.request().url()).pathname; if (p === '/api/auth/me') return r.fulfill({ status: 401, json: {} }); return r.fulfill({ json: { posts: [], cities: [] } }); });
  const p = await c.newPage(); await p.goto(base + '/');
  await p.locator('.brand img').waitFor();
  await p.evaluate(() => { document.querySelector('.brand img').dataset.mark = 'same'; });
  let loads = 0; p.on('load', () => { loads += 1; });
  const steps = [['/about', 'About'], ['/blog', 'Blog'], ['/contact', 'Contact'], ['/guidelines', 'Guidelines'], ['/', null], ['/browse/us', null]];
  for (const [path, label] of steps) {
    if (label) await p.locator('.footer a', { hasText: label }).first().click();
    else if (path === '/') await p.locator('.brand').click();
    else await p.locator('a[href="/browse/us"]').first().click();
    await p.waitForURL(base + path, { timeout: 30000 });
    assert.equal(await p.locator('.brand img').getAttribute('data-mark'), 'same', 'logo kept on ' + path);
  }
  assert.equal(loads, 0, 'no full page reloads');
  console.log('PASS: header and logo stayed in place across', steps.length, 'page changes');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
