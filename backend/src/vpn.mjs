// Admin VPN: devices are managed here; ops/security/vpn-sync.sh applies the list to
// WireGuard on the host every few seconds and reports status back.
import { generateKeyPairSync } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { sql, audit } from './db.mjs';
import { config } from './config.mjs';

const NET = '10.66.66.';
const MAX_DEVICES = 30;
const ONLINE_MS = 3 * 60 * 1000; // WireGuard re-handshakes every 2 minutes while in use

/** WireGuard keys are raw 32-byte X25519 keys in base64. */
export function wireguardKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519', { publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' } });
  return { publicKey: publicKey.subarray(-32).toString('base64'), privateKey: privateKey.subarray(-32).toString('base64') };
}

export function clientConfig({ privateKey, address, serverPublicKey, endpoint, port }) {
  return `[Interface]
PrivateKey = ${privateKey}
Address = ${address}/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${endpoint}:${port}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
}

const deviceView = (row) => ({ id: row.id, name: row.name, address: row.address, createdAt: row.created_at, createdBy: row.created_by_name || null, lastHandshakeAt: row.last_handshake_at, online: Boolean(row.last_handshake_at && Date.now() - new Date(row.last_handshake_at).getTime() < ONLINE_MS), rxBytes: Number(row.rx_bytes), txBytes: Number(row.tx_bytes) });

export function vpnRoutes(app, { admin, fail }) {
  app.get('/api/admin/vpn', { preHandler: admin }, async (req) => {
    const [server] = await sql`select public_key,listen_port,heartbeat_at from vpn_server where id=1`;
    const devices = await sql`select d.*,u.username as created_by_name from vpn_devices d left join users u on u.id=d.created_by order by d.created_at`;
    const ip = String(req.headers['cf-connecting-ip'] || '');
    return {
      server: { ready: Boolean(server?.public_key && config.ADMIN_VPN_IP), online: Boolean(server?.heartbeat_at && Date.now() - new Date(server.heartbeat_at).getTime() < 30000), address: config.ADMIN_VPN_IP || '', port: server?.listen_port || null, checkedAt: server?.heartbeat_at || null },
      you: { ip, onVpn: Boolean(config.ADMIN_VPN_IP && ip === config.ADMIN_VPN_IP) },
      devices: devices.map(deviceView), maxDevices: MAX_DEVICES,
    };
  });

  app.post('/api/admin/vpn/devices', { preHandler: admin, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().regex(/^[A-Za-z0-9 ._-]{1,40}$/, 'Use up to 40 letters, numbers, spaces, dots, dashes or underscores.') }).parse(req.body);
    const [server] = await sql`select public_key,listen_port from vpn_server where id=1`;
    if (!server?.public_key || !server.listen_port || !config.ADMIN_VPN_IP) throw fail(503, 'The VPN server is not running yet.');
    const keys = wireguardKeyPair();
    let device;
    for (let attempt = 0; attempt < 5 && !device; attempt += 1) {
      try {
        device = await sql.begin(async (tx) => {
          const used = new Set((await tx`select address from vpn_devices for update`).map((row) => row.address));
          if (used.size >= MAX_DEVICES) throw fail(409, `You can have up to ${MAX_DEVICES} devices. Remove one first.`);
          let host = 2; while (used.has(NET + host)) host += 1;
          const [row] = await tx`insert into vpn_devices (name,address,public_key,created_by) values (${name},${NET + host},${keys.publicKey},${req.user.id}) returning *`;
          await audit(tx, req.user.id, 'vpn.device.create', row.id, { name, address: row.address });
          return row;
        });
      } catch (error) { if (error.code !== '23505') throw error; }
    }
    if (!device) throw fail(409, 'Could not assign a VPN address. Try again.');
    const text = clientConfig({ privateKey: keys.privateKey, address: device.address, serverPublicKey: server.public_key, endpoint: config.ADMIN_VPN_IP, port: server.listen_port });
    const qrSvg = await QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    // The private key exists only in this response; it is never stored.
    reply.header('cache-control', 'no-store');
    return reply.code(201).send({ device: deviceView(device), config: text, qrSvg, fileName: `backpagenew-${name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'device'}.conf` });
  });

  app.delete('/api/admin/vpn/devices/:id', { preHandler: admin }, async (req) => {
    const id = z.uuid().parse(req.params.id);
    const removed = await sql.begin(async (tx) => {
      const [row] = await tx`delete from vpn_devices where id=${id} returning id,name,address`;
      if (row) await audit(tx, req.user.id, 'vpn.device.remove', row.id, { name: row.name, address: row.address });
      return row;
    });
    if (!removed) throw fail(404, 'Device not found');
    return { ok: true };
  });
}
