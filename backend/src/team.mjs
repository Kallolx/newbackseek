// Team managers: staff accounts that sign in on the manager portal with only the sections an administrator grants.
// Every admin API route a manager may use is listed here; anything not listed is administrator-only (fail closed).
import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { hashPassword } from './security.mjs';

export const PERMISSIONS = [
  ['overview', 'Overview'], ['ads', 'All Ads'], ['publish', 'Ad Publish'], ['bump', 'Bump post'], ['distribute', 'Distribute post'],
  ['planner', 'Post planner'], ['seo', 'SEO'], ['users', 'Users'], ['media', 'Media'], ['reports', 'Reports'], ['verification', 'Verification'], ['health', 'System health'],
  ['security', 'Security'], ['vpn', 'VPN'],
];
const KEYS = PERMISSIONS.map(([key]) => key);
// Members and SEO (it can hide the whole site from Google) are off until an administrator turns them on.
export const DEFAULT_PERMISSIONS = KEYS.filter((key) => !['users', 'seo'].includes(key));

const ANY = ['*'];
const routes = {
  'GET /api/admin/summary': ANY,
  'GET /api/admin/health/system': ['overview', 'health'],
  'GET /api/admin/ads/:id': ['ads', 'publish', 'bump', 'distribute'],
  'POST /api/admin/ads': ['publish'],
  'PATCH /api/admin/ads/:id': ['ads', 'publish'],
  'POST /api/admin/ads/:id/destinations': ['distribute'],
  'DELETE /api/admin/ads/:id': ['ads'],
  'POST /api/admin/media/upload': ['publish', 'distribute', 'planner'],
  'GET /api/admin/import-rules': ['publish'],
  'PUT /api/admin/import-rules/:domain': ['publish'],
  'GET /api/admin/seo': ['seo'],
  'PUT /api/admin/seo': ['seo'],
  'PUT /api/admin/seo/page': ['seo'],
  'DELETE /api/admin/seo/page': ['seo'],
  'PUT /api/admin/seo/redirect': ['seo'],
  'DELETE /api/admin/seo/redirect': ['seo'],
  'POST /api/admin/seo/inspect': ['seo'],
  'POST /api/admin/seo/indexnow': ['seo'],
  'GET /api/admin/seo/health': ['seo'],
  'GET /api/admin/planner': ['planner'],
  'POST /api/admin/planner': ['planner'],
  'PATCH /api/admin/planner/:id': ['planner'],
  'POST /api/admin/planner/:id/schedule': ['planner'],
  'POST /api/admin/planner/:id/publish': ['planner'],
  'POST /api/admin/planner/publish-all': ['planner'],
  'POST /api/admin/planner/:id/duplicate': ['planner'],
  'DELETE /api/admin/planner/:id': ['planner'],
  'DELETE /api/admin/media/:id': ['media'],
  'GET /api/admin/pictures': ['media'],
  'POST /api/admin/pictures/delete': ['media'],
  'POST /api/admin/pictures/retry': ['media'],
  'GET /api/admin/storage': ['media'],
  'PATCH /api/admin/users/:id/verified': ['users'],
  'PATCH /api/admin/users/:id': ['users'],
  'DELETE /api/admin/users/:id': ['users'],
  'PATCH /api/admin/reports/:id': ['reports'],
  'GET /api/admin/verifications/:id/photo': ['verification'],
  'PATCH /api/admin/verifications/:id': ['verification'],
  'GET /api/admin/security': ['security'],
  'PUT /api/admin/security': ['security'],
  'POST /api/admin/security/sync': ['security'],
  'GET /api/admin/vpn': ['vpn'],
  'POST /api/admin/vpn/devices': ['vpn'],
  'DELETE /api/admin/vpn/devices/:id': ['vpn'],
};
const collections = { ads: ['ads'], users: ['users'], media: ['media'], reports: ['reports'], verifications: ['verification'] };
const adActions = { bump: ['bump'], distribute: ['distribute'], status: ['ads', 'reports'] };

/** Permissions that open this request (any one is enough), or null when only an administrator may use it. */
export function requiredPermissions(method, url, params = {}) {
  const key = `${method} ${url}`;
  if (key === 'GET /api/admin/:collection') return collections[params.collection] || null;
  if (key === 'POST /api/admin/ads/:id/:action') return adActions[params.action] || null;
  return routes[key] || null;
}

export function managerMay(permissions, method, url, params) {
  const need = requiredPermissions(method, url, params);
  if (!need) return false;
  return need === ANY || need.some((key) => (permissions || []).includes(key));
}

const permissionList = z.array(z.enum(KEYS)).max(KEYS.length).transform((list) => [...new Set(list)]);
const password = z.string().min(10, 'Use at least 10 characters for the password').max(128);
const name = z.string().trim().min(2).max(80);
const createInput = z.object({
  name, email: z.email().max(254).toLowerCase(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, 'Username: 3–30 letters, numbers or _'),
  password, permissions: permissionList,
});

