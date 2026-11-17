import { test } from 'node:test';
import assert from 'node:assert/strict';
test('admin storage report: counts, sizes, savings and picture list filters', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const [adminUser] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('storage-admin@example.com','storageadmin','x','admin',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${adminUser.id},now()+interval '1 hour')`;
  const call = (url) => app.inject({ method: 'GET', url, headers: { 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}` } });
  const variants = { thumb: { url: 'https://media.example.com/a/thumb.webp', bytes: 5000, width: 160 }, card: { url: 'https://media.example.com/a/card.webp', bytes: 20000, width: 480 }, full: { url: 'https://media.example.com/a/full.webp', bytes: 75000, width: 1280 } };
  try {
    // Other suites share this database: compare against a baseline, not absolute numbers.
    const base = (await call('/api/admin/storage')).json();
    await sql`insert into media(owner_id,object_key,expected_bytes,original_bytes,content_type,purpose,status,variants,processed_at) values
      (${adminUser.id},'test/s1',200000,4000000,'image/webp','ad','ready',${sql.json(variants)},now()),
      (${adminUser.id},'test/s2',150000,null,'image/webp','ad','ready',${sql.json(variants)},now()),
      (${adminUser.id},'test/s3',1000,null,'image/webp','ad','failed','{}',null),
      (${adminUser.id},'test/s4',300000,null,'image/jpeg','verification','ready','{}',now())`;
    const response = await call('/api/admin/storage');
    assert.equal(response.statusCode, 200, response.body);
    const report = response.json();
    const delta = (path) => path(report) - path(base);
    assert.equal(delta((r) => r.pictures.ready), 2); assert.equal(delta((r) => r.pictures.failed), 1); assert.equal(delta((r) => r.pictures.unattached), 2);
    assert.equal(delta((r) => r.bytes.stored), 200000, '2 pictures × 100 KB of variants');
    assert.equal(delta((r) => r.bytes.original), 4150000, 'known original + uploaded size where unknown');
    assert.equal(delta((r) => r.bytes.uploaded), 350000);
    assert.equal(delta((r) => r.bytes.measured), 1);
    assert.deepEqual(report.variants.map((row) => row.size), ['full', 'card', 'thumb']);
    assert.equal(delta((r) => r.verification.total), 1); assert.equal(report.daily.length, 14);
    assert.equal(report.health.public.ok, false, 'storage not configured in tests');
    const list = await call('/api/admin/media?status=failed&search=storageadmin');
    assert.equal(list.statusCode, 200); assert.equal(list.json().items.length, 1); assert.equal(list.json().items[0].status, 'failed');
    const ready = (await call('/api/admin/media?status=ready&search=storageadmin')).json().items;
    assert.equal(ready.length, 2); assert.equal(Number(ready[0].stored_bytes), 100000);
    // New picture list: 20 per page by default, filters, counts for the chips, sorting.
    const pics = (await call('/api/admin/pictures?search=storageadmin')).json();
    assert.equal(pics.pageSize, 20); assert.equal(pics.total, 3);
    assert.deepEqual({ ready: pics.counts.ready, failed: pics.counts.failed, not_in_ad: pics.counts.not_in_ad }, { ready: 2, failed: 1, not_in_ad: 3 });
    assert.equal((await call('/api/admin/pictures?search=storageadmin&status=failed')).json().items.length, 1);
    assert.equal((await call('/api/admin/pictures?search=storageadmin&placement=in_ad')).json().total, 0);
    const largest = (await call('/api/admin/pictures?search=storageadmin&sort=smallest')).json().items;
    assert.equal(largest[0].stored_bytes, 0, 'smallest first puts the failed picture (0 bytes) first');
    assert.equal((await call('/api/admin/pictures?status=bogus')).statusCode, 400);
    // Bulk retry re-queues only failed pictures.
    const failedId = (await call('/api/admin/pictures?search=storageadmin&status=failed')).json().items[0].id;
    const readyId = (await call('/api/admin/pictures?search=storageadmin&status=ready')).json().items[0].id;
    const retry = await app.inject({ method: 'POST', url: '/api/admin/pictures/retry', payload: { ids: [failedId, readyId] }, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}` } });
    assert.equal(retry.statusCode, 200, retry.body); assert.deepEqual(retry.json(), { queued: 1, skipped: 1 });
    assert.equal((await sql`select status from media where id=${failedId}`)[0].status, 'queued');
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/pictures/delete', payload: { ids: [] }, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}` } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/storage', headers: { 'x-backpagenew-app': 'public', cookie: `bpn-session=${secret}` } })).statusCode, 404);
  } finally {
    await sql`delete from audit_events where actor_id=${adminUser.id}`; await sql`delete from media where owner_id=${adminUser.id}`;
    await sql`delete from sessions where user_id=${adminUser.id}`; await sql`delete from users where id=${adminUser.id}`;
    await app.close(); await sql.end();
    const { redis, images } = await import('../src/queue.mjs'); await images.close().catch(() => {}); if (redis.status !== 'end') await redis.quit().catch(() => {});
  }
});
