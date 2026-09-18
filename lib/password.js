import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, options);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [algorithm, salt, hex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex)) return false;
  const actual = await scrypt(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
// Unknown accounts still perform the same expensive password derivation.
export const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
