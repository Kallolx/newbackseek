// Moving around the account pages must never flash a skeleton once the account is loaded,
// must not re-ask the server for data it just loaded, and Back/Forward must keep working.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const calls = [];
    const slow = (ms, fn) => async route => { calls.push(new URL(route.request().url()).pathname); await new Promise(resolve => setTimeout(resolve, ms)); return fn(route); };
    const post = { id: '1001', title: 'My first ad', description: 'A description', age: 25, location: 'Auburn', phone: '', contact_email: '', status: 'published', created_at: new Date().toISOString(), category_slug: 'automotive-services', city_name: 'Auburn', city_href: '/browse/us/alabama/auburn', image: null, images: [], media_ids: [] };
    await context.route('**/api/auth/me', slow(400, route => route.fulfill({ json: { user: { id: 'u', username: 'poster', email: 'p@example.com', email_verified_at: new Date().toISOString(), verification_status: 'approved' } } })));
    await context.route('**/api/account/ads**', slow(400, route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/1001') ? { post, images: [], cities: [{ href: post.city_href }] } : { posts: [post] } })));
    await context.route('**/api/ads?*', route => route.fulfill({ json: { posts: [], hasMore: false } }));
    await context.route('**/api/locations?*', route => route.fulfill({ json: { cities: [] } }));
    const page = await context.newPage();
    await page.addInitScript(() => { window.__skeletons = 0; window.__armed = false; let was = false; const tick = () => { const now = !!document.querySelector('[aria-busy="true"]'); if (now && !was && window.__armed) window.__skeletons += 1; was = now; }; new MutationObserver(tick).observe(document, { subtree: true, childList: true, attributes: true }); setInterval(tick, 30); });
    const heading = name => page.getByRole('heading', { name, exact: true }).first().waitFor({ timeout: 15000 });

    await page.goto(base + '/myaccount'); await heading('My ads');
    assert.ok(await page.getByText('Verified', { exact: true }).count() >= 1, 'own card shows the verified badge for an approved member');
    await page.waitForTimeout(500);
    const callsAfterLoad = calls.length;
    await page.evaluate(() => { window.__armed = true; });   // from here on, no skeleton is allowed

    await page.getByRole('link', { name: 'Verification' }).click(); await heading('Verify your account');
    await page.getByRole('link', { name: 'My account' }).first().click(); await heading('My ads');
    await page.getByRole('link', { name: 'Account Settings' }).click(); await heading('Account settings');
    await page.getByRole('link', { name: 'My account' }).first().click(); await heading('My ads');
    await page.getByRole('link', { name: /My first ad/ }).first().click(); await heading('My first ad');
    await page.goBack(); await heading('My ads');
    await page.goForward(); await heading('My first ad');
    await page.goBack(); await heading('My ads');
    await page.waitForTimeout(1200);

    assert.equal(await page.evaluate(() => window.__skeletons), 0, 'no loading skeleton appeared while moving between loaded pages');
    assert.ok(calls.length - callsAfterLoad <= 3, `no repeated server calls while moving around (made ${calls.length - callsAfterLoad})`);
    assert.equal(new URL(page.url()).pathname, '/myaccount');
    // Direct visits to a deep address still work (hard load) and unknown addresses are handled.
    await page.goto(base + '/myaccount/posts/1001'); await heading('My first ad');
    await page.goto(base + '/myaccount/nonsense'); await heading('Page not found');
    console.log(`account navigation: 0 skeleton flashes, ${calls.length - callsAfterLoad} extra server calls, back/forward ok, deep links ok`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
