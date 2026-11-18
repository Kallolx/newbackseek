// Post planner (admin) with a simulated API: add a post through the normal ad form, schedule one,
// publish all, watch the progress bar, cards leave when published. Phone and desktop.
// Run: BPN_PLAYWRIGHT_MODULE=<path> BPN_ADMIN_BASE=http://localhost:3101 node tests/planner-smoke.cjs
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_ADMIN_BASE || 'http://localhost:3101';
const shots = process.env.BPN_SHOTS || '.';

function api() {
  let n = 0; const cards = []; const recent = []; let polls = 0;
  const card = (title, extra = {}) => ({ id: 'c' + (++n), status: 'draft', publishAt: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pictures: [], post: { title, description: 'A description that is long enough.', categorySlug: 'women-seeking-men', owner: 'boss', cityHrefs: ['/browse/us/alabama/auburn'], location: '', phone: '', contactEmail: '' }, ...extra });
  cards.push(card('Existing draft one'), card('Existing draft two'));
  return {
    cards, async handle(route) {
      const request = route.request(); const url = new URL(request.url()); const method = request.method(); const path = url.pathname;
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (path === '/api/auth/me') return json({ user: { id: 'a1', username: 'boss', role: 'admin', permissions: [] } });
      if (path === '/api/admin/summary') return json({ counts: { users: 1, ads: 1, published: 1, pending: 0, media: 0, reports: 0, verifications: 0 }, daily: [] });
      if (path === '/api/admin/planner' && method === 'GET') {
        // Simulated worker: each refresh moves one queued card along.
        polls += 1;
        const next = cards.find((item) => item.status === 'publishing') || cards.find((item) => item.status === 'queued');
        if (next && polls % 1 === 0) {
          if (next.status === 'queued') next.status = 'publishing';
          else { cards.splice(cards.indexOf(next), 1); recent.unshift({ id: next.id, ad_id: 900 + n++, published_at: new Date().toISOString(), title: next.post.title, category: 'women-seeking-men', city: '/browse/us/alabama/auburn' }); }
        }
        return json({ posts: cards, recent, limit: 20, now: new Date().toISOString() });
      }
      if (path === '/api/admin/planner' && method === 'POST') { const body = request.postDataJSON(); const { mediaIds, ...post } = body.post; void mediaIds; cards.push(card(post.title, { post })); return json({ id: 'c' + n }); }
      if (path === '/api/admin/planner/publish-all') { const list = cards.filter((item) => item.status === 'draft' || item.status === 'failed'); list.forEach((item) => { item.status = 'queued'; }); return json({ queued: list.length }); }
      const match = path.match(/^\/api\/admin\/planner\/(c\d+)\/(schedule|publish)$/);
      if (match) { const item = cards.find((c) => c.id === match[1]); if (match[2] === 'schedule') { const { publishAt } = request.postDataJSON(); item.publishAt = publishAt; item.status = publishAt ? 'scheduled' : 'draft'; } else item.status = 'queued'; return json({ ok: true }); }
      return json({ error: 'not mocked ' + method + ' ' + path }, 404);
    },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
      const context = await browser.newContext({ viewport, isMobile: name === 'phone' });
      await context.addCookies([{ name: 'bpn-admin-session', value: 'test', url: base }]);
      const server = api(); await context.route('**/api/**', (route) => server.handle(route));
      const page = await context.newPage();
      await page.goto(base + '/admin/planner');
      await page.getByText('Existing draft one').waitFor({ timeout: 90000 });
      assert.ok(await page.getByText('2 drafts').isVisible());

      // Add a post through the normal ad form.
      await page.getByRole('button', { name: 'Add post' }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Ad title' }).fill('Brand new planned ad');
      await dialog.locator('input[placeholder="Choose a category group"]').click(); await page.getByRole('option').first().click();
      await dialog.locator('input[placeholder="Choose a subcategory"]').click(); await page.getByRole('option').first().click();
      await dialog.locator('.tiptap').click(); await page.keyboard.type('This is a description long enough for the form.');
      await dialog.getByRole('button', { name: 'Choose cities' }).click();
      await dialog.getByRole('textbox', { name: '3. Find and select cities' }).fill('Auburn');
      await dialog.getByRole('checkbox', { name: 'Auburn', exact: true }).first().check();
      await dialog.getByRole('button', { name: 'Review changes' }).click();
      await dialog.getByRole('button', { name: 'Add to planner' }).click();
      await page.getByText('Brand new planned ad').waitFor();
      assert.equal(server.cards.length, 3);

      // Schedule one with a quick choice.
      const second = page.locator('[data-status]').filter({ hasText: 'Existing draft two' }).first();
      await second.getByRole('button', { name: 'Schedule' }).click();
      await page.getByRole('dialog').getByText('Tomorrow 9 AM').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click();
      await page.getByText(/Tomorrow, 9:00/).waitFor();
      await page.screenshot({ path: `${shots}/planner-${name}.png`, fullPage: true });

      // Publish all: two drafts go; the scheduled one stays.
      await page.getByRole('button', { name: /Publish all \(2\)/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
      await page.getByText(/Publishing \d of 2/).waitFor({ timeout: 20000 });
      await page.screenshot({ path: `${shots}/planner-${name}-progress.png` });
      await page.getByText('All 2 published').waitFor({ timeout: 40000 });
      assert.ok(await page.getByText('Existing draft two').isVisible(), 'scheduled card stays');
      assert.ok(!(await page.getByText('Brand new planned ad', { exact: true }).isVisible()), 'published card left the board');
      assert.ok(await page.getByText(/Published · last 3 days \(2\)/).isVisible());
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(wide <= 0, 'no sideways scroll: ' + wide);
      console.log(name, 'ok');
      await context.close();
    }
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
