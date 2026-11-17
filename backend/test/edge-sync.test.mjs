import { test } from 'node:test';
import assert from 'node:assert/strict';

// A small stand-in for Cloudflare's ruleset API that enforces the same index rule that rejected us.
function fakeCloudflare(initialRules) {
  const state = { rules: initialRules.map((rule, i) => ({ id: 'r' + i, ...rule })), calls: [] };
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/client/v4', '');
    const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push(`${method} ${path.replace(/\/zones\/[a-f0-9]+/, '/zones/Z')}`);
    const reply = (status, result) => new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ message: result }] }), { status });
    if (path.endsWith('/entrypoint')) return reply(200, { id: 'rs1', rules: state.rules });
    const match = path.match(/\/rulesets\/rs1\/rules(?:\/(\w+))?$/);
    if (method === 'POST') {
      const index = body.position?.index;
      if (index !== undefined && (index < 1 || index > state.rules.length + 1)) return reply(400, `'${index}' is not a valid value for index because the index is out of range`);
      if (body.position) assert.equal(typeof index, 'number');
      state.rules.splice((index ?? state.rules.length + 1) - 1, 0, { id: 'n' + state.rules.length, ...body });
      return reply(200, {});
    }
    if (method === 'PATCH') { if (body.position) return reply(400, 'position not allowed here'); Object.assign(state.rules.find((r) => r.id === match[1]), body); return reply(200, {}); }
    if (method === 'DELETE') { state.rules = state.rules.filter((r) => r.id !== match[1]); return reply(200, {}); }
    return reply(404, 'not found');
  };
  return state;
}

test('edge sync: regression for the out-of-range index and the rule lifecycle', async () => {
  Object.assign(process.env, { DATABASE_URL: 'postgres://x:x@127.0.0.1:1/x', REDIS_URL: 'redis://127.0.0.1:1', SITE_ORIGIN: 'https://backpagenew.com', ADMIN_ORIGIN: 'https://admin.backpagenew.com', MEDIA_PUBLIC_URL: 'https://media.backpagenew.com', CLOUDFLARE_API_TOKEN: 'token-for-tests-token-for-tests', CLOUDFLARE_ZONE_ID: 'a'.repeat(32) });
  const { syncEdge } = await import('../src/security-center.mjs');
  const settings = { geoEnabled: true, blockedCountries: ['BD'], blockTor: false, blockUnknown: false, protectAdmin: false, cloudflareOnly: true, adminAllowlistOnly: false, allowlist: ['203.0.113.7'] };

  // 1. The exact failure: the managed rule already exists as the ONLY rule (rule #1 was deleted).
  let cf = fakeCloudflare([{ ref: 'bpn_geo_block', description: 'BackpageNew country blocking (managed from the admin panel; edits here are overwritten)', expression: 'old', action: 'block' }]);
  let outcome = await syncEdge({ ...settings, adminAllowlistOnly: false });
  assert.equal(outcome.status, 'active', outcome.message);
  assert.match(cf.rules[0].expression, /ip\.src\.country in \{"BD"\}/);

  // 2. First time (no rules): the rule is created.
  cf = fakeCloudflare([]);
  outcome = await syncEdge(settings); assert.equal(outcome.status, 'active', outcome.message); assert.equal(cf.rules.length, 1);

  // 3. A stranger's rule is never touched; ours goes first.
  cf = fakeCloudflare([{ ref: 'theirs', description: 'Someone else', expression: 'true', action: 'log' }]);
  outcome = await syncEdge(settings); assert.equal(outcome.status, 'active', outcome.message);
  assert.deepEqual(cf.rules.map((r) => r.ref), ['bpn_geo_block', 'theirs']);

  // 4. Both rules (country block + admin lock) on a zone that already has two other rules.
  cf = fakeCloudflare([{ ref: 'a', description: 'A', expression: 'true', action: 'log' }, { ref: 'b', description: 'B', expression: 'true', action: 'log' }]);
  outcome = await syncEdge({ ...settings, adminAllowlistOnly: true }); assert.equal(outcome.status, 'active', outcome.message);
  assert.deepEqual(cf.rules.map((r) => r.ref), ['bpn_admin_lock', 'bpn_geo_block', 'a', 'b']);

  // 5. Updating twice is stable, and turning blocking off removes only our rules.
  outcome = await syncEdge({ ...settings, adminAllowlistOnly: true }); assert.equal(outcome.status, 'active', outcome.message); assert.equal(cf.rules.length, 4);
  outcome = await syncEdge({ ...settings, geoEnabled: false, adminAllowlistOnly: false });
  assert.equal(outcome.status, 'off', outcome.message); assert.deepEqual(cf.rules.map((r) => r.ref), ['a', 'b']);
  process.exit(0);
});
