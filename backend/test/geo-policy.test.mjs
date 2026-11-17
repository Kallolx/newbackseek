import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, edgeExpression, buildAllowList, validCidr } from '../src/geo-policy.mjs';

const base = { geoEnabled: true, blockedCountries: ['BD'], blockTor: false, blockUnknown: false, protectAdmin: false, cloudflareOnly: true, allowlist: [] };
const settings = (extra = {}) => { const value = { ...base, ...extra }; return { ...value, allow: buildAllowList(value.allowlist) }; };
const visit = (extra = {}) => ({ ip: '203.0.113.9', country: 'BD', app: 'public', viaCloudflare: true, ...extra });

test('blocks a blocked country on the public site and lets others through', () => {
  assert.equal(decide(settings(), visit()), 'BD');
  assert.equal(decide(settings(), visit({ country: 'US' })), '');
});
test('nothing is blocked by country while the switch is off', () => {
  assert.equal(decide(settings({ geoEnabled: false }), visit()), '');
});
test('requests that bypass Cloudflare are refused even with country blocking off', () => {
  assert.equal(decide(settings({ geoEnabled: false }), visit({ viaCloudflare: false })), 'direct');
  assert.equal(decide(settings({ cloudflareOnly: false, geoEnabled: false }), visit({ viaCloudflare: false })), '');
});
test('admin panel is only blocked when protectAdmin is on', () => {
  assert.equal(decide(settings(), visit({ app: 'admin' })), '');
  assert.equal(decide(settings({ protectAdmin: true }), visit({ app: 'admin' })), 'BD');
});
test('allowlisted addresses and ranges bypass country blocking', () => {
  assert.equal(decide(settings({ allowlist: ['203.0.113.9'] }), visit()), '');
  assert.equal(decide(settings({ allowlist: ['203.0.113.0/24'] }), visit()), '');
  assert.equal(decide(settings({ allowlist: ['2001:db8::/32'] }), visit({ ip: '2001:db8::5' })), '');
  assert.equal(decide(settings({ allowlist: ['198.51.100.0/24'] }), visit()), 'BD');
});
test('Tor and unknown locations can be blocked separately', () => {
  assert.equal(decide(settings({ blockTor: true }), visit({ country: 'T1' })), 'T1');
  assert.equal(decide(settings(), visit({ country: 'T1' })), '');
  assert.equal(decide(settings({ blockUnknown: true }), visit({ country: 'XX' })), 'XX');
  assert.equal(decide(settings({ blockUnknown: true }), visit({ country: '' })), 'XX');
});
test('edge expression covers site, www and media, and admin only when protected', () => {
  const hosts = { site: 'backpagenew.com', admin: 'admin.backpagenew.com', media: 'media.backpagenew.com' };
  assert.equal(edgeExpression(base, hosts), '(http.host in {"backpagenew.com" "www.backpagenew.com" "media.backpagenew.com"} and ip.src.country in {"BD"})');
  const full = edgeExpression({ ...base, protectAdmin: true, blockTor: true, allowlist: ['203.0.113.0/24'] }, hosts);
  assert.match(full, /"admin\.backpagenew\.com"/); assert.match(full, /"T1"/); assert.match(full, / and not ip\.src in \{203\.0\.113\.0\/24\}$/);
  assert.equal(edgeExpression({ ...base, geoEnabled: false }, hosts), '');
  assert.equal(edgeExpression({ ...base, blockedCountries: [] }, hosts), '');
});
test('edge expression cannot be injected through settings', () => {
  const hosts = { site: 'backpagenew.com', admin: 'admin.backpagenew.com', media: '' };
  const expression = edgeExpression({ ...base, blockedCountries: ['BD', 'x"} or true or {"'], allowlist: ['1.2.3.4} or true', '10.0.0.0/8'] }, hosts);
  assert.ok(!expression.includes('or true'), expression);
});
test('allowlist validation', () => {
  for (const value of ['203.0.113.7', '203.0.113.0/24', '2001:db8::/32']) assert.ok(validCidr(value), value);
  for (const value of ['nope', '1.2.3.4/40', '0.0.0.0/0', '1.2.3.4/8/1', '::/0']) assert.ok(!validCidr(value), value);
});
