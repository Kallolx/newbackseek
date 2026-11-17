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
    await sql`insert into media(owner_id,object_key,expected_bytes,original_bytes,content_type,purpose,status,variants,processed_at) values
      (${adminUser.id},'test/s1',200000,4000000,'image/webp','ad','ready',${sql.json(variants)},now()),
      (${adminUser.id},'test/s2',150000,null,'image/webp','ad','ready',${sql.json(variants)},now()),
      (${adminUser.id},'test/s3',1000,null,'image/webp','ad','failed','{}',null),
      (${adminUser.id},'test/s4',300000,null,'image/jpeg','verification','ready','{}',now())`;
    const response = await call('/api/admin/storage');
    assert.equal(response.statusCode, 200, response.body);
    const report = response.json();
    assert.equal(report.pictures.ready, 2); assert.equal(report.pictures.failed, 1); assert.equal(report.pictures.unattached, 2);
    assert.equal(report.bytes.stored, 200000, '2 pictures × 100 KB of variants');
    assert.equal(report.bytes.original, 4150000, 'known original + uploaded size where unknown');
    assert.equal(report.bytes.uploaded, 350000);
    assert.equal(report.bytes.saved, 3950000); assert.equal(report.bytes.measured, 1);
    assert.deepEqual(report.variants.map((row) => row.size), ['full', 'card', 'thumb']);
    assert.equal(report.verification.total, 1); assert.equal(report.daily.length, 14);
    assert.equal(report.health.public.ok, false, 'storage not configured in tests');
    const list = await call('/api/admin/media?status=failed');
    assert.equal(list.statusCode, 200); assert.equal(list.json().items.length, 1); assert.equal(list.json().items[0].status, 'failed');
    const ready = (await call('/api/admin/media?status=ready')).json().items;
    assert.equal(ready.length, 2); assert.equal(Number(ready[0].stored_bytes), 100000);
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/storage', headers: { 'x-backpagenew-app': 'public', cookie: `bpn-session=${secret}` } })).statusCode, 404);
  } finally {
    await sql`delete from media where owner_id=${adminUser.id}`;
    await sql`delete from sessions where user_id=${adminUser.id}`; await sql`delete from users where id=${adminUser.id}`;
    await app.close(); await sql.end();
    const { redis, images } = await import('../src/queue.mjs'); await images.close().catch(() => {}); if (redis.status !== 'end') await redis.quit().catch(() => {});
  }
});
