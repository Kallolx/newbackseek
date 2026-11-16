import { Worker } from 'bullmq';
import Redis from 'ioredis';
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { sql } from './db.mjs';
import { config } from './config.mjs';
import { s3 } from './storage.mjs';
sharp.cache({memory:64});
sharp.concurrency(1);
const connection = new Redis(config.REDIS_URL,{maxRetriesPerRequest:null});
const worker = new Worker('images',async job=>{
 const [media]=await sql`select * from media where id=${job.data.id}`;
 if(!media || media.status==='ready') return;
 await sql`update media set status='processing' where id=${media.id}`;
 try {
   const response=await s3.send(new GetObjectCommand({Bucket:config.R2_BUCKET,Key:media.object_key}));
   if(!response.ContentLength || response.ContentLength>10485760) throw new Error('Image exceeds upload limit');
   const input=Buffer.from(await response.Body.transformToByteArray());
   const metadata=await sharp(input,{limitInputPixels:25000000,animated:false}).metadata();
   if(!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages || 1)>1) throw new Error('Unsupported image');
   if(media.purpose==='verification') {
     // Verification photos stay under the private incoming prefix and never receive public URLs.
     await sql`update media set status='ready',width=${metadata.width},height=${metadata.height} where id=${media.id}`;
     return;
   }
   const variants={};
   for(const [name,width] of [['thumb',160],['card',480],['full',1280]]) {
     const {data,info}=await sharp(input,{limitInputPixels:25000000}).rotate().resize({width,withoutEnlargement:true}).webp({quality:78}).toBuffer({resolveWithObject:true});
     const key='public/'+media.id+'/'+name+'.webp';
     await s3.send(new PutObjectCommand({Bucket:config.R2_PUBLIC_BUCKET,Key:key,Body:data,ContentType:'image/webp',CacheControl:'public,max-age=31536000,immutable'}));
     variants[name]={url:config.MEDIA_PUBLIC_URL.replace(/\/$/,'')+'/'+key,width:info.width,height:info.height,bytes:data.length};
   }
   await sql`update media set status='ready',variants=${sql.json(variants)},width=${metadata.width},height=${metadata.height} where id=${media.id}`;
   await s3.send(new DeleteObjectCommand({Bucket:config.R2_BUCKET,Key:media.object_key}));
 } catch(error) {
   await sql`update media set status='failed' where id=${media.id}`;
   throw error;
 }
},{connection,concurrency:1});
worker.on('failed',(job,error)=>console.error('Image job failed',job?.id,error.message));
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await worker.close();await connection.quit();await sql.end();process.exit(0);});
