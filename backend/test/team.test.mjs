import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredPermissions, managerMay, DEFAULT_PERMISSIONS } from '../src/team.mjs';

test('manager permissions: listed routes only, everything else is administrator-only', () => {
  assert.deepEqual(DEFAULT_PERMISSIONS, ['overview', 'ads', 'publish', 'bump', 'distribute', 'media', 'reports', 'verification', 'health', 'security', 'vpn']);
  assert.equal(managerMay(['media'], 'GET', '/api/admin/:collection', { collection: 'media' }), true);
  assert.equal(managerMay(['media'], 'GET', '/api/admin/:collection', { collection: 'users' }), false);
  assert.equal(managerMay(['bump'], 'POST', '/api/admin/ads/:id/:action', { action: 'bump' }), true);
  assert.equal(managerMay(['bump'], 'POST', '/api/admin/ads/:id/:action', { action: 'status' }), false);
  assert.equal(managerMay(['users'], 'POST', '/api/admin/users/:id/impersonate', {}), false, 'support sign-in stays admin-only');
  assert.equal(managerMay(DEFAULT_PERMISSIONS, 'GET', '/api/admin/team', {}), false, 'team is admin-only');
  assert.equal(managerMay([], 'GET', '/api/admin/summary', {}), true);
  assert.equal(requiredPermissions('GET', '/api/admin/unknown'), null);
});

test('manager portal: sign-in, permission checks and Team page', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { hashPassword, token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const origins = { admin: process.env.ADMIN_ORIGIN, manager: 'https://manager.example.com', public: process.env.SITE_ORIGIN };
  const call = (context, method, url, payload, cookie) => app.inject({ method, url, payload, headers: { origin: origins[context], 'x-backpagenew-app': context, ...(cookie ? { cookie } : {}) } });
  const [owner] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('team-admin@example.com','teamadmin',${await hashPassword('admin-password-123')},'admin',now()) returning id`;
  const adminSecret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(adminSecret)},${owner.id},now()+interval '1 hour')`;
  const adminCookie = `bpn-admin-session=${adminSecret}`;
  let managerId;
  try {
    const list = await call('admin', 'GET', '/api/admin/team', undefined, adminCookie);
    assert.equal(list.statusCode, 200, list.body);
    assert.equal(list.json().permissions.find((p) => p.key === 'users').default, false);
    const weak = await call('admin', 'POST', '/api/admin/team', { name: 'Sam Manager', email: 'sam@example.com', username: 'sam_mgr', password: 'short', permissions: ['ads'] }, adminCookie);
    assert.equal(weak.statusCode, 400);
    const created = await call('admin', 'POST', '/api/admin/team', { name: 'Sam Manager', email: 'Sam@Example.com', username: 'sam_mgr', password: 'manager-password-1', permissions: ['ads', 'media', 'ads'] }, adminCookie);
    assert.equal(created.statusCode, 200, created.body); managerId = created.json().id;
    assert.equal((await call('admin', 'POST', '/api/admin/team', { name: 'Again', email: 'sam@example.com', username: 'sam_two', password: 'manager-password-1', permissions: [] }, adminCookie)).statusCode, 409);

    // Signs in only on the manager host; not on the admin panel or the public site.
    const login = (context, url) => call(context, 'POST', url, { email: 'sam@example.com', password: 'manager-password-1', captchaToken: 'test-only' });
    assert.equal((await login('admin', '/api/admin/auth/login')).statusCode, 401);
    assert.equal((await login('public', '/api/auth/login')).statusCode, 401);
    assert.equal((await call('manager', 'POST', '/api/admin/auth/login', { email: 'team-admin@example.com', password: 'admin-password-123', captchaToken: 'test-only' })).statusCode, 401, 'administrators use the admin panel');
    const signedIn = await login('manager', '/api/admin/auth/login');
    assert.equal(signedIn.statusCode, 200, signedIn.body);
    const managerCookie = signedIn.headers['set-cookie'].split(';')[0];
    assert.ok(managerCookie.startsWith('bpn-admin-session='));
    const me = (await call('manager', 'GET', '/api/auth/me', undefined, managerCookie)).json().user;
    assert.deepEqual(me.permissions, ['ads', 'media']); assert.equal(me.role, 'manager'); assert.equal(me.display_name, 'Sam Manager');

    // Granted sections work; everything else is refused by the server.
    assert.equal((await call('manager', 'GET', '/api/admin/ads', undefined, managerCookie)).statusCode, 200);
    assert.equal((await call('manager', 'GET', '/api/admin/media', undefined, managerCookie)).statusCode, 200);
    assert.equal((await call('manager', 'GET', '/api/admin/summary', undefined, managerCookie)).statusCode, 200);
    assert.equal((await call('manager', 'GET', '/api/admin/users', undefined, managerCookie)).statusCode, 403);
    assert.equal((await call('manager', 'GET', '/api/admin/security', undefined, managerCookie)).statusCode, 403);
    assert.equal((await call('manager', 'GET', '/api/admin/team', undefined, managerCookie)).statusCode, 403);
    assert.equal((await call('admin', 'GET', '/api/admin/ads', undefined, managerCookie)).statusCode, 403, 'a manager session is useless on the admin panel');

    // Admin changes access: takes effect on the next request.
    assert.equal((await call('admin', 'PATCH', `/api/admin/team/${managerId}`, { permissions: ['security'] }, adminCookie)).statusCode, 200);
    assert.equal((await call('manager', 'GET', '/api/admin/ads', undefined, managerCookie)).statusCode, 403);
    assert.equal((await call('manager', 'GET', '/api/admin/security', undefined, managerCookie)).statusCode, 200);

    // Team table shows activity; managers are not listed among members.
    await sql`insert into audit_events(actor_id,action,target_id) values(${managerId},'ad.publish','1'),(${managerId},'ad.bump','1')`;
    const row = (await call('admin', 'GET', '/api/admin/team', undefined, adminCookie)).json().managers.find((m) => m.id === managerId);
    assert.equal(row.published, 1); assert.equal(row.bumped, 1); assert.ok(row.last_login_at);
    assert.equal((await call('admin', 'GET', `/api/admin/team/${managerId}/activity`, undefined, adminCookie)).json().events.length, 2);
    assert.equal((await call('admin', 'GET', '/api/admin/users?search=sam_mgr', undefined, adminCookie)).json().items.length, 0);

    // Password reset and suspension sign the manager out.
    assert.equal((await call('admin', 'POST', `/api/admin/team/${managerId}/password`, { password: 'new-manager-password' }, adminCookie)).statusCode, 200);
    assert.equal((await call('manager', 'GET', '/api/auth/me', undefined, managerCookie)).statusCode, 401);
    assert.equal((await call('admin', 'PATCH', `/api/admin/team/${managerId}`, { status: 'suspended' }, adminCookie)).statusCode, 200);
    assert.equal((await call('manager', 'POST', '/api/admin/auth/login', { email: 'sam@example.com', password: 'new-manager-password', captchaToken: 'test-only' })).statusCode, 401);
    assert.equal((await call('admin', 'DELETE', `/api/admin/team/${managerId}`, undefined, adminCookie)).statusCode, 200);
    assert.equal((await sql`select status from users where id=${managerId}`)[0].status, 'deleted');
  } finally {
    await sql`delete from sessions where user_id=${owner.id}`;
    if (managerId) await sql`delete from sessions where user_id=${managerId}`;
    await app.close();
  }
});
