import { test } from 'node:test';
import assert from 'node:assert/strict';

test('SEO: robots.txt, sitemaps, canonical address, settings, overrides, redirects, IndexNow key', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const { SEO_DEFAULTS, settingsSchema, buildRobots, checkRobotsExtra, loadSeo } = await import('../src/seo.mjs');
  const [database] = await sql`select current_database() as name`; assert.equal(database.name, 'bpn_test');
  const app = await buildApp();

  // --- pure rules ---
  assert.doesNotThrow(() => settingsSchema.parse({ ...SEO_DEFAULTS, indexnow: { enabled: true, key: '' } }), 'the defaults are valid settings');
  const base = structuredClone(SEO_DEFAULTS);
  const plain = buildRobots(base);
  assert.match(plain, /User-agent: \*\nAllow: \//); assert.match(plain, /Disallow: \/myaccount/); assert.match(plain, /Disallow: \/api\//); assert.match(plain, /Sitemap: https:\/\/public\.example\.com\/sitemap\.xml/);
  assert.doesNotMatch(plain, /GPTBot/);
  assert.match(buildRobots({ ...base, robots: { ...base.robots, blockTrainingBots: true } }), /User-agent: GPTBot\nDisallow: \//);
  assert.match(buildRobots({ ...base, robots: { ...base.robots, blockAllAiBots: true } }), /User-agent: OAI-SearchBot/);
  assert.match(buildRobots({ ...base, indexing: { ...base.indexing, siteNoindex: true } }), /User-agent: \*\nDisallow: \/\n/);
  assert.match(checkRobotsExtra('User-agent: *\nDisallow: /'), /whole site/);
  assert.match(checkRobotsExtra('User-agent: Googlebot\nDisallow: /'), /whole site/);
  assert.match(checkRobotsExtra('hello world'), /not valid/);
  assert.equal(checkRobotsExtra('User-agent: BadBot\nDisallow: /\n# comment\nDisallow: /private/'), '');

  // --- data ---
  const [admin] = await sql`insert into users(email,username,password_hash,role,email_verified_at) values('seo-admin@example.com','seoadmin','x','admin',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${admin.id},now()+interval '1 hour')`;
  const call = (method, url, payload, headers = {}) => app.inject({ method, url, payload, headers: { origin: process.env.ADMIN_ORIGIN, 'x-backpagenew-app': 'admin', cookie: `bpn-admin-session=${secret}`, ...headers } });
  const open = (url, headers = {}) => app.inject({ method: 'GET', url, headers: { 'x-backpagenew-app': 'public', ...headers } });
  await sql`insert into categories(slug,name,group_name) values('seo-cat','Seo Cat','Test'),('seo-cat-2','Seo Cat 2','Test') on conflict do nothing`;
  const [cityA] = await sql`insert into cities(country_code,country,region,name,href) values('us','United States','Seoland','Seo A','/browse/us/seoland/seo-a') returning id`;
  const [cityB] = await sql`insert into cities(country_code,country,region,name,href) values('us','United States','Seoland','Seo B','/browse/us/seoland/seo-b') returning id`;
  const ad = async (title, category, status) => (await sql`insert into ads(owner_id,category_slug,title,description,status) values(${admin.id},${category},${title},'A description that is long enough for the test ad.',${status}) returning id`)[0].id;
  const one = await ad('Seo ad one', 'seo-cat', 'published'); const paused = await ad('Seo ad paused', 'seo-cat', 'paused'); const solo = await ad('Seo ad solo', 'seo-cat-2', 'published');
  // Ad "one" is in both cities (B was added first on purpose): the lowest city id decides the main address.
  await sql`insert into placements(ad_id,city_id) values(${one},${cityB.id}),(${one},${cityA.id}),(${paused},${cityA.id}),(${solo},${cityB.id})`;
  await sql`insert into media(owner_id,ad_id,object_key,expected_bytes,content_type,purpose,status,variants) values(${admin.id},${one},'test/seo-pic',1,'image/webp','ad','ready',${sql.json({ full: { url: 'https://media.example.com/full.webp' }, card: { url: 'https://media.example.com/card.webp' } })})`;
  try {
    // --- robots + sitemap index ---
    const robots = await open('/robots.txt'); assert.equal(robots.statusCode, 200); assert.match(robots.headers['content-type'], /text\/plain/); assert.match(robots.body, /Sitemap:/);
    const index = (await open('/sitemap.xml')).body;
    for (const part of ['/sitemap-pages.xml', '/sitemap-locations.xml', '/sitemap-listings-us.xml', '/sitemap-ads-1.xml']) assert.ok(index.includes('https://public.example.com' + part), part + ' is in the index');

    // --- main address for ads that sit in many cities ---
    const ads = (await open('/sitemap-ads-1.xml')).body;
    assert.ok(ads.includes(`https://public.example.com/browse/us/seoland/seo-a/seo-cat/${one}<`), 'main address = lowest city id');
    assert.ok(!ads.includes(`/seo-b/seo-cat/${one}`), 'the other city is not listed');
    assert.ok(!ads.includes(`/${paused}<`), 'paused ads are not listed');
    assert.ok(ads.includes('<image:loc>https://media.example.com/full.webp</image:loc>'), 'picture listed');
    assert.equal((await open(`/api/ads/${one}`)).json().canonicalHref, '/browse/us/seoland/seo-a');

    const locations = (await open('/sitemap-locations.xml')).body;
    for (const path of ['/browse/us', '/browse/us/seoland', '/browse/us/seoland/seo-a']) assert.ok(locations.includes(`https://public.example.com${path}<`), path);
    const listings = (await open('/sitemap-listings-us.xml')).body;
    assert.ok(listings.includes('/browse/us/seoland/seo-a/seo-cat<') && listings.includes('/browse/us/seoland/seo-b/seo-cat-2<'));
    assert.equal((await open('/sitemap-listings-zz.xml')).statusCode, 200, 'unknown country is just empty');
    assert.equal((await open('/sitemap-ads-0.xml')).statusCode, 404);

    // --- settings through the admin ---
    const current = (await call('GET', '/api/admin/seo')).json();
    assert.equal((await call('GET', '/api/admin/seo', undefined, { 'x-backpagenew-app': 'public', cookie: '' })).statusCode, 404);
    assert.match(current.settings.indexnow.key, /^[a-f0-9]{32}$/); assert.equal(current.defaults.indexing.minAdsForListing, 1);
    const bad = await call('PUT', '/api/admin/seo', { ...current.settings, robots: { ...current.settings.robots, extra: 'User-agent: *\nDisallow: /' } });
    assert.equal(bad.statusCode, 400, bad.body); assert.match(bad.json().error, /whole site/);
    assert.equal((await call('PUT', '/api/admin/seo', { ...current.settings, analytics: { ga4: 'nope', cloudflareBeacon: '' } })).statusCode, 400);
    const next = { ...current.settings, indexing: { ...current.settings.indexing, minAdsForListing: 2 }, robots: { ...current.settings.robots, blockTrainingBots: true, extra: 'User-agent: BadBot\nDisallow: /' }, verification: { ...current.settings.verification, google: 'abc123_XYZ' } };
    assert.equal((await call('PUT', '/api/admin/seo', next)).statusCode, 200);
    assert.match((await open('/robots.txt')).body, /User-agent: GPTBot[\s\S]*User-agent: BadBot/);
    assert.ok(!(await open('/sitemap-listings-us.xml')).body.includes('seo-a/seo-cat<'), 'listing pages below the minimum leave the sitemap');
    assert.equal((await open('/api/seo/config')).json().settings.verification.google, 'abc123_XYZ');
    await call('PUT', '/api/admin/seo', { ...next, indexing: { ...next.indexing, minAdsForListing: 1 } });

    // --- per-page text ---
    assert.equal((await call('PUT', '/api/admin/seo/page', { path: '/browse/us/seoland/seo-a', title: 'Seo A custom title', description: 'Custom description', intro: 'Hello\n\nWorld', noindex: false })).statusCode, 200);
    assert.equal((await open('/api/seo/config')).json().overrides['/browse/us/seoland/seo-a'].title, 'Seo A custom title');
    assert.equal((await call('PUT', '/api/admin/seo/page', { path: '/api/secret', title: 'x' })).statusCode, 400, 'only public pages');
    assert.equal((await call('DELETE', '/api/admin/seo/page?path=%2Fbrowse%2Fus%2Fseoland%2Fseo-a')).statusCode, 200);
    assert.equal((await open('/api/seo/config')).json().overrides['/browse/us/seoland/seo-a'], undefined);

    // --- redirects are applied by the gate ---
    const gate = (uri) => open('/api/internal/geo-gate', { 'x-gate-app': 'public', 'x-forwarded-uri': uri, 'cf-ray': 'abc-DAC', 'cf-connecting-ip': '203.0.113.9', 'cf-ipcountry': 'US' });
    assert.equal((await gate('/old-page')).statusCode, 204, 'no redirect yet');
    assert.equal((await call('PUT', '/api/admin/seo/redirect', { from: '/old-page', to: '/new-page', status: 301 })).statusCode, 200);
    const moved = await gate('/old-page/?x=1'); assert.equal(moved.statusCode, 301); assert.equal(moved.headers.location, 'https://public.example.com/new-page?x=1');
    assert.equal((await call('PUT', '/api/admin/seo/redirect', { from: '/new-page', to: '/old-page', status: 301 })).statusCode, 400, 'loop is refused');
    assert.equal((await call('PUT', '/api/admin/seo/redirect', { from: '/api/anything', to: '/x', status: 301 })).statusCode, 400);
    assert.equal((await call('PUT', '/api/admin/seo/redirect', { from: '/gone-page', status: 410 })).statusCode, 200);
    assert.equal((await gate('/gone-page')).statusCode, 410);
    assert.equal((await call('DELETE', '/api/admin/seo/redirect?from=%2Fold-page')).statusCode, 200);
    assert.equal((await gate('/old-page')).statusCode, 204, 'redirect removed');
    await call('DELETE', '/api/admin/seo/redirect?from=%2Fgone-page');

    // --- IndexNow key file ---
    const key = (await loadSeo(true)).settings.indexnow.key;
    const file = await open(`/${key}.txt`); assert.equal(file.statusCode, 200); assert.equal(file.body, key);
    assert.equal((await open('/' + 'a'.repeat(32) + '.txt')).statusCode, 404);
    assert.equal((await call('POST', '/api/admin/seo/indexnow', { urls: [] })).statusCode, 400);

    // --- hiding the whole site ---
    await call('PUT', '/api/admin/seo', { ...next, indexing: { ...next.indexing, minAdsForListing: 1, siteNoindex: true } });
    assert.match((await open('/robots.txt')).body, /User-agent: \*\nDisallow: \/\n/);
    await call('PUT', '/api/admin/seo', { ...next, indexing: { ...next.indexing, minAdsForListing: 1, siteNoindex: false } });
  } finally {
    const attempt = async (work) => { try { await work(); } catch (error) { console.error('cleanup:', error.message); } };
    await attempt(() => sql`delete from seo_redirects`); await attempt(() => sql`delete from seo_pages`); await attempt(() => sql`update seo_settings set data='{}',updated_by=null where id=1`);
    await attempt(() => sql`delete from media where object_key='test/seo-pic'`); await attempt(() => sql`delete from placements where ad_id in (${one},${paused},${solo})`); await attempt(() => sql`delete from ads where id in (${one},${paused},${solo})`);
    await attempt(() => sql`delete from cities where id in (${cityA.id},${cityB.id})`); await attempt(() => sql`delete from audit_events where actor_id=${admin.id}`); await attempt(() => sql`delete from sessions where user_id=${admin.id}`); await attempt(() => sql`delete from users where id=${admin.id}`);
    await app.close();
  }
});
