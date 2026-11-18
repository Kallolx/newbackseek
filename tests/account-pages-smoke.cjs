// Account settings, wallet, two-step login, blog, contact and legal pages (mocked API, phone size).
// Run: BPN_PLAYWRIGHT_MODULE=<path to playwright> BPN_TEST_BASE=http://localhost:3107 node tests/account-pages-smoke.cjs
const { chromium } = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BPN_TEST_BASE || 'http://localhost:3107';
const shots = process.env.BPN_SHOTS || '.';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BPN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const calls = [];
  let twoFactor = false;
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); calls.push(`${method} ${url.pathname}`);
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/api/auth/me') return json({ user: { id: 'u1', username: 'poster', email: 'p@example.com', email_verified_at: new Date().toISOString(), verified: false } });
    if (url.pathname === '/api/account/ads') return json({ posts: [] });
    if (url.pathname === '/api/account/security') return json({ account: { createdAt: '2026-01-05T10:00:00Z', passwordSet: true, passwordChangedAt: null, google: false, twoFactor, twoFactorSince: twoFactor ? new Date().toISOString() : null, backupCodesLeft: twoFactor ? 10 : 0 }, sessions: [{ id: 'aaaaaaaaaaaaaaaa', current: true, createdAt: new Date().toISOString(), userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604.1', ip: '203.0.113.9', country: 'US' }, { id: 'bbbbbbbbbbbbbbbb', current: false, createdAt: '2026-11-01T10:00:00Z', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537', ip: '198.51.100.4', country: 'CA' }] });
    if (url.pathname === '/api/account/two-factor/setup') return json({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauth: 'otpauth://totp/x', qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>' });
    if (url.pathname === '/api/account/two-factor/enable') { twoFactor = true; return json({ backupCodes: Array.from({ length: 10 }, (_, i) => `abcd${i}-ef01${i}`) }); }
    if (url.pathname === '/api/auth/login') return json({ twoFactorRequired: true });
    if (url.pathname === '/api/auth/login/two-factor') return json({ user: { id: 'u1' } });
    if (url.pathname === '/api/ads' || url.pathname === '/api/locations') return json({ posts: [], cities: [], hasMore: false });
    return json({ error: 'not mocked ' + url.pathname }, 404);
  });
  const page = await context.newPage();
  try {
    // Account settings
    await page.goto(base + '/myaccount/settings');
    await page.getByRole('heading', { name: 'Account settings' }).waitFor({ timeout: 60000 });
    for (const name of ['Profile', 'Change password', 'Two-step verification', 'Signed-in devices', 'Delete account']) assert.ok(await page.getByRole('heading', { name }).isVisible(), name);
    assert.ok(await page.getByText('Safari on iPhone').isVisible()); assert.ok(await page.getByText('Chrome on Windows').isVisible());
    await page.getByRole('button', { name: 'Set up' }).click();
    await page.getByLabel('QR code for your authenticator app').waitFor();
    await page.screenshot({ path: shots + '/settings-setup.png', fullPage: true });
    await page.getByRole('textbox', { name: 'Code' }).fill('123456');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await page.getByText('Save these backup codes.').waitFor();
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.getByText('10 backup codes left').waitFor();
    await page.getByRole('button', { name: 'Delete my account' }).click();
    assert.ok(await page.getByRole('heading', { name: 'Delete your account?' }).isVisible());
    assert.ok(await page.getByText('Authenticator or backup code').isVisible(), 'delete asks for a code when 2-step is on');
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await page.screenshot({ path: shots + '/settings.png', fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, 'no sideways scroll on settings: ' + overflow);

    // Wallet
    await page.getByRole('link', { name: 'Wallet' }).click();
    await page.getByRole('heading', { name: 'Wallet' }).waitFor();
    await page.getByRole('radio', { name: '$50' }).click();
    await page.getByRole('radio', { name: /Bitcoin/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Crypto top-ups open soon').waitFor();
    assert.ok(await page.getByText('50.00 credits').isVisible());
    await page.screenshot({ path: shots + '/wallet.png', fullPage: true });
    assert.ok(!calls.some((c) => /wallet|topup|payment/i.test(c)), 'wallet design makes no payment calls');

    // Two-step login
    await page.goto(base + '/auth?step=two-factor');
    await page.getByRole('heading', { name: 'Enter your code' }).waitFor();
    await page.getByRole('textbox', { name: 'Code' }).fill('123456');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL(/\/myaccount$/, { timeout: 30000 });

    // Content pages
    for (const [path, heading] of [['/blog', 'Blog'], ['/blog/staying-safe-when-meeting-someone-new', 'Staying safe when you meet someone from an ad'], ['/contact', 'Contact us'], ['/guidelines', 'Community Guidelines'], ['/refund-policy', 'Refund Policy']]) {
      await page.goto(base + path);
      await page.getByRole('heading', { name: heading, level: 1 }).waitFor({ timeout: 60000 });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(wide <= 0, path + ' scrolls sideways by ' + wide);
      await page.screenshot({ path: shots + path.replace(/\//g, '_') + '.png', fullPage: path === '/blog' || path === '/contact' });
    }
    assert.equal(await page.goto(base + '/blog/no-such-post').then((r) => r.status()), 404);
    console.log('PASS');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
