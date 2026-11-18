// Admin Users: compact list, 20 per page, search + status on ONE row, actions in the menu (mocked API).
// Run: BPN_PLAYWRIGHT_MODULE=<path> BPN_ADMIN_BASE=http://localhost:3101 node tests/users-list-smoke.cjs
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_ADMIN_BASE || 'http://localhost:3101';
const shots = process.env.BPN_SHOTS || '.';

const users = Array.from({ length: 45 }, (_, i) => ({ id: 'u' + i, username: i === 0 ? 'averyveryverylongusername_example' : 'member' + i, email: `member${i}@example.com`, role: 'member', status: i % 7 === 3 ? 'suspended' : 'active', email_verified_at: '2026-01-01', created_at: '2026-02-' + String(1 + (i % 27)).padStart(2, '0') + 'T10:00:00Z', verified: i % 4 === 0, verified_by_admin: i % 8 === 0, ad_count: i % 5, last_login: i % 6 === 0 ? null : new Date(Date.now() - i * 86400000).toISOString(), verification_status: null }));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
      const context = await browser.newContext({ viewport, isMobile: name === 'phone' });
      await context.addCookies([{ name: 'bpn-admin-session', value: 'test', url: base }]);
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url()); const json = (body) => route.fulfill({ json: body });
        if (url.pathname === '/api/auth/me') return json({ user: { id: 'a', username: 'boss', role: 'admin', permissions: [] } });
        if (url.pathname === '/api/admin/summary') return json({ counts: {}, daily: [] });
        if (url.pathname === '/api/admin/users') { const page = Number(url.searchParams.get('page') || 1); return json({ items: users.slice((page - 1) * 20, page * 20), total: users.length, page, pageSize: 20 }); }
        return route.fulfill({ status: 404, json: {} });
      });
      const page = await context.newPage();
      await page.goto(base + '/admin/users');
      await page.getByText('@member1', { exact: true }).waitFor({ timeout: 90000 });
      assert.equal(await page.locator('ul > li').filter({ hasText: '@' }).count(), 20, '20 rows');
      // Search and status share one row.
      const search = await page.getByRole('textbox', { name: 'Search records' }).boundingBox();
      const status = await page.locator('input[placeholder="All statuses"]').boundingBox();
      assert.ok(Math.abs(search.y - status.y) < 8, `search and status on one row (${search.y} vs ${status.y})`);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scroll');
      await page.screenshot({ path: `${shots}/users-${name}.png` });
      // Menu holds the details and actions.
      await page.locator('[aria-label="Details and actions for member1"]').click();
      await page.getByText('Joined').waitFor();
      for (const text of ['View ads', 'Mark as Verified', 'Suspend account', 'Sign in as user', 'Delete account']) assert.ok(await page.getByRole('menuitem', { name: new RegExp(text) }).isVisible(), text);
      await page.screenshot({ path: `${shots}/users-${name}-menu.png` });
      await page.keyboard.press('Escape');
      // Pagination: 45 users → 3 pages.
      await page.getByRole('button', { name: '3', exact: true }).first().click().catch(async () => { await page.getByText('3', { exact: true }).last().click(); });
      await page.getByText('@member41', { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await page.locator('ul > li').filter({ hasText: '@' }).count(), 5, 'last page has 5');
      console.log(name, 'ok');
      await context.close();
    }
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
