// Post planner: the team prepares several ads as cards, then publishes them now, on a schedule or all at once.
// The API only changes card states; the worker (publishDueDrafts) creates the ads one by one in the background.
import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { adSchema, insertAd } from './ad-writer.mjs';

export const PLANNER_LIMIT = 20;
const OPEN = ['draft', 'scheduled', 'queued', 'publishing', 'failed'];
const EDITABLE = ['draft', 'scheduled', 'failed'];
const draftInput = adSchema;
const when = z.union([z.iso.datetime({ offset: true }), z.null()]);

function view(row, pictures) {
  return {
    id: row.id, status: row.status, publishAt: row.publish_at, error: row.error, adId: row.ad_id, createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
    post: row.payload, pictures: (pictures.get(row.id) || []),
  };
}
async function picturesFor(rows) {
  const ids = [...new Set(rows.flatMap((row) => row.media_ids))];
  const media = ids.length ? await sql`select id,status,variants from media where id in ${sql(ids)}` : [];
  const byId = new Map(media.map((item) => [item.id, item]));
  return new Map(rows.map((row) => [row.id, row.media_ids.map((id) => byId.get(id)).filter(Boolean).map((item) => ({ id: item.id, status: item.status, url: item.variants?.card?.url || item.variants?.full?.url || '', full: item.variants?.full?.url || '' }))]));
}

export function plannerRoutes(app, { admin, fail }) {
  const own = async (tx, req, statuses = OPEN) => {
    const id = z.uuid().parse(req.params.id);
    const [row] = await tx`select * from ad_drafts where id=${id} and created_by=${req.user.id} and status in ${tx(statuses)} for update`;
    if (!row) throw fail(404, 'This post is no longer here. It may have been published or removed.');
    return row;
  };
  // Pictures must belong to this person and must not already be on an ad or another card.
  async function checkPictures(tx, req, mediaIds, draftId = null) {
    if (!mediaIds.length) return;
    const usable = await tx`select id from media where id in ${tx(mediaIds)} and owner_id=${req.user.id} and purpose='ad' and ad_id is null and status in ('queued','processing','ready')
      and not exists (select 1 from ad_drafts d where d.id is distinct from ${draftId} and d.status in ${tx(OPEN)} and media.id = any(d.media_ids))`;
    if (usable.length !== new Set(mediaIds).size) throw fail(400, 'Some pictures are unavailable. Remove them and add them again.');
  }
  const schedule = (value) => {
    if (value === null) return null;
    const time = new Date(value);
    if (time.getTime() < Date.now() + 60000) throw fail(400, 'Choose a time at least a minute from now.');
    if (time.getTime() > Date.now() + 366 * 86400000) throw fail(400, 'Choose a time within the next year.');
    return time;
  };

  app.get('/api/admin/planner', { preHandler: admin }, async (req) => {
    const rows = await sql`select * from ad_drafts where created_by=${req.user.id} and status in ${sql(OPEN)} order by coalesce(publish_at, created_at), created_at`;
    const recent = await sql`select d.id,d.ad_id,d.published_at,d.payload->>'title' as title,d.payload->>'categorySlug' as category,d.payload->'cityHrefs'->>0 as city from ad_drafts d
      where d.created_by=${req.user.id} and d.status='published' and d.published_at > now() - interval '3 days' order by d.published_at desc limit 30`;
    const pictures = await picturesFor(rows);
    return { posts: rows.map((row) => view(row, pictures)), recent, limit: PLANNER_LIMIT, now: new Date().toISOString() };
  });

  app.post('/api/admin/planner', { preHandler: admin }, async (req) => {
    const body = z.object({ post: draftInput, publishAt: when.default(null) }).parse(req.body);
    const publishAt = schedule(body.publishAt);
    const { mediaIds, ...post } = body.post;
    return sql.begin(async (tx) => {
      await tx`select id from users where id=${req.user.id} for update`; // one count check at a time per person
      const [{ count }] = await tx`select count(*)::int from ad_drafts where created_by=${req.user.id} and status in ${tx(OPEN)}`;
      if (count >= PLANNER_LIMIT) throw fail(409, `You can have up to ${PLANNER_LIMIT} posts in the planner. Publish or delete some first.`);
      await checkPictures(tx, req, mediaIds);
      const [row] = await tx`insert into ad_drafts (created_by,status,payload,media_ids,publish_at) values (${req.user.id},${publishAt ? 'scheduled' : 'draft'},${tx.json(post)},${mediaIds},${publishAt}) returning id`;
      return { id: row.id };
    });
  });

  app.patch('/api/admin/planner/:id', { preHandler: admin }, async (req) => {
    const body = z.object({ post: draftInput }).parse(req.body);
    const { mediaIds, ...post } = body.post;
    await sql.begin(async (tx) => {
      const row = await own(tx, req, EDITABLE);
      await checkPictures(tx, req, mediaIds, row.id);
      // Pictures taken off the card go back to being unused uploads (cleaned up after a day).
      await tx`update ad_drafts set payload=${tx.json(post)},media_ids=${mediaIds},status=${row.status === 'failed' ? 'draft' : row.status},error=null,updated_at=now() where id=${row.id}`;
    });
    return { ok: true };
  });

  app.post('/api/admin/planner/:id/schedule', { preHandler: admin }, async (req) => {
    const publishAt = schedule(z.object({ publishAt: when }).parse(req.body).publishAt);
    await sql.begin(async (tx) => {
      const row = await own(tx, req, EDITABLE);
      await tx`update ad_drafts set status=${publishAt ? 'scheduled' : 'draft'},publish_at=${publishAt},error=null,updated_at=now() where id=${row.id}`;
    });
    return { ok: true };
  });

  app.post('/api/admin/planner/:id/publish', { preHandler: admin }, async (req) => {
    await sql.begin(async (tx) => {
      const row = await own(tx, req, EDITABLE);
      await tx`update ad_drafts set status='queued',publish_at=null,error=null,attempts=0,updated_at=now() where id=${row.id}`;
    });
    return { ok: true };
  });

  // "Publish all": every card that is not scheduled goes into the queue (scheduled cards keep their time).
  app.post('/api/admin/planner/publish-all', { preHandler: admin }, async (req) => {
    const queued = await sql`update ad_drafts set status='queued',publish_at=null,error=null,attempts=0,updated_at=now() where created_by=${req.user.id} and status in ('draft','failed') returning id`;
    return { queued: queued.length };
  });

  app.post('/api/admin/planner/:id/duplicate', { preHandler: admin }, async (req) => {
    return sql.begin(async (tx) => {
      const row = await own(tx, req);
      const [{ count }] = await tx`select count(*)::int from ad_drafts where created_by=${req.user.id} and status in ${tx(OPEN)}`;
      if (count >= PLANNER_LIMIT) throw fail(409, `You can have up to ${PLANNER_LIMIT} posts in the planner.`);
      // Pictures belong to one ad only, so the copy starts without them.
      const [copy] = await tx`insert into ad_drafts (created_by,payload) values (${req.user.id},${tx.json(row.payload)}) returning id`;
      return { id: copy.id };
    });
  });

  app.delete('/api/admin/planner/:id', { preHandler: admin }, async (req) => {
    await sql.begin(async (tx) => {
      const row = await own(tx, req, EDITABLE.concat('queued'));
      await tx`delete from ad_drafts where id=${row.id}`;
    });
    return { ok: true };
  });
}

