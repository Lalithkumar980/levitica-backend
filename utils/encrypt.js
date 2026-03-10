const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT = 'levitica-password-display';

function getKey() {
  const secret = process.env.PASSWORD_DISPLAY_KEY || process.env.JWT_SECRET || 'levitica-dev-key';
  return crypto.scryptSync(secret, SALT, KEY_LEN);
}

/** Encrypt plaintext for admin-only display. Returns base64 string. */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt ciphertext. Returns plaintext or empty string on failure. */
function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return '';
  try {
    const key = getKey();
    const buf = Buffer.from(ciphertext, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) return '';
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch {
    return '';
  }
}

module.exports = { encrypt, decrypt };
