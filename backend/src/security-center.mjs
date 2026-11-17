// Country blocking and origin protection, controlled from the admin panel.
//
// Two layers enforce the same policy:
//  1. Cloudflare edge (WAF custom rule, synced through the API when a token is
//     configured). Blocked visitors never reach the server and cached pages are
//     covered too.
//  2. The origin gate (Caddy forward_auth -> GET /api/internal/geo-gate). Works
//     without a token and also refuses traffic that did not come through Cloudflare.
import { decide, edgeExpression, buildAllowList, isAllowlisted, validCidr } from './geo-policy.mjs';
import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { config } from './config.mjs';
import { redis } from './queue.mjs';

const CF_API = 'https://api.cloudflare.com/client/v4';
const RULE_REF = 'bpn_geo_block';
const RULE_DESCRIPTION = 'BackpageNew country blocking (managed from the admin panel; edits here are overwritten)';
const host = (url) => { try { return url ? new URL(url).hostname : ''; } catch { return ''; } };
const siteHost = host(config.SITE_ORIGIN);
const adminHost = host(config.ADMIN_ORIGIN);
const mediaHost = host(config.MEDIA_PUBLIC_URL);
export const edgeConfigured = () => Boolean(config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID);

const country = z.string().regex(/^[A-Z]{2}$/);
const cidr = z.string().trim().max(50).refine(validCidr, 'Use an IP address such as 203.0.113.7 or a range such as 203.0.113.0/24');
export const settingsInput = z.object({
  geoEnabled: z.boolean(),
  blockedCountries: z.array(country).max(60),
  blockTor: z.boolean(),
  blockUnknown: z.boolean(),
  protectAdmin: z.boolean(),
  cloudflareOnly: z.boolean(),
  allowlist: z.array(cidr).max(50),
});

const shape = (row) => ({
  geoEnabled: row.geo_enabled, blockedCountries: row.blocked_countries, blockTor: row.block_tor,
  blockUnknown: row.block_unknown, protectAdmin: row.protect_admin, cloudflareOnly: row.cloudflare_only,
  allowlist: row.allowlist, edge: { configured: edgeConfigured(), status: edgeConfigured() ? row.edge_status : 'not_configured', message: row.edge_message, syncedAt: row.edge_synced_at },
  updatedAt: row.updated_at,
});

// Settings are read on every page request, so keep a short in-memory copy.
let cache = null; let cacheAt = 0;
export async function loadSettings(force = false) {
  if (!force && cache && Date.now() - cacheAt < 5000) return cache;
  try {
    const [row] = await sql`select * from security_settings where id=1`;
    cache = { ...shape(row), allow: buildAllowList(row.allowlist) }; cacheAt = Date.now();
  } catch (error) { if (!cache) throw error; } // keep enforcing the last known policy if the DB blips
  return cache;
}

export function viewer(req) { return { ip: String(req.headers['cf-connecting-ip'] || ''), country: String(req.headers['cf-ipcountry'] || '').toUpperCase() }; }

const BLOCK_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not available</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f5f7fb;color:#1b2840}main{max-width:420px;padding:32px 24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#5d6a80}</style></head><body><main><h1>This site is not available in your region</h1><p>Access from your location is restricted.</p></main></body></html>`;

async function count(reason) {
  const key = `bpn:blocked:${new Date().toISOString().slice(0, 10)}:${reason}`;
  try { await redis.multi().incr(key).expire(key, 40 * 86400).exec(); } catch {}
}

