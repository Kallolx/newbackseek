import { test } from 'node:test';
import assert from 'node:assert/strict';
test('country gate, Cloudflare-only origin and admin security settings', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const cf = (country, ip = '203.0.113.9') => ({ 'cf-ray': '8abc-DAC', 'cf-connecting-ip': ip, 'cf-ipcountry': country });
  const gate = (headers, appName = 'public') => app.inject({ method: 'GET', url: '/api/internal/geo-gate', headers: { 'x-gate-app': appName, ...headers } });
  const [adminUser] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('sec-admin@example.com','secadmin','x','admin',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${adminUser.id},now()+interval '1 hour')`;
  const adminCall = (method, url, payload, headers = {}) => app.inject({ method, url, payload, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}`, ...headers } });
  const settings = { geoEnabled: true, blockedCountries: ['BD'], blockTor: true, blockUnknown: false, protectAdmin: false, cloudflareOnly: true, allowlist: [] };
  try {
    // Defaults: country blocking off, but traffic that skipped Cloudflare is refused.
    assert.equal((await gate(cf('BD'))).statusCode, 204);
    const direct = await gate({});
    assert.equal(direct.statusCode, 403); assert.match(direct.body, /not available in your region/); assert.doesNotMatch(direct.body, /backpage|caddy|next/i);

    // Members cannot read or change security settings.
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/security', headers: { 'x-backpagenew-app': 'public', cookie: `bpn-session=${secret}` } })).statusCode, 404);

    const saved = await adminCall('PUT', '/api/admin/security', settings, cf('US', '198.51.100.20'));
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().settings.edge.status, 'not_configured');
    assert.equal((await gate(cf('BD'))).statusCode, 403);
    assert.equal((await gate(cf('T1'))).statusCode, 403);
    assert.equal((await gate(cf('US'))).statusCode, 204);
    assert.equal((await gate(cf('BD'), 'admin')).statusCode, 204, 'admin panel stays reachable unless protected');

    // An admin in a blocked country cannot lock themselves out of the admin panel.
    const lockout = await adminCall('PUT', '/api/admin/security', { ...settings, protectAdmin: true }, cf('BD', '203.0.113.9'));
    assert.equal(lockout.statusCode, 409, lockout.body);
    const withAllow = await adminCall('PUT', '/api/admin/security', { ...settings, protectAdmin: true, allowlist: ['203.0.113.0/24'] }, cf('BD', '203.0.113.9'));
    assert.equal(withAllow.statusCode, 200, withAllow.body);
    assert.equal((await gate(cf('BD', '203.0.113.9'), 'admin')).statusCode, 204);
    assert.equal((await gate(cf('BD', '192.0.2.50'), 'admin')).statusCode, 403);

    const bad = await adminCall('PUT', '/api/admin/security', { ...settings, allowlist: ['0.0.0.0/0'] }, cf('US'));
    assert.equal(bad.statusCode, 400);
    const view = await adminCall('GET', '/api/admin/security', undefined, cf('BD', '203.0.113.9'));
    assert.equal(view.statusCode, 200); assert.deepEqual(view.json().you, { ip: '203.0.113.9', country: 'BD', allowlisted: true });
    assert.ok(view.json().stats.some((row) => row.reason === 'BD' && row.count >= 1), JSON.stringify(view.json().stats));
    assert.ok((await sql`select 1 from audit_events where action='security.settings'`).length >= 2);

    // Rate limits are per visitor, not shared by everyone behind the proxy.
    const a = await app.inject({ method: 'GET', url: '/api/health', headers: { 'cf-connecting-ip': '198.51.100.1' } });
    const b = await app.inject({ method: 'GET', url: '/api/health', headers: { 'cf-connecting-ip': '198.51.100.2' } });
    assert.equal(a.headers['x-ratelimit-remaining'], b.headers['x-ratelimit-remaining']);
  } finally {
    await sql`update security_settings set geo_enabled=false,protect_admin=false,allowlist='{}',updated_by=null where id=1`;
    await sql`delete from sessions where user_id=${adminUser.id}`; await sql`delete from audit_events where actor_id=${adminUser.id}`; await sql`delete from users where id=${adminUser.id}`;
    await app.close(); await sql.end();
    const { redis, images } = await import('../src/queue.mjs'); await images.close(); await redis.quit();
  }
});
