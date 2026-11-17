import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
test('admin VPN devices: create once-only config, list, remove', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const [adminUser] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('vpn-admin@example.com','vpnadmin','x','admin',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${adminUser.id},now()+interval '1 hour')`;
  const call = (method, url, payload) => app.inject({ method, url, payload, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}`, 'cf-connecting-ip': '192.0.2.10', 'cf-ray': 'test' } });
  try {
    assert.equal((await call('POST', '/api/admin/vpn/devices', { name: 'Phone' })).statusCode, 503, 'no server key reported yet');
    await sql`update vpn_server set public_key='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',listen_port=51820,heartbeat_at=now() where id=1`;
    assert.equal((await call('POST', '/api/admin/vpn/devices', { name: '<script>' })).statusCode, 400);
    const created = await call('POST', '/api/admin/vpn/devices', { name: 'Office phone' });
    assert.equal(created.statusCode, 201, created.body);
    const body = created.json();
    assert.equal(body.device.address, '10.66.66.2');
    assert.match(body.config, /Address = 10\.66\.66\.2\/32/); assert.match(body.config, /Endpoint = 192\.0\.2\.10:51820/); assert.match(body.config, /AllowedIPs = 0\.0\.0\.0\/0, ::\/0/);
    assert.match(body.qrSvg, /^<svg/); assert.equal(body.fileName, 'backpagenew-office-phone.conf');
    assert.equal(created.headers['cache-control'], 'no-store');
    const privateKey = body.config.match(/PrivateKey = (\S+)/)[1];
    const [row] = await sql`select * from vpn_devices where id=${body.device.id}`;
    assert.ok(!JSON.stringify(row).includes(privateKey), 'private key is never stored');
    const der = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(privateKey, 'base64')]);
    const derived = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })).export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    assert.equal(row.public_key, derived, 'stored public key matches the issued private key');
    assert.equal((await call('POST', '/api/admin/vpn/devices', { name: 'Laptop' })).json().device.address, '10.66.66.3');
    const list = await call('GET', '/api/admin/vpn');
    assert.equal(list.statusCode, 200); assert.equal(list.json().devices.length, 2); assert.equal(list.json().server.online, true); assert.equal(list.json().you.onVpn, true);
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/vpn', headers: { 'x-backpagenew-app': 'public', cookie: `bpn-session=${secret}` } })).statusCode, 404, 'not reachable from the public site');
    assert.equal((await call('DELETE', `/api/admin/vpn/devices/${body.device.id}`)).statusCode, 200);
    assert.equal((await call('DELETE', `/api/admin/vpn/devices/${body.device.id}`)).statusCode, 404);
    assert.equal((await call('POST', '/api/admin/vpn/devices', { name: 'Tablet' })).json().device.address, '10.66.66.2', 'freed address is reused');
    assert.ok((await sql`select 1 from audit_events where action='vpn.device.remove'`).length === 1);
  } finally {
    await sql`delete from vpn_devices`; await sql`update vpn_server set public_key=null,listen_port=null,heartbeat_at=null where id=1`;
    await sql`delete from sessions where user_id=${adminUser.id}`; await sql`delete from audit_events where actor_id=${adminUser.id}`; await sql`delete from users where id=${adminUser.id}`;
    await app.close(); await sql.end();
    const { redis, images } = await import('../src/queue.mjs'); await images.close().catch(() => {}); if (redis.status !== 'end') await redis.quit().catch(() => {});
  }
});
