import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.mjs';
import { sql, audit } from './db.mjs';
import { token, digest, hashPassword, verifyPassword } from './security.mjs';
import { redis, images } from './queue.mjs';
import { s3, storageReady } from './storage.mjs';

const id = z.string().regex(/^\d+$/);
const uuid = z.uuid();
const pagination = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) });
const adInput = z.object({ title: z.string().trim().min(5).max(140), description: z.string().trim().min(20).max(6000),
 categorySlug: z.string().min(1).max(100), age: z.number().int().min(18).max(120).optional(),
 location: z.string().max(200).default(''), phone: z.string().max(40).default(''),
 cityIds: z.array(z.number().int().positive()).min(1).max(1000), mediaIds: z.array(uuid).max(12).default([]) });
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const cookieName = config.NODE_ENV === 'production' ? '__Host-session' : 'session';
const cookieOptions = { path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 604800 };

export async function buildApp() {
 const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'password', 'password_hash'] }, bodyLimit: 65536 });
 await app.register(cookie);
 await app.register(helmet);
 await app.register(rateLimit, { max: 120, timeWindow: '1 minute', redis });
 app.addHook('onRequest', async (req, reply) => {
   reply.header('Cache-Control', 'no-store');
   if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.SITE_ORIGIN)
     throw fail(403, 'Request origin is not allowed');
 });
 app.decorateRequest('user', null);
 async function member(req) {
   const session = req.cookies[cookieName];
   if (!session) throw fail(401, 'Please log in');
   const [user] = await sql`select u.id,u.email,u.username,u.role,s.actor_id from sessions s join users u on u.id=s.user_id
     where s.token_hash=${digest(session)} and s.expires_at>now() and u.status='active'`;
   if (!user) throw fail(401, 'Please log in');
   req.user = user;
 }
 async function admin(req) { await member(req); if (req.user.role !== 'admin' || req.user.actor_id) throw fail(403, 'Administrator access required'); }
 async function session(reply, userId, actorId = null) {
   const secret = token();
   await sql`insert into sessions (token_hash,user_id,actor_id,expires_at) values (${digest(secret)},${userId},${actorId},now()+interval '7 days')`;
   reply.setCookie(cookieName, secret, cookieOptions);
 }
 app.setErrorHandler((error, req, reply) => {
   if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid input', fields: error.flatten() });
   if (error.code === '23505') return reply.code(409).send({ error: 'That record already exists' });
   if (error.code === '23503') return reply.code(400).send({ error: 'Referenced record does not exist' });
   const status = error.statusCode || 500;
   if (status >= 500) req.log.error(error);
   reply.code(status).send({ error: status >= 500 ? 'Service temporarily unavailable' : error.message });
 });
 app.get('/api/health', async () => ({ status: 'ok' }));
 app.get('/api/ready', async () => { await sql`select 1`; await redis.ping(); return { status: 'ready' }; });
 app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
   const input = z.object({ email: z.email().toLowerCase(), username: z.string().regex(/^[a-zA-Z0-9]{3,30}$/), password: z.string().min(12).max(128) }).parse(req.body);
   const [user] = await sql`insert into users (email,username,password_hash) values (${input.email},${input.username},${await hashPassword(input.password)}) returning id,email,username,role`;
   await session(reply, user.id); return reply.code(201).send({ user });
 });
 app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
   const input = z.object({ email: z.email().toLowerCase(), password: z.string().min(1).max(128) }).parse(req.body);
   const [user] = await sql`select * from users where email=${input.email} and status='active'`;
   const valid = await verifyPassword(input.password, user?.password_hash || await hashPassword('dummy-password'));
   if (!user || !valid) throw fail(401, 'Incorrect email or password');
   await session(reply, user.id); return { user: { id: user.id, email: user.email, username: user.username, role: user.role } };
 });
 app.get('/api/auth/me', { preHandler: member }, async req => ({ user: req.user }));
 app.post('/api/auth/logout', async (req, reply) => {
   if (req.cookies[cookieName]) await sql`delete from sessions where token_hash=${digest(req.cookies[cookieName])}`;
   reply.clearCookie(cookieName, { path: '/', secure: cookieOptions.secure }); return { ok: true };
 });
 app.get('/api/locations', async req => {
   const q = z.object({ country: z.string().max(10).default(''), region: z.string().max(100).default('') }).parse(req.query);
   return { cities: await sql`select * from cities where (${q.country}='' or country_code=${q.country}) and (${q.region}='' or region=${q.region}) order by country,region,name` };
 });
 app.get('/api/categories', async () => ({ categories: await sql`select * from categories order by group_name,name` }));
 app.get('/api/ads', async req => {
   const q = pagination.extend({ cityId: z.coerce.number().int().positive(), category: z.string().max(100), search: z.string().max(120).default('') }).parse(req.query);
   const rows = await sql`select a.id,a.title,left(a.description,240) as description,a.age,a.location,p.ranked_at,
     (select variants from media where ad_id=a.id and status='ready' and purpose='ad' order by created_at limit 1) as image
     from placements p join ads a on a.id=p.ad_id where p.city_id=${q.cityId} and a.category_slug=${q.category} and a.status='published'
     and (${q.search}='' or a.search_document @@ websearch_to_tsquery('english',${q.search}))
     order by p.ranked_at desc,p.ad_id desc limit 51 offset ${(q.page - 1) * 50}`;
   return { posts: rows.slice(0,50), page: q.page, hasMore: rows.length > 50 };
 });
 app.get('/api/ads/:id', async req => {
   const [ad] = await sql`select id,title,description,age,location,phone,category_slug,created_at from ads where id=${id.parse(req.params.id)} and status='published'`;
   if (!ad) throw fail(404, 'Post not found');
   return { post: ad, images: await sql`select id,variants,width,height from media where ad_id=${ad.id} and status='ready' and purpose='ad' order by created_at`, cities: await sql`select c.* from placements p join cities c on c.id=p.city_id where p.ad_id=${ad.id}` };
 });
 app.get('/api/account/ads', { preHandler: member }, async req => {
   const { page } = pagination.parse(req.query);
   return { posts: await sql`select * from ads where owner_id=${req.user.id} and status!='deleted' order by created_at desc limit 50 offset ${(page-1)*50}` };
 });
 app.post('/api/account/ads', { preHandler: member }, async (req, reply) => {
   const input = adInput.parse(req.body);
   const ad = await sql.begin(async tx => {
     const [ad] = await tx`insert into ads (owner_id,category_slug,title,description,age,location,phone,status) values
       (${req.user.id},${input.categorySlug},${input.title},${input.description},${input.age ?? null},${input.location},${input.phone},'pending') returning *`;
     await tx`insert into placements ${tx([...new Set(input.cityIds)].map(city_id => ({ad_id:ad.id,city_id})))}`;
     if (input.mediaIds.length) {
       const media = await tx`update media set ad_id=${ad.id} where id in ${tx(input.mediaIds)} and owner_id=${req.user.id} and ad_id is null and purpose='ad' and status='ready' returning id`;
       if (media.length !== input.mediaIds.length) throw fail(400, 'One or more images are unavailable');
     }
     await audit(tx,req.user.id,'ad.create',ad.id); return ad;
   });
   return reply.code(201).send({ post: ad });
 });
 app.patch('/api/account/ads/:id', { preHandler: member }, async req => {
   const value = z.object({ title: z.string().min(5).max(140), description: z.string().min(20).max(6000) }).parse(req.body);
   const [post] = await sql`update ads set title=${value.title},description=${value.description},status='pending',updated_at=now() where id=${id.parse(req.params.id)} and owner_id=${req.user.id} and status!='deleted' returning *`;
   if (!post) throw fail(404,'Post not found'); return { post };
 });
 app.post('/api/media/uploads', { preHandler: member, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async req => {
   if (!storageReady()) throw fail(503,'Image storage is not configured');
   const input = z.object({ bytes: z.number().int().min(1).max(10485760), contentType: z.enum(['image/jpeg','image/png','image/webp']), purpose: z.enum(['ad','verification']).default('ad') }).parse(req.body);
   const key = 'incoming/' + req.user.id + '/' + token();
   const [media] = await sql`insert into media (owner_id,object_key,expected_bytes,content_type,purpose) values (${req.user.id},${key},${input.bytes},${input.contentType},${input.purpose}) returning id`;
   const url = await getSignedUrl(s3,new PutObjectCommand({ Bucket: config.R2_BUCKET,Key:key,ContentType:input.contentType,ContentLength:input.bytes }),{expiresIn:300});
   return { id: media.id,url,expiresIn:300 };
 });
 app.post('/api/media/:id/complete', { preHandler: member }, async req => {
   const [media] = await sql`select * from media where id=${uuid.parse(req.params.id)} and owner_id=${req.user.id}`;
   if (!media) throw fail(404,'Image not found');
   if (media.status !== 'uploading') return { status: media.status };
   const object = await s3.send(new HeadObjectCommand({ Bucket:config.R2_BUCKET,Key:media.object_key }));
   if (object.ContentLength !== media.expected_bytes || object.ContentType !== media.content_type) throw fail(400,'Upload does not match declared file');
   await images.add('process',{id:media.id},{jobId:media.id});
   await sql`update media set status='queued' where id=${media.id} and status='uploading'`;
   return { status:'queued' };
 });
 app.get('/api/media/:id', { preHandler: member }, async req => {
   const [media] = await sql`select id,status,variants from media where id=${uuid.parse(req.params.id)} and owner_id=${req.user.id}`;
   if (!media) throw fail(404,'Image not found'); return media;
 });
 app.post('/api/reports', { preHandler: member }, async req => {
   const input = z.object({ adId:z.number().int().positive(),reason:z.string().trim().min(5).max(2000) }).parse(req.body);
   await sql`insert into reports (ad_id,reporter_id,reason) values (${input.adId},${req.user.id},${input.reason})`; return {ok:true};
 });
 app.post('/api/account/verification', { preHandler: member }, async req => {
   const input = z.object({mediaId:uuid,notes:z.string().max(2000).default('')}).parse(req.body);
   const [media] = await sql`select id from media where id=${input.mediaId} and owner_id=${req.user.id} and purpose='verification' and status='ready'`;
   if (!media) throw fail(400,'Upload a verification photo first');
   await sql`insert into verifications (user_id,media_id,notes) values (${req.user.id},${media.id},${input.notes})`; return {ok:true};
 });
 app.get('/api/admin/:collection', { preHandler: admin }, async req => {
   const collection = z.enum(['users','ads','media','reports','verifications','audit']).parse(req.params.collection);
   const {page}=pagination.parse(req.query); const offset=(page-1)*50;
   if(collection==='users') return {items:await sql`select id,email,username,role,status,created_at from users order by created_at desc limit 50 offset ${offset}`};
   const table={ads:'ads',media:'media',reports:'reports',verifications:'verifications',audit:'audit_events'}[collection];
   return {items:await sql`select * from ${sql(table)} order by created_at desc limit 50 offset ${offset}`};
 });
 app.get('/api/admin/health/system', { preHandler: admin }, async () => {
   const start=performance.now(); await sql`select 1`; const databaseMs=performance.now()-start;
   return {databaseMs, queue:await images.getJobCounts('waiting','active','failed'), uptime:process.uptime(), memory:process.memoryUsage()};
 });
 app.post('/api/admin/ads/:id/:action', { preHandler: admin }, async req => {
   const adId=id.parse(req.params.id); const action=z.enum(['bump','distribute','status']).parse(req.params.action);
   await sql.begin(async tx => {
     if (!(await tx`select id from ads where id=${adId} for update`).length) throw fail(404,'Post not found');
     if(action==='bump') await tx`update placements set ranked_at=now() where ad_id=${adId}`;
     if(action==='distribute') {
       const {cityIds}=z.object({cityIds:z.array(z.number().int().positive()).min(1).max(1000)}).parse(req.body);
       await tx`insert into placements ${tx([...new Set(cityIds)].map(city_id=>({ad_id:adId,city_id})))} on conflict do nothing`;
     }
     if(action==='status') {
       const {status}=z.object({status:z.enum(['published','paused','rejected','deleted'])}).parse(req.body);
       await tx`update ads set status=${status},updated_at=now() where id=${adId}`;
     }
     await audit(tx,req.user.id,'ad.'+action,adId,req.body || {});
   }); return {ok:true};
 });
 app.patch('/api/admin/users/:id', { preHandler: admin }, async req => {
   const userId=uuid.parse(req.params.id); const {status}=z.object({status:z.enum(['active','suspended'])}).parse(req.body);
   if(userId===req.user.id) throw fail(400,'You cannot suspend your own account');
   await sql.begin(async tx=>{await tx`update users set status=${status} where id=${userId}`; await tx`delete from sessions where user_id=${userId}`;await audit(tx,req.user.id,'user.status',userId,{status});}); return {ok:true};
 });
 app.post('/api/admin/users/:id/impersonate', { preHandler: admin }, async (req,reply) => {
   const userId=uuid.parse(req.params.id);
   const [user]=await sql`select id from users where id=${userId} and status='active' and role='member'`;
   if(!user) throw fail(404,'Active member not found');
   await audit(sql,req.user.id,'user.impersonate',userId);
   await session(reply,userId,req.user.id);return {ok:true};
 });
 app.post('/api/account/impersonation/stop', { preHandler: member }, async(req,reply)=>{
   if(!req.user.actor_id) throw fail(400,'No impersonation session');
   const [actor]=await sql`select id from users where id=${req.user.actor_id} and role='admin' and status='active'`;
   if(!actor) throw fail(403,'Administrator unavailable');
   await sql`delete from sessions where token_hash=${digest(req.cookies[cookieName])}`;
   await session(reply,actor.id);return {ok:true};
 });
 app.patch('/api/admin/reports/:id', {preHandler:admin},async req=>{
   const {status}=z.object({status:z.enum(['resolved','dismissed'])}).parse(req.body);
   await sql.begin(async tx=>{await tx`update reports set status=${status} where id=${id.parse(req.params.id)}`;await audit(tx,req.user.id,'report.status',req.params.id,{status});});return {ok:true};
 });
 app.get('/api/admin/verifications/:id/photo',{preHandler:admin},async req=>{
   const [row]=await sql`select m.object_key from media m join verifications v on v.media_id=m.id where v.id=${uuid.parse(req.params.id)}`;
   if(!row) throw fail(404,'Verification not found');
   await audit(sql,req.user.id,'verification.view',req.params.id);
   return {url:await getSignedUrl(s3,new GetObjectCommand({Bucket:config.R2_BUCKET,Key:row.object_key}),{expiresIn:60})};
 });
 app.patch('/api/admin/verifications/:id',{preHandler:admin},async req=>{
   const {status}=z.object({status:z.enum(['approved','rejected'])}).parse(req.body);
   await sql.begin(async tx=>{await tx`update verifications set status=${status} where id=${uuid.parse(req.params.id)}`;await audit(tx,req.user.id,'verification.status',req.params.id,{status});});return {ok:true};
 });
 app.addHook('onClose',async()=>{await images.close();await redis.quit();await sql.end();});
 return app;
}
