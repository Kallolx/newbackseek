// Admin storage overview: picture counts and sizes (database), real bucket usage
// (R2 scan, cached), savings from shrinking/processing, and live health checks.
import { HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { sql } from './db.mjs';
import { config } from './config.mjs';
import { s3, storageReady } from './storage.mjs';
import { redis, images } from './queue.mjs';

const SCAN_KEY = 'bpn:storage:scan';
const SCAN_TTL_SECONDS = 600;

async function timed(task) {
  const started = performance.now();
  try { await task(); return { ok: true, ms: Math.round(performance.now() - started) }; }
  catch (error) { return { ok: false, ms: Math.round(performance.now() - started), error: error.name === 'TimeoutError' ? 'Timed out' : (error.Code || error.name || 'Error') }; }
}

async function scanBucket(bucket) {
  let objects = 0, bytes = 0, token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }), { abortSignal: AbortSignal.timeout(20000) });
    for (const item of page.Contents || []) { objects += 1; bytes += Number(item.Size || 0); }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { objects, bytes };
}

/** Real bucket usage. Listing costs R2 operations, so it is cached for 10 minutes. */
async function bucketUsage(force) {
  if (!force) { try { const cached = await redis.get(SCAN_KEY); if (cached) return JSON.parse(cached); } catch {} }
  const [publicBucket, privateBucket] = await Promise.allSettled([scanBucket(config.R2_PUBLIC_BUCKET), scanBucket(config.R2_BUCKET)]);
  const value = {
    public: publicBucket.status === 'fulfilled' ? publicBucket.value : null,
    private: privateBucket.status === 'fulfilled' ? privateBucket.value : null,
    scannedAt: new Date().toISOString(),
  };
  if (value.public && value.private) { try { await redis.set(SCAN_KEY, JSON.stringify(value), 'EX', SCAN_TTL_SECONDS); } catch {} }
  return value;
}

export function storageReport(app, { admin }) {
  app.get('/api/admin/storage', { preHandler: admin }, async (req) => {
    const force = req.query?.scan === '1';
    const [[pictures], [bytes], variants, daily, [verification], [lastProcessed], counts, usage, health] = await Promise.all([
      sql`select
            count(*) filter (where status='ready')::int as ready,
            count(*) filter (where status='ready' and ad_id is not null)::int as in_ads,
            count(*) filter (where status='ready' and ad_id is null)::int as unattached,
            count(*) filter (where status in ('uploading','queued','processing'))::int as in_progress,
            count(*) filter (where status='failed')::int as failed,
            count(distinct ad_id) filter (where status='ready')::int as ads_with_pictures
          from media where purpose='ad'`,
      sql`select
            coalesce(sum(coalesce(original_bytes, expected_bytes)) filter (where status='ready'),0)::bigint as original,
            coalesce(sum(expected_bytes) filter (where status='ready'),0)::bigint as uploaded,
            coalesce(sum((select coalesce(sum((v->>'bytes')::bigint),0) from jsonb_each(variants) e(k,v))) filter (where status='ready'),0)::bigint as stored,
            count(*) filter (where status='ready' and original_bytes is not null)::int as measured
          from media where purpose='ad'`,
      sql`select e.key as size, count(*)::int as files, coalesce(sum((e.value->>'bytes')::bigint),0)::bigint as bytes,
            coalesce(round(avg((e.value->>'bytes')::bigint)),0)::bigint as average, max((e.value->>'width')::int) as width
          from media m, jsonb_each(m.variants) e where m.purpose='ad' and m.status='ready' group by e.key order by bytes desc`,
      sql`select to_char(day,'YYYY-MM-DD') as day, count(m.id)::int as pictures,
            coalesce(sum((select coalesce(sum((v->>'bytes')::bigint),0) from jsonb_each(m.variants) e(k,v))),0)::bigint as bytes
          from generate_series(current_date - 13, current_date, interval '1 day') day
          left join media m on m.purpose='ad' and m.status='ready' and m.created_at >= day and m.created_at < day + interval '1 day'
          group by day order by day`,
      sql`select count(*)::int as total, coalesce(sum(expected_bytes),0)::bigint as bytes from media where purpose='verification' and status='ready'`,
      sql`select max(processed_at) as at, round(avg(extract(epoch from processed_at - created_at)) filter (where processed_at > now() - interval '7 days'))::int as avg_seconds from media where processed_at is not null`,
      images.getJobCounts('waiting', 'active', 'failed', 'delayed').catch(() => null),
      storageReady() ? bucketUsage(force).catch(() => ({ public: null, private: null, scannedAt: null })) : { public: null, private: null, scannedAt: null },
      (async () => {
        if (!storageReady()) return { public: { ok: false, ms: 0, error: 'Not configured' }, private: { ok: false, ms: 0, error: 'Not configured' }, delivery: { ok: false, ms: 0, error: 'Not configured' } };
        const [sample] = await sql`select variants->'thumb'->>'url' as url from media where purpose='ad' and status='ready' and variants ? 'thumb' order by created_at desc limit 1`;
        const [publicBucket, privateBucket, delivery] = await Promise.all([
          timed(() => s3.send(new HeadBucketCommand({ Bucket: config.R2_PUBLIC_BUCKET }), { abortSignal: AbortSignal.timeout(8000) })),
          timed(() => s3.send(new HeadBucketCommand({ Bucket: config.R2_BUCKET }), { abortSignal: AbortSignal.timeout(8000) })),
          sample?.url ? timed(async () => { const response = await fetch(sample.url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); if (!response.ok) throw Object.assign(new Error(), { name: `HTTP ${response.status}` }); }) : Promise.resolve({ ok: true, ms: 0, error: 'No pictures yet' }),
        ]);
        return { public: publicBucket, private: privateBucket, delivery };
      })(),
    ]);
    const original = Number(bytes.original), stored = Number(bytes.stored), uploaded = Number(bytes.uploaded);
    return {
      health: { ...health, worker: counts, lastProcessedAt: lastProcessed?.at || null, averageProcessingSeconds: lastProcessed?.avg_seconds ?? null, mediaHost: config.MEDIA_PUBLIC_URL ? new URL(config.MEDIA_PUBLIC_URL).host : '' },
      pictures,
      bytes: { original, uploaded, stored, saved: Math.max(0, original - stored), savedPercent: original ? Math.round((1 - stored / original) * 100) : 0, measured: bytes.measured },
      variants: variants.map((row) => ({ size: row.size, files: row.files, bytes: Number(row.bytes), average: Number(row.average), width: row.width })),
      daily: daily.map((row) => ({ day: row.day, pictures: row.pictures, bytes: Number(row.bytes) })),
      verification: { total: verification.total, bytes: Number(verification.bytes) },
      buckets: usage,
    };
  });
}
