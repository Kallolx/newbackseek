// The header must never flip from "Post an Ad" to "My account / Logout" after loading.
// Run: BPN_PLAYWRIGHT_MODULE=<path> BPN_TEST_BASE=http://localhost:3107 node tests/header-flash-smoke.cjs
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    for (const signedIn of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
      // The account API answers slowly (3 s), like a slow phone connection.
      await context.route('**/api/auth/me', async (route) => { await new Promise((r) => setTimeout(r, 3000)); return signedIn ? route.fulfill({ json: { user: { id: 'u', username: 'poster', email: 'p@example.com', email_verified_at: '2026-01-01' } } }) : route.fulfill({ status: 401, json: { error: 'Please log in' } }); });
      await context.route('**/api/account/ads', (route) => route.fulfill({ json: { posts: [] } }));
      await context.route('**/api/ads**', (route) => route.fulfill({ json: { posts: [], hasMore: false } }));
      await context.route('**/api/locations**', (route) => route.fulfill({ json: { cities: [] } }));
      const page = await context.newPage();
      // First visit teaches the browser who is signed in (only once the session is confirmed).
      await page.goto(base + '/blog'); await page.waitForTimeout(4500);
      const visible = async () => page.evaluate(() => { const shown = (selector) => { const e = document.querySelector(selector); return Boolean(e) && getComputedStyle(e).display !== 'none'; }; return { out: shown('.nav-out'), in: shown('.nav-in') }; });
      for (const path of ['/blog', '/contact', '/guidelines', '/refund-policy', '/blog/staying-safe-when-meeting-someone-new', '/']) {
        await page.goto(base + path, { waitUntil: 'domcontentloaded' });
        // Immediately (the account API has not answered yet): the right links must already show.
        const early = await visible();
        const sample = [];
        for (let i = 0; i < 6; i++) { sample.push(JSON.stringify(await visible())); await page.waitForTimeout(250); }
        assert.deepEqual(early, signedIn ? { out: false, in: true } : { out: true, in: false }, `${signedIn ? 'member' : 'visitor'} ${path}: header right at first paint`);
        assert.equal(new Set(sample).size, 1, `${path}: header does not change while loading (${[...new Set(sample)].join(' → ')})`);
      }
      console.log(signedIn ? 'member: My account + Logout from the first paint on every page' : 'visitor: Post an Ad from the first paint on every page');
      await context.close();
    }
    // A stale hint (signed out elsewhere) corrects itself once the session answers.
    const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await context.addInitScript(() => { try { localStorage.setItem('bpn-member', '1'); } catch {} });
    await context.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: 'Please log in' } }));
    const page = await context.newPage(); await page.goto(base + '/contact');
    await page.waitForFunction(() => document.documentElement.dataset.member !== 'yes', null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('bpn-member')), null);
    console.log('stale hint is cleared once the server says signed out');
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
