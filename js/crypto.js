// Passphrase-based encryption with Web Crypto: PBKDF2-SHA-256 -> AES-256-GCM.
// Binary layout: [version(1)] [salt(16)] [iv(12)] [ciphertext + GCM tag]

import { ValidationError } from './schema.js';

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 6;
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export class DecryptError extends Error {
  constructor() {
    super('Falsche PIN oder beschädigter Link.');
    this.name = 'DecryptError';
  }
}

export function assertPassphrase(passphrase) {
  const normalized = String(passphrase ?? '').normalize('NFKC').trim();
  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    throw new ValidationError(`Die PIN bzw. das Passwort braucht mindestens ${MIN_PASSPHRASE_LENGTH} Zeichen.`);
  }
  return normalized;
}

async function deriveKey(passphrase, salt, usage) {
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Encrypts a JSON value. `aad` is authenticated but not encrypted (binds the ciphertext to its header). */
export async function encryptJson(value, passphrase, aad = '') {
  const secret = assertPassphrase(passphrase);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(secret, salt, 'encrypt');
  const cipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
      key,
      encoder.encode(JSON.stringify(value)),
    ),
  );
  const out = new Uint8Array(1 + SALT_BYTES + IV_BYTES + cipher.length);
  out[0] = VERSION;
  out.set(salt, 1);
  out.set(iv, 1 + SALT_BYTES);
  out.set(cipher, 1 + SALT_BYTES + IV_BYTES);
  return out;
}

/** Decrypts the output of encryptJson. Throws DecryptError for a wrong passphrase or tampered data. */
export async function decryptJson(bytes, passphrase, aad = '') {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 + SALT_BYTES + IV_BYTES + 16 || bytes[0] !== VERSION) {
    throw new DecryptError();
  }
  const secret = String(passphrase ?? '').normalize('NFKC').trim();
  try {
    const salt = bytes.slice(1, 1 + SALT_BYTES);
    const iv = bytes.slice(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES);
    const key = await deriveKey(secret, salt, 'decrypt');
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
      key,
      bytes.slice(1 + SALT_BYTES + IV_BYTES),
    );
    return JSON.parse(decoder.decode(plain));
  } catch {
    throw new DecryptError();
  }
}
