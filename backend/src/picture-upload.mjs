// Member picture upload, used only when an ad is submitted.
// The phone sends the original file to our API (no processing on the phone, no
// direct-to-storage upload). The API checks it is a real picture, stores it
// privately and queues the worker, which converts it to WebP in three sizes and
// deletes the original. Nothing is uploaded before the member presses Submit.
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { sql } from './db.mjs';
import { config } from './config.mjs';
import { s3, storageReady } from './storage.mjs';
import { images } from './queue.mjs';
import { token } from './security.mjs';

export const MAX_PICTURE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/octet-stream'];
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heif: 'image/avif' };

/** Returns the real image type, or a friendly reason it cannot be used. */
export async function inspectPicture(buffer) {
  let metadata;
  try { metadata = await sharp(buffer, { limitInputPixels: 120000000, animated: false }).metadata(); }
  catch (error) {
    return { error: /pixel limit/i.test(error.message) ? 'This picture is too large in pixels. Use a smaller photo.' : 'This file is not a picture we can use. Choose a JPG, PNG, WebP or AVIF photo.' };
  }
  // HEIF here means AVIF; iPhone HEIC (HEVC) cannot be converted by the server.
  if (metadata.format === 'heif' && metadata.compression !== 'av1') return { error: 'iPhone HEIC photos are not supported. In iPhone Settings → Camera → Formats choose "Most Compatible", or pick the photo again from the Photos app.' };
  if (!MIME[metadata.format]) return { error: 'This file is not a picture we can use. Choose a JPG, PNG, WebP or AVIF photo.' };
  if (!metadata.width || !metadata.height || metadata.width < 50 || metadata.height < 50) return { error: 'This picture is too small. Use a photo at least 50 pixels wide.' };
  return { contentType: MIME[metadata.format], width: metadata.width, height: metadata.height };
}

export function pictureUpload(app, { member, verifiedMember, fail }) {
  // The picture file is the request body (not JSON).
  app.addContentTypeParser(ACCEPTED_TYPES, { parseAs: 'buffer', bodyLimit: MAX_PICTURE_BYTES }, (req, body, done) => done(null, body));

  app.post('/api/media/upload', {
    preHandler: [member, verifiedMember],
    bodyLimit: MAX_PICTURE_BYTES,
    config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    // Only picture bodies are accepted (Fastify would otherwise also read text/JSON bodies).
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ACCEPTED_TYPES.includes(type)) throw fail(415, 'This file is not a picture we can use. Choose a JPG, PNG, WebP or AVIF photo.');
    if (!storageReady()) throw fail(503, 'Picture storage is not available right now. Please try again shortly.');
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw fail(400, 'No picture was received. Please try again.');
    const picture = await inspectPicture(buffer);
    if (picture.error) throw fail(400, picture.error);
    const key = 'incoming/' + req.user.id + '/' + token();
    await s3.send(new PutObjectCommand({ Bucket: config.R2_BUCKET, Key: key, Body: buffer, ContentType: picture.contentType, ContentLength: buffer.length }));
    const [media] = await sql`insert into media (owner_id,object_key,expected_bytes,original_bytes,content_type,purpose,status,width,height)
      values (${req.user.id},${key},${buffer.length},${buffer.length},${picture.contentType},'ad','queued',${picture.width},${picture.height}) returning id`;
    await images.add('process', { id: media.id }, { jobId: media.id });
    return reply.code(201).send({ id: media.id, status: 'queued' });
  });
}
