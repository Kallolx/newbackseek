import { test } from 'node:test';
import assert from 'node:assert/strict';

test('post planner: cards, schedule, publish now, publish all, worker, failures, limit', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const { publishDueDrafts, PLANNER_LIMIT } = await import('../src/planner.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();
  const [admin] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('plan-admin@example.com','planadmin','x','admin',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${admin.id},now()+interval '1 hour')`;
  const call = (method, url, payload) => app.inject({ method, url, payload, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}` } });
  await sql`insert into categories(slug,name,group_name) values('plan-cat','Plan Cat','Test') on conflict do nothing`;
  await sql`insert into cities(country_code,country,region,name,href) values('us','United States','Planland','Plan City','/browse/us/planland/plan-city'),('us','United States','Planland','Plan Town','/browse/us/planland/plan-town') on conflict do nothing`;
  const post = (title, extra = {}) => ({ title, description: 'A description that is long enough for an ad.', categorySlug: 'plan-cat', owner: 'planadmin', cityHrefs: ['/browse/us/planland/plan-city', '/browse/us/planland/plan-town'], age: 25, location: 'Downtown', phone: '', contactEmail: '', mediaIds: [], ...extra });
  const board = async () => (await call('GET', '/api/admin/planner')).json();
  try {
    // Create cards; one with a time.
    const a = (await call('POST', '/api/admin/planner', { post: post('First planned ad') })).json().id;
    const later = new Date(Date.now() + 3600000).toISOString();
    const b = (await call('POST', '/api/admin/planner', { post: post('Second planned ad'), publishAt: later })).json().id;
    const c = (await call('POST', '/api/admin/planner', { post: post('Third planned ad') })).json().id;
    assert.ok(a && b && c);
    assert.equal((await call('POST', '/api/admin/planner', { post: post('x') })).statusCode, 400, 'invalid ad details are refused');
    let view = await board();
    assert.deepEqual(view.posts.map((p) => p.status).sort(), ['draft', 'draft', 'scheduled']);
    assert.equal(view.limit, PLANNER_LIMIT);

    // Schedule rules.
    assert.equal((await call('POST', `/api/admin/planner/${a}/schedule`, { publishAt: new Date(Date.now() - 1000).toISOString() })).statusCode, 400);
    assert.equal((await call('POST', `/api/admin/planner/${a}/schedule`, { publishAt: later })).statusCode, 200);
    assert.equal((await call('POST', `/api/admin/planner/${a}/schedule`, { publishAt: null })).statusCode, 200);

    // Edit a card.
    assert.equal((await call('PATCH', `/api/admin/planner/${c}`, { post: post('Third planned ad, edited') })).statusCode, 200);

    // Publish now: queued until the worker runs, then published and off the board.
    assert.equal((await call('POST', `/api/admin/planner/${a}/publish`)).statusCode, 200);
    assert.equal((await board()).posts.find((p) => p.id === a).status, 'queued');
    let run = await publishDueDrafts();
    assert.equal(run.published, 1);
    view = await board();
    assert.ok(!view.posts.some((p) => p.id === a), 'published card leaves the board');
    assert.equal(view.recent[0].title, 'First planned ad');
    const [adA] = await sql`select a.*,(select count(*)::int from placements where ad_id=a.id) as cities from ads a where id=${view.recent[0].ad_id}`;
    assert.equal(adA.status, 'published'); assert.equal(adA.cities, 2);
    assert.ok((await sql`select 1 from audit_events where action='ad.publish' and actor_id=${admin.id} and target_id=${String(adA.id)}`).length, 'counted like a normal publish');
    assert.equal((await call('PATCH', `/api/admin/planner/${a}`, { post: post('Too late') })).statusCode, 404, 'published cards cannot be edited');

    // Scheduled card publishes when its time comes (not before).
    run = await publishDueDrafts(); assert.equal(run.claimed, 0, 'nothing due yet');
    await sql`update ad_drafts set publish_at=now()-interval '1 second' where id=${b}`;
    run = await publishDueDrafts(); assert.equal(run.published, 1);

    // A card that cannot publish shows why, and can be fixed and retried.
    const bad = (await call('POST', '/api/admin/planner', { post: post('Owner is missing here', { owner: 'nobody-like-this' }) })).json().id;
    assert.equal((await call('POST', '/api/admin/planner/publish-all')).json().queued, 2, 'publish all queues every unscheduled card');
    run = await publishDueDrafts();
    assert.equal(run.published, 1);
    const failed = (await board()).posts.find((p) => p.id === bad);
    assert.equal(failed.status, 'failed'); assert.match(failed.error, /owner/i);
    assert.equal((await call('PATCH', `/api/admin/planner/${bad}`, { post: post('Owner is fixed now') })).statusCode, 200);
    assert.equal((await board()).posts.find((p) => p.id === bad).status, 'draft');

    // Pictures still being prepared: the card waits, then publishes with them.
    const [picture] = await sql`insert into media(owner_id,object_key,expected_bytes,content_type,purpose,status) values(${admin.id},'test/planner-picture',100,'image/jpeg','ad','processing') returning id`;
    assert.equal((await call('PATCH', `/api/admin/planner/${bad}`, { post: post('Owner is fixed now', { mediaIds: [picture.id] }) })).statusCode, 200);
    const other = (await call('POST', '/api/admin/planner', { post: post('Wants the same picture', { mediaIds: [picture.id] }) }));
    assert.equal(other.statusCode, 400, 'a picture can be on one card only');
    await call('POST', `/api/admin/planner/${bad}/publish`);
    run = await publishDueDrafts(); assert.equal(run.published, 0);
    assert.equal((await board()).posts.find((p) => p.id === bad).status, 'queued', 'waits for the picture');
    await sql`update media set status='ready',variants=${sql.json({ card: { url: 'https://media.example.com/c.webp' } })} where id=${picture.id}`;
    await sql`update ad_drafts set publish_at=now()-interval '1 second' where id=${bad}`;
    run = await publishDueDrafts(); assert.equal(run.published, 1);
    assert.ok((await sql`select ad_id from media where id=${picture.id}`)[0].ad_id, 'picture attached to the new ad');

    // Duplicate (without pictures) and delete.
    const keep = (await call('POST', '/api/admin/planner', { post: post('Card to copy') })).json().id;
    const copy = (await call('POST', `/api/admin/planner/${keep}/duplicate`)).json().id;
    assert.ok(copy);
    assert.equal((await call('DELETE', `/api/admin/planner/${copy}`)).statusCode, 200);

    // Limit per person.
    await sql`delete from ad_drafts where created_by=${admin.id} and status<>'published'`;
    for (let i = 0; i < PLANNER_LIMIT; i++) await sql`insert into ad_drafts(created_by,payload) values(${admin.id},${sql.json(post('Filler ad ' + i))})`;
    assert.equal((await call('POST', '/api/admin/planner', { post: post('One too many') })).statusCode, 409);
  } finally {
    await sql`delete from ad_drafts where created_by=${admin.id}`;
    await app.close();
  }
});
