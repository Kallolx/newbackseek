// Manager portal smoke test (mocked API): managers see only granted sections; admins see Team and can create a manager.
// Run: BPN_PLAYWRIGHT_MODULE=<path to playwright> BPN_ADMIN_BASE=http://localhost:3101 node tests/manager-portal-smoke.cjs
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_ADMIN_BASE || 'http://localhost:3101';

const permissions = [['overview', 'Overview', true], ['ads', 'All Ads', true], ['publish', 'Ad Publish', true], ['bump', 'Bump post', true], ['distribute', 'Distribute post', true], ['users', 'Users', false], ['media', 'Media', true], ['reports', 'Reports', true], ['verification', 'Verification', true], ['health', 'System health', true], ['security', 'Security', true], ['vpn', 'VPN', true], ['planner', 'Post planner', true]].map(([key, label, d]) => ({ key, label, default: d }));
const summary = { counts: { users: 3, ads: 4, published: 2, pending: 1, media: 0, reports: 0, verifications: 0 }, daily: [] };
const health = { databaseMs: 1, queue: { waiting: 0, active: 0, failed: 0 }, uptime: 100, memory: { rss: 1e8, heapUsed: 5e7 }, telemetry: { requests: 1, errors: 0, startedAt: new Date().toISOString(), p95: 5 } };

async function open(browser, user, extra = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'bpn-admin-session', value: 'test', url: base }]);
  const calls = [];
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); calls.push(`${method} ${url.pathname}`);
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/api/auth/me') return json({ user });
    if (url.pathname === '/api/admin/summary') return json(summary);
    if (url.pathname === '/api/admin/health/system') return json(health);
    if (url.pathname === '/api/admin/ads') return json({ items: [], total: 0, page: 1, pageSize: 50 });
    if (extra[`${method} ${url.pathname}`]) return extra[`${method} ${url.pathname}`](route, json);
    return json({ error: 'Not mocked: ' + url.pathname }, 404);
  });
  const page = await context.newPage();
  return { context, page, calls };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    // 1. Manager with Overview, All Ads and Media only.
    const manager = await open(browser, { id: 'm1', username: 'sam_mgr', role: 'manager', display_name: 'Sam Manager', permissions: ['overview', 'ads', 'media'] });
    await manager.page.goto(base + '/admin');
    const sidebar = manager.page.locator('nav, .mantine-AppShell-navbar').first();
    await manager.page.getByRole('link', { name: 'All Ads' }).first().waitFor();
    const links = await manager.page.locator('.mantine-AppShell-navbar a').allInnerTexts();
    console.log('manager sidebar:', links.map((t) => t.trim()).filter(Boolean).join(' | '));
    for (const hidden of ['Users', 'Team', 'Security', 'VPN', 'Ad Publish']) assert.ok(!links.some((t) => t.trim() === hidden), `${hidden} must be hidden for this manager`);
    assert.ok(await manager.page.getByText('Manager portal').first().isVisible(), 'breadcrumb says Manager portal');
    assert.equal(await manager.page.getByRole('button', { name: 'Create ad' }).count(), 0, 'no Create ad without Ad Publish');
    // Typing a forbidden address sends them to a section they can use.
    await manager.page.goto(base + '/admin/team');
    await manager.page.waitForURL(base + '/admin', { timeout: 15000 });
    assert.ok(!manager.calls.some((c) => c.includes('/api/admin/team')), 'never asks the API for the Team list');
    assert.ok(!manager.calls.some((c) => c.includes('/api/admin/users')), 'never asks for Users');
    console.log('manager: /admin/team redirected to', new URL(manager.page.url()).pathname);
    void sidebar;
    await manager.context.close();

    // 2. Administrator: Team page, create a manager with generated password and default access.
    let created;
    const team = { managers: [], permissions };
    const admin = await open(browser, { id: 'a1', username: 'boss', role: 'admin', permissions: [] }, {
      'GET /api/admin/team': (route, json) => json(team),
      'POST /api/admin/team': (route, json) => { created = route.request().postDataJSON(); team.managers.push({ id: 'n1', name: created.name, username: created.username, email: created.email, status: 'active', permissions: created.permissions, created_at: new Date().toISOString(), last_login_at: null, created_by: 'boss', last_action_at: null, published: 0, edited: 0, bumped: 0, distributed: 0, moderated: 0, reviewed: 0, week: 0, total: 0, live_ads: 0 }); return json({ id: 'n1' }); },
    });
    await admin.page.goto(base + '/admin/team');
    await admin.page.getByRole('button', { name: 'Add manager' }).first().click();
    await admin.page.getByLabel('Full name').fill('Rita Jones');
    await admin.page.getByRole('textbox', { name: 'Email' }).fill('rita@example.com');
    assert.equal(await admin.page.getByLabel('Username').inputValue(), 'rita_jones', 'username follows the name');
    const generated = await admin.page.getByRole('textbox', { name: 'Password' }).inputValue();
    assert.ok(generated.length >= 16, 'a password is generated');
    const checked = await admin.page.locator('[aria-label="Sections this manager can open"] input:checked').count();
    assert.equal(checked, 12, 'defaults: everything except Users');
    await admin.page.getByRole('checkbox', { name: 'Media' }).uncheck();
    await admin.page.getByRole('button', { name: 'Create manager' }).click();
    await admin.page.getByText('Manager account created').waitFor();
    assert.deepEqual(created.permissions.includes('media'), false);
    assert.equal(created.permissions.includes('users'), false);
    assert.equal(created.password, generated);
    assert.ok(await admin.page.getByText('Password: ' + generated).isVisible(), 'credentials shown once to copy');
    await admin.page.getByRole('button', { name: 'Done' }).click(); await admin.page.waitForTimeout(600);
    await admin.page.getByText('Rita Jones', { exact: true }).waitFor();
    assert.ok(await admin.page.getByText('11/13 sections').isVisible());
    const adminLinks = await admin.page.locator('.mantine-AppShell-navbar a').allInnerTexts();
    assert.ok(adminLinks.some((t) => t.trim() === 'Team') && adminLinks.some((t) => t.trim() === 'Users'), 'admin sees everything');
    await admin.page.screenshot({ path: process.env.BPN_SHOT || 'manager-team.png', fullPage: true });
    console.log('admin: created manager', created.username, 'with', created.permissions.length, 'sections');
    await admin.context.close();
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
