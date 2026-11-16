import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return salt + ':' + key.toString('hex');
}
export async function verifyPassword(password, encoded) {
  const [salt, value] = encoded.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(value, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
