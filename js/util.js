// Pure helpers without DOM access, so they can be tested with node --test.

/** Uniform random integer in [0, max) using the Web Crypto RNG (no modulo bias). */
export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
    throw new RangeError('max out of range');
  }
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/** Fisher-Yates shuffle returning a new array. `rng(n)` must return an int in [0, n). */
export function shuffle(items, rng = randomInt) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short random id made of [a-z0-9]. */
export function uid(length = 8, rng = randomInt) {
  let out = '';
  for (let i = 0; i < length; i++) out += ID_ALPHABET[rng(ID_ALPHABET.length)];
  return out;
}

const DAY_MS = 86_400_000;

function daysBetween(now, month, day, year) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(year, month, day) - today) / DAY_MS);
}

/**
 * Countdown information for the header.
 * state: "countdown" | "eve" (24.12.) | "holidays" (25./26.12.)
 * After the 26th the countdown targets the next year.
 */
export function christmasInfo(now = new Date()) {
  const year = now.getFullYear();
  const diff = daysBetween(now, 11, 24, year);
  const nikolaus = daysBetween(now, 11, 6, year);
  if (diff > 0) {
    return { state: 'countdown', days: diff, nikolausDays: nikolaus > 0 ? nikolaus : null };
  }
  if (diff === 0) return { state: 'eve', days: 0, nikolausDays: null };
  if (diff >= -2) return { state: 'holidays', days: 0, nikolausDays: null };
  const next = daysBetween(now, 11, 24, year + 1);
  const nextNikolaus = daysBetween(now, 11, 6, year + 1);
  return { state: 'countdown', days: next, nikolausDays: nextNikolaus > 0 ? nextNikolaus : null };
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatPrice(value) {
  return euro.format(value);
}

/** File-name friendly version of a text. */
export function slugify(text) {
  const slug = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 40) || 'gruppe';
}
