import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

// Loading the app opens Redis/database connections; close them so the file can exit.
test.after(async () => {
  const { redis, images } = await import('../src/queue.mjs');
  await images.close().catch(() => {}); if (redis.status !== 'end') redis.disconnect();
  const { sql } = await import('../src/db.mjs'); await sql.end({ timeout: 1 }).catch(() => {});
});

test('picture checks: real pictures pass, everything else gets a clear reason', async () => {
  Object.assign(process.env, { DATABASE_URL: process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/x', REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:1' });
  const { inspectPicture } = await import('../src/picture-upload.mjs');
  const make = (format) => sharp({ create: { width: 640, height: 480, channels: 3, background: '#3366aa' } })[format]().toBuffer();
  for (const [format, mime] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['avif', 'image/avif']]) {
    const result = await inspectPicture(await make(format));
    assert.equal(result.contentType, mime, format); assert.equal(result.width, 640);
  }
  assert.match((await inspectPicture(Buffer.from('not a picture at all'))).error, /not a picture we can use/);
  assert.match((await inspectPicture(await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer())).error, /too small/);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200"/></svg>');
  assert.match((await inspectPicture(svg)).error, /not a picture we can use/, 'SVG is refused (can carry scripts)');
});

test('upload endpoint guards', { skip: process.env.INTEGRATION_TEST !== '1' }, async () => {
  const { sql } = await import('../src/db.mjs'); const { token, digest } = await import('../src/security.mjs'); const { buildApp } = await import('../src/app.mjs');
  const app = await buildApp();
  const [user] = await sql`insert into users(email,username,password_hash,email_verified_at) values('upload-member@example.com','uploadmember','x',now()) returning id`;
  const secret = token(); await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(secret)},${user.id},now()+interval '1 hour')`;
  const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#3366aa' } }).jpeg().toBuffer();
  const post = (headers, payload = jpeg) => app.inject({ method: 'POST', url: '/api/media/upload', payload, headers: { origin: process.env.SITE_ORIGIN, 'x-backpagenew-app': 'public', ...headers } });
  try {
    assert.equal((await post({ 'content-type': 'image/jpeg' })).statusCode, 401, 'login required');
    const cookie = `bpn-session=${secret}`;
    const wrongType = await post({ 'content-type': 'text/plain', cookie }, 'hello');
    assert.equal(wrongType.statusCode, 415); assert.match(wrongType.json().error, /not a picture/);
    const big = await post({ 'content-type': 'image/jpeg', cookie }, Buffer.alloc(16 * 1024 * 1024));
    assert.equal(big.statusCode, 413); assert.match(big.json().error, /under 15 MB/);
    assert.equal((await post({ 'content-type': 'image/jpeg', cookie })).statusCode, 503, 'no storage in the test stack');
    assert.equal((await post({ 'content-type': 'image/jpeg', cookie, origin: 'https://evil.example.com' })).statusCode, 403, 'other sites cannot upload');
    // Failure reports from the browser: members only, tolerant of bad input, never an error for the phone.
    const report = (headers, payload) => app.inject({ method: 'POST', url: '/api/media/upload-problem', payload, headers: { origin: process.env.SITE_ORIGIN, 'x-backpagenew-app': 'public', 'content-type': 'application/json', ...headers } });
    const good = { phase: 'upload', size: 4200000, type: 'image/jpeg', status: 0, attempts: 3, online: true, network: '4g', agent: 'test' };
    assert.equal((await report({}, good)).statusCode, 401);
    assert.equal((await report({ cookie }, good)).statusCode, 204);
    assert.equal((await report({ cookie }, { phase: 'nonsense' })).statusCode, 204, 'bad reports are ignored, not errors');
  } finally {
    await sql`delete from sessions where user_id=${user.id}`; await sql`delete from users where id=${user.id}`;
    await app.close();
  }
});
