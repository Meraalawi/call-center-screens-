// Password hashing, standing in for bcrypt (see the note in src/db/index.js —
// no package registry is reachable in this sandbox). Uses Node's built-in
// crypto.scrypt, which is a memory-hard KDF suitable for password storage,
// with a random salt per password and a constant-time comparison.
const crypto = require('crypto');

const KEY_LEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }; // ~ interactive-strength cost

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length, SCRYPT_PARAMS);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
