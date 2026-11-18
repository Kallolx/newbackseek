import { test } from 'node:test';
import assert from 'node:assert/strict';
test('public feed: 40 per page, category index kept in sync, cache cleared on writes', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const [owner] = await sql`insert into users(email,username,password_hash,email_verified_at) values('feed-owner@example.com','feedowner','x',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${owner.id},now()+interval '1 hour')`;
  await sql`insert into categories(slug,name,group_name) values('feed-a','Feed A','Test'),('feed-b','Feed B','Test') on conflict do nothing`;
  const [city] = await sql`insert into cities(country_code,country,region,name,href) values('us','United States','Testland','Feedville','/browse/us/testland/feedville') returning id`;
  const ids = [];
  try {
    for (let n = 0; n < 45; n += 1) {
      const [ad] = await sql`insert into ads(owner_id,category_slug,title,description,status) values(${owner.id},${n < 42 ? 'feed-a' : 'feed-b'},${'Feed ad ' + n},'A description long enough for the feed test.','published') returning id`;
      ids.push(ad.id);
      await sql`insert into placements(ad_id,city_id,ranked_at) values(${ad.id},${city.id},now() - ${n + ' seconds'}::interval)`;
    }
    const [copy] = await sql`select category_slug,published from placements where ad_id=${ids[0]}`;
    assert.deepEqual(copy, { category_slug: 'feed-a', published: true }, 'insert trigger copies category and status');
    const feed = (query) => app.inject({ method: 'GET', url: `/api/ads?cityHref=%2Fbrowse%2Fus%2Ftestland%2Ffeedville&${query}` });
    const page1 = (await feed('category=feed-a')).json();
    assert.equal(page1.posts.length, 40); assert.equal(page1.hasMore, true); assert.equal(page1.pageSize, 40);
    assert.equal(page1.posts[0].title, 'Feed ad 0', 'newest first');
    const page2 = (await feed('category=feed-a&page=2')).json();
    assert.equal(page2.posts.length, 2); assert.equal(page2.hasMore, false);
    assert.equal((await feed('category=feed-b')).json().posts.length, 3, 'other category is separate');

    // Owner pauses an ad through the API: it disappears at once (cache cleared, index updated).
    const pause = await app.inject({ method: 'POST', url: `/api/account/ads/${ids[0]}/status`, payload: { status: 'paused' }, headers: { origin: process.env.SITE_ORIGIN, 'x-backpagenew-app': 'public', cookie: `bpn-session=${secret}` } });
    assert.equal(pause.statusCode, 200, pause.body);
    assert.equal((await sql`select published from placements where ad_id=${ids[0]}`)[0].published, false, 'status trigger updates the index copy');
    assert.equal((await feed('category=feed-a')).json().posts[0].title, 'Feed ad 1');
    assert.equal((await app.inject({ method: 'GET', url: `/api/ads/${ids[0]}` })).statusCode, 404);

    // Verified badge: only owners with an APPROVED verification; approving refreshes the list at once.
    const [photo] = await sql`insert into media(owner_id,object_key,expected_bytes,content_type,purpose,status) values(${owner.id},'test/verified-photo',100,'image/jpeg','verification','ready') returning id`;
    const [pending] = await sql`insert into verifications(user_id,media_id,status) values(${owner.id},${photo.id},'pending') returning id`;
    assert.equal((await feed('category=feed-a')).json().posts[0].verified, false, 'pending verification is not a badge');
    const [admin] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('feed-admin@example.com','feedadmin','x','admin',now()) returning id`;
    const adminSecret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(adminSecret)},${admin.id},now()+interval '1 hour')`;
    const approve = await app.inject({ method: 'PATCH', url: `/api/admin/verifications/${pending.id}`, payload: { status: 'approved' }, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${adminSecret}` } });
    assert.equal(approve.statusCode, 200, approve.body);
    const after = (await feed('category=feed-a')).json().posts;
    assert.ok(after.length && after.every((post) => post.verified === true), 'approved owner shows the badge on the very next request');
    assert.equal((await app.inject({ method: 'GET', url: `/api/ads/${ids[1]}` })).json().post.verified, true, 'ad page data carries it too');
    await sql`delete from sessions where user_id=${admin.id}`; await sql`delete from audit_events where actor_id=${admin.id}`; await sql`delete from users where id=${admin.id}`;
    await sql`delete from verifications where user_id=${owner.id}`; await sql`delete from media where owner_id=${owner.id}`;

    // Category change keeps the copy exact.
    await sql`update ads set category_slug='feed-b' where id=${ids[1]}`;
    assert.equal((await sql`select category_slug from placements where ad_id=${ids[1]}`)[0].category_slug, 'feed-b');

  } finally {
    await sql`delete from placements where city_id=${city.id}`; await sql`delete from audit_events where actor_id=${owner.id}`; if (ids.length) await sql`delete from ads where id in ${sql(ids)}`;
    await sql`delete from cities where id=${city.id}`; await sql`delete from categories where slug in ('feed-a','feed-b')`;
    await sql`delete from sessions where user_id=${owner.id}`; await sql`delete from users where id=${owner.id}`;
    await app.close(); await sql.end();
    const { redis, images } = await import('../src/queue.mjs'); await images.close().catch(() => {}); if (redis.status !== 'end') await redis.quit().catch(() => {});
  }
});
