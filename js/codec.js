// Compact, URL-safe encoding of JSON data for the URL hash.
// Format: one marker character + base64url.
//   "z" = deflate-raw compressed JSON, "r" = uncompressed JSON (fallback)

import { ValidationError } from './schema.js';

/** Upper bound for decoded payloads; protects against decompression bombs. */
export const MAX_DECODED_BYTES = 1_000_000;
/** Upper bound for the encoded string accepted from outside. */
export const MAX_ENCODED_CHARS = 400_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new ValidationError('Der Link ist beschädigt.');
  }
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new ValidationError('Der Link ist beschädigt.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function runStream(bytes, stream, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ValidationError('Die Daten sind zu groß.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const canCompress = () => typeof CompressionStream === 'function';

/** Encodes any JSON-serialisable value into a compact URL-safe string. */
export async function encodePayload(value) {
  const bytes = encoder.encode(JSON.stringify(value));
  if (canCompress()) {
    const packed = await runStream(bytes, new CompressionStream('deflate-raw'), Infinity);
    return `z${toBase64Url(packed)}`;
  }
  return `r${toBase64Url(bytes)}`;
}

/** Decodes a string produced by encodePayload. Throws ValidationError on bad input. */
export async function decodePayload(text) {
  if (typeof text !== 'string' || text.length < 2 || text.length > MAX_ENCODED_CHARS) {
    throw new ValidationError('Der Link ist leer, beschädigt oder zu lang.');
  }
  const marker = text[0];
  let bytes = fromBase64Url(text.slice(1));
  if (marker === 'z') {
    if (typeof DecompressionStream !== 'function') {
      throw new ValidationError('Dieser Browser ist zu alt, um den Link zu öffnen.');
    }
    try {
      bytes = await runStream(bytes, new DecompressionStream('deflate-raw'), MAX_DECODED_BYTES);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('Der Link ist beschädigt.');
    }
  } else if (marker !== 'r') {
    throw new ValidationError('Unbekanntes Link-Format.');
  }
  if (bytes.length > MAX_DECODED_BYTES) throw new ValidationError('Die Daten sind zu groß.');
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new ValidationError('Der Link ist beschädigt.');
  }
}

export const HASH_KINDS = Object.freeze({ group: 'g', santa: 'w' });

/** Builds "#g=<payload>" (group) or "#w=<payload>" (Secret Santa result). */
export async function buildHash(kind, value) {
  const key = HASH_KINDS[kind];
  if (!key) throw new RangeError('unknown hash kind');
  return `#${key}=${await encodePayload(value)}`;
}

/** Splits a location hash (or a whole pasted link) into kind and payload, or returns null. */
export function parseHash(input) {
  if (typeof input !== 'string') return null;
  const hashIndex = input.indexOf('#');
  const hash = hashIndex >= 0 ? input.slice(hashIndex) : input;
  const m = /^#([gw])=([A-Za-z0-9_-]+)$/.exec(hash.trim());
  if (!m) return null;
  return { kind: m[1] === 'g' ? 'group' : 'santa', payload: m[2] };
}
