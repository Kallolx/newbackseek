import { Worker } from 'bullmq';
import Redis from 'ioredis';
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { sql } from './db.mjs';
import { config } from './config.mjs';
import { s3 } from './storage.mjs';

// Several small jobs run in parallel; each job uses one libvips thread so
// concurrent uploads from different members never wait on each other.
const CONCURRENCY = Math.max(1, Number(process.env.IMAGE_WORKER_CONCURRENCY) || 4);
sharp.cache({ memory: 96 });
sharp.concurrency(1);
const SIZES = [['thumb', 160], ['card', 480], ['full', 1280]];
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker('images', async job => {
  const [media] = await sql`select * from media where id=${job.data.id}`;
  if (!media || media.status === 'ready') return;
  await sql`update media set status='processing' where id=${media.id}`;
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: media.object_key }));
    if (!response.ContentLength || response.ContentLength > 10485760) throw new Error('Image exceeds upload limit');
    const input = Buffer.from(await response.Body.transformToByteArray());
    // Decode once, then derive every size from the same pipeline.
    const base = sharp(input, { limitInputPixels: 120000000, animated: false });
    const metadata = await base.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
    if (media.purpose === 'verification') {
      // Verification photos stay under the private incoming prefix and never receive public URLs.
      await sql`update media set status='ready',width=${metadata.width},height=${metadata.height} where id=${media.id}`;
      return;
    }
    const oriented = base.rotate();
    const rendered = await Promise.all(SIZES.map(async ([name, width]) => {
      const { data, info } = await oriented.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 3 }).toBuffer({ resolveWithObject: true });
      return { name, data, info };
    }));
    const variants = {};
    await Promise.all(rendered.map(async ({ name, data, info }) => {
      const key = 'public/' + media.id + '/' + name + '.webp';
      await s3.send(new PutObjectCommand({ Bucket: config.R2_PUBLIC_BUCKET, Key: key, Body: data, ContentType: 'image/webp', CacheControl: 'public,max-age=31536000,immutable' }));
      variants[name] = { url: config.MEDIA_PUBLIC_URL.replace(/\/$/, '') + '/' + key, width: info.width, height: info.height, bytes: data.length };
    }));
    await sql`update media set status='ready',variants=${sql.json(variants)},width=${metadata.width},height=${metadata.height} where id=${media.id}`;
    s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: media.object_key })).catch(error => console.error('Original cleanup failed', media.id, error.message));
  } catch (error) {
    await sql`update media set status='failed' where id=${media.id}`;
    throw error;
  }
}, { connection, concurrency: CONCURRENCY });
worker.on('failed', (job, error) => console.error('Image job failed', job?.id, error.message));

// Pictures upload as soon as members choose them. Remove pictures from forms
// that were abandoned (never attached to any ad) after a day.
async function sweepAbandonedUploads() {
  try {
    const rows = await sql`select id,object_key,variants from media where ad_id is null and not ever_attached and purpose='ad' and created_at < now() - interval '24 hours' and status in ('ready','failed','uploading') order by created_at limit 200`;
    for (const media of rows) {
      const publicKeys = Object.values(media.variants || {}).map(variant => variant?.url).filter(Boolean).map(url => decodeURIComponent(new URL(url).pathname.slice(1)));
      if (publicKeys.length) await s3.send(new DeleteObjectsCommand({ Bucket: config.R2_PUBLIC_BUCKET, Delete: { Objects: publicKeys.map(Key => ({ Key })) } }));
      await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: media.object_key })).catch(() => {});
      await sql`delete from media where id=${media.id} and ad_id is null and not ever_attached`;
    }
    if (rows.length) console.log('Removed abandoned uploads', rows.length);
  } catch (error) { console.error('Abandoned upload sweep failed', error.message); }
}
const sweep = setInterval(sweepAbandonedUploads, 60 * 60 * 1000);
setTimeout(sweepAbandonedUploads, 60 * 1000);

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { clearInterval(sweep); await worker.close(); await connection.quit(); await sql.end(); process.exit(0); });
