import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { config } from './config.mjs';
import { s3 } from './storage.mjs';
import { DeleteObjectsCommand,PutObjectCommand } from '@aws-sdk/client-s3';
import { images } from './queue.mjs';
import { token } from './security.mjs';

const integer = z.coerce.number().int().positive();
const statusValues = ['draft','pending','published','paused','rejected','deleted'];
const adSchema = z.object({ title:z.string().trim().min(5).max(140),description:z.string().trim().min(20).max(6000),categorySlug:z.string().min(1),owner:z.string().min(1),cityHrefs:z.array(z.string().startsWith('/browse/')).min(1).max(1500),age:z.number().int().min(18).max(120).optional(),location:z.string().max(200).default(''),phone:z.string().max(40).default(''),contactEmail:z.union([z.email().max(254),z.literal('')]).default(''),mediaIds:z.array(z.uuid()).max(12).default([]) });

export function adminManagement(app, { admin, fail }) {
 app.post('/api/admin/media/upload',{preHandler:admin,bodyLimit:7500000,config:{rateLimit:{max:200,timeWindow:'1 hour'}}},async(req)=>{
  const input=z.object({contentType:z.enum(['image/jpeg','image/png','image/webp']),data:z.string().min(1).max(7000000)}).parse(req.body);
  const buffer=Buffer.from(input.data,'base64');if(!buffer.length||buffer.length>5242880)throw fail(400,'Choose an image under 5 MB');
  const key='incoming/'+req.user.id+'/'+token();
  await s3.send(new PutObjectCommand({Bucket:config.R2_BUCKET,Key:key,Body:buffer,ContentType:input.contentType}));
  const [media]=await sql`insert into media(owner_id,object_key,expected_bytes,content_type,purpose,status) values(${req.user.id},${key},${buffer.length},${input.contentType},'ad','queued') returning id`;
  await images.add('process',{id:media.id},{jobId:media.id});return {id:media.id};
 });
 const projection = sql`a.*,u.username as owner,u.email,
  coalesce((select json_agg(c.href) from placements p join cities c on c.id=p.city_id where p.ad_id=a.id),'[]') as targets,
  coalesce((select json_agg(json_build_object('id',m.id,'variants',m.variants)) from media m where m.ad_id=a.id and m.status='ready' and m.purpose='ad'),'[]') as images`;
 app.get('/api/admin/summary', {preHandler:admin}, async()=>{
  const [counts]=await sql`select
   (select count(*)::int from users where status!='deleted' and role='member') as users,
   (select count(*)::int from ads where status!='deleted') as ads,
   (select count(*)::int from ads where status='published') as published,
   (select count(*)::int from ads where status='pending') as pending,
   (select count(*)::int from media) as media,
   (select count(*)::int from reports where status='open') as reports,
   (select count(*)::int from verifications where status='pending') as verifications`;
  const daily=await sql`select day::date::text as day,(select count(*)::int from ads where created_at>=day and created_at<day+interval '1 day') as ads,(select count(*)::int from users where created_at>=day and created_at<day+interval '1 day') as users from generate_series(current_date-6,current_date,interval '1 day') day`;
  return {counts,daily};
 });
 app.get('/api/admin/:collection',{preHandler:admin},async(req)=>{
  const collection=z.enum(['users','ads','media','reports','verifications']).parse(req.params.collection);
  const q=z.object({page:z.coerce.number().int().min(1).default(1),search:z.string().max(120).default(''),status:z.string().max(30).default('')}).parse(req.query);
  const offset=(q.page-1)*50, term='%'+q.search+'%';
  let rows, total;
  if(collection==='ads') {
   const filter=sql`a.status!='deleted' and (${q.status}='' or a.status=${q.status}) and (a.id::text ilike ${term} or a.title ilike ${term} or u.username ilike ${term})`;
   rows=await sql`select ${projection} from ads a join users u on u.id=a.owner_id where ${filter} order by a.created_at desc limit 50 offset ${offset}`;
   [total]=await sql`select count(*)::int as count from ads a join users u on u.id=a.owner_id where ${filter}`;
  } else if(collection==='users') {
   const filter=sql`status!='deleted' and (email ilike ${term} or username ilike ${term}) and (${q.status}='' or status=${q.status})`;
   rows=await sql`select id,email,username,role,status,email_verified_at,created_at,(select count(*)::int from ads where owner_id=u.id and status!='deleted') as ad_count from users u where ${filter} order by created_at desc limit 50 offset ${offset}`;
   [total]=await sql`select count(*)::int as count from users where ${filter}`;
  } else if(collection==='media') {
   const filter=sql`m.purpose='ad' and (${q.status}='' or m.status=${q.status}) and (m.id::text ilike ${term} or coalesce(a.title,'') ilike ${term} or coalesce(a.id::text,'') ilike ${term} or u.username ilike ${term})`;
   rows=await sql`select m.id,m.ad_id,m.status,m.created_at,m.expected_bytes,m.original_bytes,m.width,m.height,m.processed_at,a.status as ad_status,
     (select coalesce(sum((v->>'bytes')::bigint),0) from jsonb_each(m.variants) e(k,v))::bigint as stored_bytes,u.username as owner,a.title from media m join users u on u.id=m.owner_id left join ads a on a.id=m.ad_id where ${filter} order by m.created_at desc limit 50 offset ${offset}`;
   [total]=await sql`select count(*)::int as count from media m join users u on u.id=m.owner_id left join ads a on a.id=m.ad_id where ${filter}`;
  } else if(collection==='reports') {
   const filter=sql`(${q.status}='' or r.status=${q.status}) and (r.reason ilike ${term} or r.ad_id::text ilike ${term})`;
   rows=await sql`select r.*,a.title from reports r join ads a on a.id=r.ad_id where ${filter} order by r.created_at desc limit 50 offset ${offset}`;
   [total]=await sql`select count(*)::int as count from reports r where ${filter}`;
  } else {
   const filter=sql`(${q.status}='' or v.status=${q.status}) and (u.username ilike ${term} or u.email ilike ${term})`;
   rows=await sql`select v.*,u.username,u.email from verifications v join users u on u.id=v.user_id where ${filter} order by v.created_at desc limit 50 offset ${offset}`;
   [total]=await sql`select count(*)::int as count from verifications v join users u on u.id=v.user_id where ${filter}`;
  }
  return {items:rows,total:total.count,page:q.page,pageSize:50};
 });
 app.get('/api/admin/ads/:id',{preHandler:admin},async(req)=>{
  const [post]=await sql`select ${projection} from ads a join users u on u.id=a.owner_id where a.id=${integer.parse(req.params.id)} and a.status!='deleted'`;
  if(!post)throw fail(404,'Ad not found'); return {post};
 });
 async function saveAd(req, editing) {
  const input=adSchema.parse(req.body);
  return sql.begin(async tx=>{
   const [owner]=await tx`select id from users where username=${input.owner} and status='active'`;
   if(!owner)throw fail(400,'Choose an existing active owner username');
   const cities=await tx`select id from cities where href in ${tx([...new Set(input.cityHrefs)])}`;
   if(cities.length!==new Set(input.cityHrefs).size)throw fail(400,'Some destination cities are unavailable');
   let post;
   if(editing) {
    [post]=await tx`update ads set owner_id=${owner.id},title=${input.title},description=${input.description},category_slug=${input.categorySlug},age=${input.age??null},location=${input.location},phone=${input.phone},contact_email=${input.contactEmail},updated_at=now() where id=${integer.parse(req.params.id)} and status!='deleted' returning *`;
    if(!post)throw fail(404,'Ad not found');
    await tx`delete from placements where ad_id=${post.id}`;
   } else [post]=await tx`insert into ads(owner_id,title,description,category_slug,age,location,phone,contact_email,status) values(${owner.id},${input.title},${input.description},${input.categorySlug},${input.age??null},${input.location},${input.phone},${input.contactEmail},'published') returning *`;
   await tx`insert into placements ${tx(cities.map(city=>({ad_id:post.id,city_id:city.id})))}`;
   if(input.mediaIds.length) {
    const media=await tx`update media set ad_id=${post.id},ever_attached=true where id in ${tx(input.mediaIds)} and owner_id=${req.user.id} and purpose='ad' and status='ready' and ad_id is null returning id`;
    if(media.length!==input.mediaIds.length)throw fail(400,'Images are still processing or unavailable');
   }
   await audit(tx,req.user.id,editing?'ad.edit':'ad.publish',post.id);
   return {post};
  });
 }
 app.post('/api/admin/ads',{preHandler:admin},req=>saveAd(req,false));
 app.patch('/api/admin/ads/:id',{preHandler:admin},req=>saveAd(req,true));
 app.post('/api/admin/ads/:id/destinations',{preHandler:admin},async(req)=>{
  const adId=integer.parse(req.params.id), {cityHrefs}=z.object({cityHrefs:z.array(z.string()).min(1).max(1500)}).parse(req.body);
  await sql.begin(async tx=>{
   if(!(await tx`select id from ads where id=${adId} and status!='deleted' for update`).length)throw fail(404,'Ad not found');
   const cities=await tx`select id from cities where href in ${tx([...new Set(cityHrefs)])}`;
   if(cities.length!==new Set(cityHrefs).size)throw fail(400,'Some destination cities are unavailable');
   await tx`insert into placements ${tx(cities.map(city=>({ad_id:adId,city_id:city.id})))} on conflict do nothing`;
   await audit(tx,req.user.id,'ad.distribute',adId,{cityCount:cities.length});
  });return {ok:true};
 });
 app.delete('/api/admin/ads/:id',{preHandler:admin},async(req)=>{
  const adId=integer.parse(req.params.id);
  await sql.begin(async tx=>{const result=await tx`update ads set status='deleted',updated_at=now() where id=${adId} and status!='deleted' returning id`;if(!result.length)throw fail(404,'Ad not found');await audit(tx,req.user.id,'ad.delete',adId);});
  return {ok:true};
 });
 app.delete('/api/admin/users/:id',{preHandler:admin},async(req)=>{
  const userId=z.uuid().parse(req.params.id);
  if(userId===req.user.id)throw fail(400,'You cannot delete your own account');
  await sql.begin(async tx=>{
   const [user]=await tx`select id,role from users where id=${userId} and status!='deleted' for update`;
   if(!user)throw fail(404,'User not found');
   if(user.role==='admin')throw fail(400,'Administrator accounts cannot be deleted from this menu');
   await tx`update users set status='deleted' where id=${userId}`;
   await tx`update ads set status='deleted',updated_at=now() where owner_id=${userId}`;
   await tx`delete from sessions where user_id=${userId}`;
   await tx`delete from email_verifications where user_id=${userId}`;
   await tx`delete from password_resets where user_id=${userId}`;
   await tx`update verifications set status='rejected' where user_id=${userId} and status='pending'`;
   await audit(tx,req.user.id,'user.delete',userId);
  });return {ok:true};
 });
 app.delete('/api/admin/media/:id',{preHandler:admin},async(req)=>{
  const mediaId=z.uuid().parse(req.params.id);
  const [media]=await sql`select * from media where id=${mediaId} and purpose='ad'`;
  if(!media)throw fail(404,'Public ad image not found');
  if(['processing','queued'].includes(media.status))throw fail(409,'Wait for this image to finish processing before deleting it');
  const keys=Object.values(media.variants).map(v=>v.url).filter(Boolean).map(url=>decodeURIComponent(new URL(url).pathname.slice(1)));
  if(keys.length)await s3.send(new DeleteObjectsCommand({Bucket:config.R2_PUBLIC_BUCKET,Delete:{Objects:keys.map(Key=>({Key}))}}));
  if(['uploading','failed'].includes(media.status))await s3.send(new DeleteObjectsCommand({Bucket:config.R2_BUCKET,Delete:{Objects:[{Key:media.object_key}]}}));
  await sql.begin(async tx=>{await tx`delete from media where id=${mediaId}`;await audit(tx,req.user.id,'media.delete',mediaId);});return {ok:true};
 });
}