export function teamRoutes(app, { admin, fail }) {
  // Team management is for administrators on the admin host only.
  const owner = async (req) => {
    await admin(req);
    if (req.user.role !== 'admin') throw fail(403, 'Administrator access required');
  };
  const managerId = (req) => z.uuid().parse(req.params.id);
  async function findManager(tx, id) {
    const [row] = await tx`select id from users where id=${id} and role='manager' and status!='deleted' for update`;
    if (!row) throw fail(404, 'Manager not found');
  }

  app.get('/api/admin/team', { preHandler: owner }, async () => {
    const managers = await sql`select u.id,u.display_name as name,u.username,u.email,u.status,u.permissions,u.created_at,u.last_login_at,
      c.username as created_by, s.last_action_at, coalesce(s.published,0) as published, coalesce(s.edited,0) as edited,
      coalesce(s.bumped,0) as bumped, coalesce(s.distributed,0) as distributed, coalesce(s.moderated,0) as moderated,
      coalesce(s.reviewed,0) as reviewed, coalesce(s.week,0) as week, coalesce(s.total,0) as total,
      (select count(*)::int from ads a where a.owner_id=u.id and a.status!='deleted') as live_ads
      from users u left join users c on c.id=u.created_by
      left join lateral (select max(e.created_at) as last_action_at,
        count(*) filter (where e.action='ad.publish')::int as published,
        count(*) filter (where e.action='ad.edit')::int as edited,
        count(*) filter (where e.action='ad.bump')::int as bumped,
        count(*) filter (where e.action='ad.distribute')::int as distributed,
        count(*) filter (where e.action in ('ad.status','ad.delete'))::int as moderated,
        count(*) filter (where e.action in ('report.status','verification.status'))::int as reviewed,
        count(*) filter (where e.created_at>now()-interval '7 days')::int as week,
        count(*)::int as total
        from audit_events e where e.actor_id=u.id) s on true
      where u.role='manager' and u.status!='deleted' order by u.created_at desc`;
    return { managers, permissions: PERMISSIONS.map(([key, label]) => ({ key, label, default: DEFAULT_PERMISSIONS.includes(key) })) };
  });

  app.get('/api/admin/team/:id/activity', { preHandler: owner }, async (req) => {
    const id = managerId(req);
    const [manager] = await sql`select id from users where id=${id} and role='manager'`;
    if (!manager) throw fail(404, 'Manager not found');
    const events = await sql`select action,target_id,details,created_at from audit_events where actor_id=${id} order by created_at desc limit 60`;
    const posts = await sql`select a.id,a.title,a.status,a.created_at,
      (select count(*)::int from placements p where p.ad_id=a.id) as cities
      from ads a where a.status!='deleted' and (a.owner_id=${id} or a.id::text in (select target_id from audit_events where actor_id=${id} and action='ad.publish'))
      order by a.created_at desc limit 60`;
    return { events, posts };
  });

  app.post('/api/admin/team', { preHandler: owner }, async (req) => {
    const input = createInput.parse(req.body);
    const hash = await hashPassword(input.password);
    try {
      const manager = await sql.begin(async (tx) => {
        const [row] = await tx`insert into users (email,username,password_hash,role,display_name,permissions,created_by,email_verified_at)
          values (${input.email},${input.username},${hash},'manager',${input.name},${input.permissions},${req.user.id},now()) returning id`;
        await audit(tx, req.user.id, 'team.create', row.id, { permissions: input.permissions });
        return row;
      });
      return { id: manager.id };
    } catch (error) {
      if (error?.code === '23505') throw fail(409, 'That email or username is already in use.');
      throw error;
    }
  });

  app.patch('/api/admin/team/:id', { preHandler: owner }, async (req) => {
    const id = managerId(req);
    const input = z.object({ name: name.optional(), permissions: permissionList.optional(), status: z.enum(['active', 'suspended']).optional() }).parse(req.body);
    await sql.begin(async (tx) => {
      await findManager(tx, id);
      if (input.name !== undefined) await tx`update users set display_name=${input.name} where id=${id}`;
      if (input.permissions !== undefined) await tx`update users set permissions=${input.permissions} where id=${id}`;
      if (input.status !== undefined) {
        await tx`update users set status=${input.status} where id=${id}`;
        if (input.status === 'suspended') await tx`delete from sessions where user_id=${id}`;
      }
      await audit(tx, req.user.id, 'team.update', id, input);
    });
    return { ok: true };
  });

  app.post('/api/admin/team/:id/password', { preHandler: owner }, async (req) => {
    const id = managerId(req);
    const input = z.object({ password }).parse(req.body);
    const hash = await hashPassword(input.password);
    await sql.begin(async (tx) => {
      await findManager(tx, id);
      await tx`update users set password_hash=${hash} where id=${id}`;
      await tx`delete from sessions where user_id=${id}`;
      await audit(tx, req.user.id, 'team.password', id);
    });
    return { ok: true };
  });

  app.delete('/api/admin/team/:id', { preHandler: owner }, async (req) => {
    const id = managerId(req);
    await sql.begin(async (tx) => {
      await findManager(tx, id);
      // Their ads stay live; only the login is removed.
      await tx`update users set status='deleted' where id=${id}`;
      await tx`delete from sessions where user_id=${id}`;
      await audit(tx, req.user.id, 'team.delete', id);
    });
    return { ok: true };
  });
}
