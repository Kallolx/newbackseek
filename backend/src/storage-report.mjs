// Admin storage overview: picture counts and sizes (database), real bucket usage
// (R2 scan, cached), savings from shrinking/processing, and live health checks.
import { DeleteObjectsCommand, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { sql, audit } from './db.mjs';
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

const IN_PROGRESS = ['uploading', 'queued', 'processing'];
const storedBytes = sql`(select coalesce(sum((v->>'bytes')::bigint),0) from jsonb_each(m.variants) e(k,v))::bigint`;

export function storageReport(app, { admin, fail }) {
  // Picture list for admins: 20 per page, filters, sorting and counts for the filter chips.
  app.get('/api/admin/pictures', { preHandler: admin }, async (req) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(20),
      search: z.string().trim().max(120).default(''),
      status: z.enum(['', 'ready', 'processing', 'failed']).default(''),
      placement: z.enum(['', 'in_ad', 'not_in_ad']).default(''),
      sort: z.enum(['newest', 'oldest', 'largest', 'smallest']).default('newest'),
    }).parse(req.query);
    const term = '%' + q.search + '%';
    const statusFilter = q.status === 'processing' ? sql`m.status in ${sql(IN_PROGRESS)}` : q.status ? sql`m.status=${q.status}` : sql`true`;
    const placementFilter = q.placement === 'in_ad' ? sql`m.ad_id is not null` : q.placement === 'not_in_ad' ? sql`m.ad_id is null` : sql`true`;
    const searchFilter = q.search ? sql`(m.id::text ilike ${term} or coalesce(a.title,'') ilike ${term} or coalesce(a.id::text,'') ilike ${term} or u.username ilike ${term})` : sql`true`;
    const order = q.sort === 'oldest' ? sql`m.created_at asc` : q.sort === 'largest' ? sql`${storedBytes} desc, m.created_at desc` : q.sort === 'smallest' ? sql`${storedBytes} asc, m.created_at desc` : sql`m.created_at desc`;
    const from = sql`from media m join users u on u.id=m.owner_id left join ads a on a.id=m.ad_id where m.purpose='ad'`;
    const [items, [total], [counts]] = await Promise.all([
      sql`select m.id,m.ad_id,m.status,m.created_at,m.expected_bytes,m.original_bytes,m.width,m.height,m.ever_attached,
            ${storedBytes} as stored_bytes,u.username as owner,a.title,a.status as ad_status
          ${from} and ${statusFilter} and ${placementFilter} and ${searchFilter}
          order by ${order}, m.id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
      sql`select count(*)::int as count ${from} and ${statusFilter} and ${placementFilter} and ${searchFilter}`,
      sql`select count(*) filter (where ${placementFilter})::int as all,
            count(*) filter (where ${placementFilter} and m.status='ready')::int as ready,
            count(*) filter (where ${placementFilter} and m.status in ${sql(IN_PROGRESS)})::int as processing,
            count(*) filter (where ${placementFilter} and m.status='failed')::int as failed,
            count(*) filter (where m.ad_id is not null)::int as in_ad,
            count(*) filter (where m.ad_id is null)::int as not_in_ad
          ${from} and ${searchFilter}`,
    ]);
    return { items: items.map((row) => ({ ...row, stored_bytes: Number(row.stored_bytes), expected_bytes: Number(row.expected_bytes), original_bytes: row.original_bytes == null ? null : Number(row.original_bytes) })), total: total.count, page: q.page, pageSize: q.pageSize, counts };
  });

  const ids = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

  // Delete several pictures: every stored size is removed from storage.
  app.post('/api/admin/pictures/delete', { preHandler: admin }, async (req) => {
    const { ids: wanted } = ids.parse(req.body);
    const rows = await sql`select * from media where id in ${sql([...new Set(wanted)])} and purpose='ad'`;
    const deletable = rows.filter((row) => !['queued', 'processing'].includes(row.status));
    const publicKeys = deletable.flatMap((row) => Object.values(row.variants || {}).map((variant) => variant?.url).filter(Boolean).map((url) => decodeURIComponent(new URL(url).pathname.slice(1))));
    const privateKeys = deletable.filter((row) => ['uploading', 'failed'].includes(row.status)).map((row) => row.object_key);
    for (let i = 0; i < publicKeys.length; i += 1000) await s3.send(new DeleteObjectsCommand({ Bucket: config.R2_PUBLIC_BUCKET, Delete: { Objects: publicKeys.slice(i, i + 1000).map((Key) => ({ Key })) } }));
    if (privateKeys.length) await s3.send(new DeleteObjectsCommand({ Bucket: config.R2_BUCKET, Delete: { Objects: privateKeys.map((Key) => ({ Key })) } }));
    if (deletable.length) await sql.begin(async (tx) => {
      await tx`delete from media where id in ${tx(deletable.map((row) => row.id))}`;
      for (const row of deletable) await audit(tx, req.user.id, 'media.delete', row.id, { ad: row.ad_id, bulk: deletable.length > 1 });
    });
    return { deleted: deletable.length, skipped: rows.length - deletable.length, missing: wanted.length - rows.length };
  });

  // Process failed pictures again (their upload is still in private storage).
  app.post('/api/admin/pictures/retry', { preHandler: admin }, async (req) => {
    const { ids: wanted } = ids.parse(req.body);
    const rows = await sql`update media set status='queued' where id in ${sql([...new Set(wanted)])} and purpose='ad' and status='failed' returning id`;
    for (const row of rows) await images.add('process', { id: row.id }, { jobId: `${row.id}:retry:${Date.now()}` });
    if (rows.length) await sql.begin(async (tx) => { for (const row of rows) await audit(tx, req.user.id, 'media.retry', row.id); });
    return { queued: rows.length, skipped: wanted.length - rows.length };
  });

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