async function cloudflare(path, init = {}) {
  const response = await fetch(CF_API + path, { ...init, headers: { authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok && body.success !== false, body };
}

/** Creates, updates or removes the managed WAF custom rule so the edge matches the admin settings. */
export async function syncEdge(settings) {
  if (!edgeConfigured()) return { status: 'not_configured', message: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID to enable edge blocking.' };
  const zone = encodeURIComponent(config.CLOUDFLARE_ZONE_ID);
  const expression = edgeExpression(settings, { site: siteHost, admin: adminHost, media: mediaHost });
  const rule = { ref: RULE_REF, description: RULE_DESCRIPTION, expression, action: 'block', enabled: true };
  let result;
  try {
    const entry = await cloudflare(`/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`);
    if (entry.status === 404) {
      result = expression ? await cloudflare(`/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`, { method: 'PUT', body: JSON.stringify({ rules: [rule] }) }) : { ok: true };
    } else if (!entry.ok) {
      result = entry;
    } else {
      const ruleset = entry.body.result;
      const existing = (ruleset.rules || []).find((item) => item.ref === RULE_REF || item.description === RULE_DESCRIPTION);
      if (expression && existing) result = await cloudflare(`/zones/${zone}/rulesets/${ruleset.id}/rules/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ ...rule, position: { index: 1 } }) });
      else if (expression) result = await cloudflare(`/zones/${zone}/rulesets/${ruleset.id}/rules`, { method: 'POST', body: JSON.stringify({ ...rule, position: { index: 1 } }) });
      else if (existing) result = await cloudflare(`/zones/${zone}/rulesets/${ruleset.id}/rules/${existing.id}`, { method: 'DELETE' });
      else result = { ok: true };
    }
  } catch (error) {
    return { status: 'error', message: 'Cloudflare could not be reached: ' + (error.name === 'TimeoutError' ? 'timed out' : error.message) };
  }
  if (result.ok) return { status: expression ? 'active' : 'off', message: expression ? 'Cloudflare blocks these visitors before they reach the server.' : 'No edge rule is needed for the current settings.' };
  const reason = result.body?.errors?.map((error) => error.message).join('; ') || `HTTP ${result.status}`;
  return { status: 'error', message: result.status === 403 || result.status === 401 ? 'The Cloudflare token lacks permission (needs Zone → WAF → Edit for this zone).' : 'Cloudflare rejected the rule: ' + reason };
}

async function recordEdge(outcome) {
  await sql`update security_settings set edge_status=${outcome.status},edge_message=${outcome.message},edge_synced_at=now() where id=1`;
  await loadSettings(true);
}

async function stats() {
  const days = Array.from({ length: 7 }, (_, index) => new Date(Date.now() - index * 86400000).toISOString().slice(0, 10));
  const rows = [];
  try {
    for (const day of days) {
      const keys = await redis.keys(`bpn:blocked:${day}:*`);
      if (!keys.length) continue;
      const values = await redis.mget(keys);
      keys.forEach((key, index) => rows.push({ day, reason: key.split(':').pop(), count: Number(values[index] || 0) }));
    }
  } catch {}
  return rows;
}

export function securityCenter(app, { admin, fail }) {
  // Called by Caddy for every page request. Not reachable from outside (Caddy hides /api/internal).
  app.get('/api/internal/geo-gate', { logLevel: 'warn', config: { rateLimit: false } }, async (req, reply) => {
    const settings = await loadSettings();
    const visitor = viewer(req);
    const reason = decide(settings, { ...visitor, app: req.headers['x-gate-app'] === 'admin' ? 'admin' : 'public', viaCloudflare: Boolean(req.headers['cf-ray'] && visitor.ip) });
    if (!reason) return reply.code(204).send();
    void count(reason);
    return reply.code(403).header('cache-control', 'no-store').type('text/html; charset=utf-8').send(BLOCK_PAGE);
  });

  app.get('/api/admin/security', { preHandler: admin }, async (req) => {
    const settings = await loadSettings(true);
    const { allow, ...publicSettings } = settings;
    const you = viewer(req);
    return { settings: publicSettings, you: { ...you, allowlisted: isAllowlisted(settings.allow, you.ip) }, hosts: { site: siteHost, admin: adminHost, media: mediaHost }, stats: await stats() };
  });

  app.put('/api/admin/security', { preHandler: admin }, async (req) => {
    const input = settingsInput.parse(req.body);
    input.blockedCountries = [...new Set(input.blockedCountries)];
    input.allowlist = [...new Set(input.allowlist)];
    const you = viewer(req);
    const preview = { ...input, allow: buildAllowList(input.allowlist) };
    if (decide(preview, { ...you, app: 'admin', viaCloudflare: true })) throw fail(409, 'These settings would lock you out of the admin panel. Add your IP to the allowlist first, or leave the admin panel unblocked.');
    await sql.begin(async (tx) => {
      await tx`update security_settings set geo_enabled=${input.geoEnabled},blocked_countries=${input.blockedCountries},block_tor=${input.blockTor},block_unknown=${input.blockUnknown},protect_admin=${input.protectAdmin},cloudflare_only=${input.cloudflareOnly},allowlist=${input.allowlist},updated_by=${req.user.id},updated_at=now() where id=1`;
      await audit(tx, req.user.id, 'security.settings', 'security', { ...input, ip: you.ip, country: you.country });
    });
    const settings = await loadSettings(true);
    await recordEdge(await syncEdge(settings));
    const { allow, ...publicSettings } = await loadSettings(true);
    return { settings: publicSettings };
  });

  app.post('/api/admin/security/sync', { preHandler: admin }, async () => {
    await recordEdge(await syncEdge(await loadSettings(true)));
    const { allow, ...publicSettings } = await loadSettings(true);
    return { settings: publicSettings };
  });
}

// Re-apply the edge rule shortly after startup so the edge matches the database
// even if someone edited the rule in the Cloudflare dashboard.
export async function startupEdgeSync() {
  if (!edgeConfigured()) return;
  try { await recordEdge(await syncEdge(await loadSettings(true))); } catch {}
}