/**
 * Worker side: publishes cards that are due, a few at a time, oldest first.
 * Safe to run on several workers at once (rows are claimed with SKIP LOCKED).
 */
export async function publishDueDrafts({ batch = 5, onPublished = async () => {} } = {}) {
  // A card stuck in "publishing" (worker restarted mid-way) is put back in the queue.
  await sql`update ad_drafts set status='queued',updated_at=now() where status='publishing' and updated_at < now() - interval '10 minutes'`;
  const claimed = await sql`update ad_drafts set status='publishing',attempts=attempts+1,updated_at=now() where id in (
      select id from ad_drafts where (status='queued' and (publish_at is null or publish_at<=now())) or (status='scheduled' and publish_at<=now())
      order by coalesce(publish_at, updated_at) limit ${batch} for update skip locked) returning *`;
  let published = 0;
  for (const row of claimed) {
    try {
      const media = row.media_ids.length ? await sql`select id,status from media where id in ${sql(row.media_ids)}` : [];
      if (media.length !== row.media_ids.length || media.some((item) => item.status === 'failed')) throw Object.assign(new Error('A picture could not be processed. Edit the post and replace it.'), { final: true });
      if (media.some((item) => item.status !== 'ready')) {
        // Pictures are still being prepared: try again shortly (gives up after about 10 minutes).
        if (row.attempts >= 60) throw Object.assign(new Error('Pictures took too long to prepare. Try again.'), { final: true });
        await sql`update ad_drafts set status='queued',publish_at=now()+interval '10 seconds',error=null,updated_at=now() where id=${row.id}`;
        continue;
      }
      const input = adSchema.parse({ ...row.payload, mediaIds: row.media_ids });
      await sql.begin(async (tx) => {
        const ad = await insertAd(tx, row.created_by, input, { planner: row.id });
        await tx`update ad_drafts set status='published',ad_id=${ad.id},published_at=now(),error=null,updated_at=now() where id=${row.id}`;
      });
      published += 1;
    } catch (error) {
      const message = error?.issues ? 'Some details are not valid. Edit the post and save it again.' : String(error?.message || 'Publishing failed.').slice(0, 300);
      await sql`update ad_drafts set status='failed',error=${message},updated_at=now() where id=${row.id}`;
      await audit(sql, row.created_by, 'planner.failed', row.id, { message }).catch(() => {});
    }
  }
  if (published) await onPublished(published);
  return { claimed: claimed.length, published };
}
