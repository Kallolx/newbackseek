// Pure country-blocking policy (no I/O) so it can be unit tested.
import { BlockList, isIP } from 'node:net';

export function validCidr(value) {
  const [address, prefix, extra] = String(value).split('/');
  const family = isIP(address);
  if (!family || extra !== undefined) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128) && Number(prefix) >= (family === 4 ? 8 : 16);
}

export function buildAllowList(entries) {
  const list = new BlockList();
  for (const entry of entries) {
    const [address, prefix] = entry.split('/'); const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
    prefix ? list.addSubnet(address, Number(prefix), family) : list.addAddress(address, family);
  }
  return list;
}

export function isAllowlisted(allow, ip) {
  if (!ip || !isIP(ip)) return false;
  try { return allow.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4'); } catch { return false; }
}

/** Returns why a request must be refused ('direct', a country code, 'T1', 'XX'), or '' to allow it. */
export function decide(settings, { ip, country, app, viaCloudflare }) {
  if (settings.cloudflareOnly && !viaCloudflare) return 'direct';
  if (isAllowlisted(settings.allow, ip)) return '';
  // VPN-only admin panel: nobody outside the allowlist reaches it, from any country.
  if (app === 'admin' && settings.adminAllowlistOnly) return 'admin';
  if (!settings.geoEnabled) return '';
  if (app === 'admin' && !settings.protectAdmin) return '';
  if (settings.blockTor && country === 'T1') return 'T1';
  if (settings.blockUnknown && (!country || country === 'XX')) return 'XX';
  if (country && settings.blockedCountries.includes(country)) return country;
  return '';
}

const hostName = (name) => Boolean(name) && /^[a-z0-9.-]+$/.test(name);

/** Cloudflare WAF expression that keeps the admin (and manager) hosts for allowlisted addresses only. */
export function adminLockExpression(settings, { admin, manager }) {
  const allow = settings.allowlist.filter(validCidr);
  const hosts = [...new Set([admin, manager].filter(hostName))];
  if (!settings.adminAllowlistOnly || !allow.length || !hostName(admin)) return '';
  const match = hosts.length === 1 ? `http.host eq "${hosts[0]}"` : `http.host in {${hosts.map((item) => `"${item}"`).join(' ')}}`;
  return `(${match} and not ip.src in {${allow.join(' ')}})`;
}

/** Cloudflare WAF expression for the same policy ('' when no edge rule is needed). */
export function edgeExpression(settings, { site, admin, manager, media }) {
  const codes = [...new Set([...settings.blockedCountries, ...(settings.blockTor ? ['T1'] : []), ...(settings.blockUnknown ? ['XX'] : [])])]
    .filter((code) => /^[A-Z0-9]{2}$/.test(code));
  if (!settings.geoEnabled || !codes.length) return '';
  const hosts = [...new Set([site, site && 'www.' + site, media, settings.protectAdmin ? admin : '', settings.protectAdmin ? manager : ''].filter(hostName))];
  const quoted = (list) => list.map((item) => `"${item}"`).join(' ');
  let expression = `(http.host in {${quoted(hosts)}} and ip.src.country in {${quoted(codes)}})`;
  const allow = settings.allowlist.filter(validCidr);
  if (allow.length) expression += ` and not ip.src in {${allow.join(' ')}}`;
  return expression;
}
