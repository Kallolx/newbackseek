// Pure helpers (no I/O) so they can be unit tested.
import { createHmac, timingSafeEqual } from 'node:crypto';

// ---- TOTP (RFC 6238: 30-second steps, 6 digits, SHA-1, as every authenticator app expects) ----
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text) {
  let bits = 0, value = 0; const out = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char); if (index < 0) continue;
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totpCode(secret, counter) {
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
const step = (now = Date.now()) => Math.floor(now / 30000);
/** Counter that matches the code (one step of clock drift either way), or null. */
export function matchTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  for (const drift of [0, -1, 1]) {
    const counter = step(now) + drift;
    const expected = Buffer.from(totpCode(secret, counter)), given = Buffer.from(code);
    if (timingSafeEqual(expected, given)) return counter;
  }
  return null;
}
