import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, totpCode, matchTotp } from '../src/totp.mjs';

test('authenticator codes match RFC 6238', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  assert.equal(totpCode(secret, 1), '287082'); // T=59s
  assert.equal(totpCode(secret, 37037036), '081804'); // T=1111111109s
  assert.equal(matchTotp(secret, '287082', 59000), 1);
  assert.equal(matchTotp(secret, '287082', 89000), 1, 'one step of clock drift is allowed');
  assert.equal(matchTotp(secret, '287082', 200000), null);
  assert.equal(matchTotp(secret, 'abc123', 59000), null);
});

test('account settings: password, two-step login, devices, delete, contact', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { hashPassword } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const call = (method, url, payload, cookie, headers = {}) => app.inject({ method, url, payload, headers: { origin: process.env.SITE_ORIGIN, 'x-backpagenew-app': 'public', ...(cookie ? { cookie } : {}), ...headers } });
  const cookieOf = (response, name = 'bpn-session') => response.headers['set-cookie'] && [].concat(response.headers['set-cookie']).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const [user] = await sql`insert into users(email,username,password_hash,email_verified_at) values('secure@example.com','secureuser',${await hashPassword('first-password-123')},now()) returning id`;
  const login = (password) => call('POST', '/api/auth/login', { email: 'secure@example.com', password, captchaToken: 'test-only' }, undefined, { 'user-agent': 'TestPhone/1.0' });
  try {
    const first = cookieOf(await login('first-password-123')); const second = cookieOf(await login('first-password-123'));
    assert.ok(first && second);
    const security = (await call('GET', '/api/account/security', undefined, first)).json();
    assert.equal(security.sessions.length, 2); assert.equal(security.sessions.filter((s) => s.current).length, 1);
    assert.equal(security.sessions[0].userAgent, 'TestPhone/1.0'); assert.equal(security.account.twoFactor, false);

    // Password: needs the current one; signs out other devices.
    assert.equal((await call('POST', '/api/account/password', { current: 'wrong-password-xx', password: 'second-password-123' }, first)).statusCode, 400);
    assert.equal((await call('POST', '/api/account/password', { current: 'first-password-123', password: 'short' }, first)).statusCode, 400);
    const changed = await call('POST', '/api/account/password', { current: 'first-password-123', password: 'second-password-123' }, first);
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal((await call('GET', '/api/auth/me', undefined, second)).statusCode, 401, 'other device signed out');
    assert.equal((await call('GET', '/api/auth/me', undefined, first)).statusCode, 200, 'this device stays signed in');
    assert.equal((await login('first-password-123')).statusCode, 401);

    // Two-step verification.
    const setup = (await call('POST', '/api/account/two-factor/setup', {}, first)).json();
    assert.match(setup.otpauth, /^otpauth:\/\/totp\/BackpageNew/); assert.match(setup.qrSvg, /<svg/);
    assert.equal((await call('POST', '/api/account/two-factor/enable', { code: '000000' }, first)).statusCode, 400);
    const now = Math.floor(Date.now() / 30000);
    const enabled = await call('POST', '/api/account/two-factor/enable', { code: totpCode(setup.secret, now) }, first);
    assert.equal(enabled.statusCode, 200, enabled.body);
    const { backupCodes } = enabled.json(); assert.equal(backupCodes.length, 10);

    const parked = await login('second-password-123');
    assert.equal(parked.statusCode, 200); assert.equal(parked.json().twoFactorRequired, true);
    assert.equal(cookieOf(parked), undefined, 'no session before the second step');
    const ticket = cookieOf(parked, 'bpn-2fa'); assert.ok(ticket);
    assert.equal((await call('POST', '/api/auth/login/two-factor', { code: '123456' }, ticket)).statusCode, 400);
    assert.equal((await call('POST', '/api/auth/login/two-factor', { code: totpCode(setup.secret, now) }, ticket)).statusCode, 400, 'a used code cannot be used again');
    const done = await call('POST', '/api/auth/login/two-factor', { code: backupCodes[0].toUpperCase() }, ticket);
    assert.equal(done.statusCode, 200, done.body);
    const third = cookieOf(done); assert.ok(third);
    assert.equal((await call('POST', '/api/auth/login/two-factor', { code: backupCodes[1] }, ticket)).statusCode, 401, 'ticket is single use');
    const parkedAgain = cookieOf(await login('second-password-123'), 'bpn-2fa');
    assert.equal((await call('POST', '/api/auth/login/two-factor', { code: backupCodes[0] }, parkedAgain)).statusCode, 400, 'backup codes work once');
    assert.equal((await call('GET', '/api/account/security', undefined, third)).json().account.backupCodesLeft, 9);

    // Devices: sign out the others.
    const others = await call('POST', '/api/account/sessions/sign-out-others', {}, third);
    assert.equal(others.statusCode, 200); assert.ok(others.json().signedOut >= 1);
    assert.equal((await call('GET', '/api/auth/me', undefined, first)).statusCode, 401);

    // Turning 2-step off needs a code.
    assert.equal((await call('POST', '/api/account/two-factor/disable', { code: '000000' }, third)).statusCode, 400);
    assert.equal((await call('POST', '/api/account/two-factor/disable', { code: totpCode(setup.secret, now + 1) }, third)).statusCode, 200);
    assert.equal((await login('second-password-123')).json().twoFactorRequired, undefined);

    // Contact form.
    const contact = await call('POST', '/api/contact', { name: 'Pat', email: 'pat@example.com', topic: 'General question', message: 'Hello, this is a question about my account.', captchaToken: 'test-only' });
    assert.equal(contact.statusCode, 200, contact.body);
    assert.equal((await sql`select count(*)::int as n from contact_messages where email='pat@example.com'`)[0].n, 1);

    // Delete: needs DELETE and the password; removes the ads and signs out.
    await sql`insert into categories(slug,name,group_name) values('feed-a','Feed A','Test') on conflict do nothing`;
    const [ad] = await sql`insert into ads(owner_id,category_slug,title,description,status) values(${user.id},'feed-a','Secure ad title','A description long enough here.','published') returning id`;
    assert.equal((await call('DELETE', '/api/account', { confirm: 'DELETE', password: 'wrong-password-xx' }, third)).statusCode, 400);
    assert.equal((await call('DELETE', '/api/account', { confirm: 'delete', password: 'second-password-123' }, third)).statusCode, 400);
    const deleted = await call('DELETE', '/api/account', { confirm: 'DELETE', password: 'second-password-123' }, third);
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal((await sql`select status from users where id=${user.id}`)[0].status, 'deleted');
    assert.equal((await sql`select status from ads where id=${ad.id}`)[0].status, 'deleted');
    assert.equal((await call('GET', '/api/auth/me', undefined, third)).statusCode, 401);
  } finally {
    await sql`delete from contact_messages where email='pat@example.com'`;
    await app.close();
  }
});
