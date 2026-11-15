// Data schema and validation. Everything that enters the app from the outside
// (URL hash, JSON import, localStorage) is untrusted and goes through here.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
  groupName: 80,
  personName: 40,
  people: 40,
  wishesPerPerson: 60,
  title: 120,
  note: 500,
  url: 500,
  deleted: 600,
  maxPrice: 100000,
  maxBudget: 10000,
  cipher: 200000,
});

export const PRIORITIES = Object.freeze({
  3: { label: 'Großer Wunsch', stars: '★★★' },
  2: { label: 'Schön', stars: '★★' },
  1: { label: 'Nice-to-have', stars: '★' },
});

const ID_RE = /^[a-z0-9]{4,20}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
// Control characters (single line) and bidi override characters (spoofing).
const CONTROL_ALL = /[\u0000-\u001F\u007F-\u009F]+/g;
const CONTROL_KEEP_NL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]+/g;
const BIDI = /[‪-‮⁦-⁩]/g;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validates and normalises a text value. Throws if it is too long or too short. */
export function cleanText(value, { label, max, min = 0, multiline = false }) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${label}: ungültiger Wert.`);
  let s = value.normalize('NFC').replace(BIDI, '');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(CONTROL_KEEP_NL, ' ').trim();
  } else {
    s = s.replace(CONTROL_ALL, ' ').replace(/\s+/g, ' ').trim();
  }
  if (s.length < min) throw new ValidationError(`${label} darf nicht leer sein.`);
  if (s.length > max) throw new ValidationError(`${label} ist zu lang (max. ${max} Zeichen).`);
  return s;
}

export function cleanId(value, label = 'ID') {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new ValidationError(`${label}: ungültige ID.`);
  }
  return value;
}

/**
 * Returns a normalised http(s) URL or '' for empty input.
 * Input without a scheme gets "https://". Every other scheme is rejected.
 */
export function cleanUrl(value) {
  const raw = cleanText(value, { label: 'Link', max: LIMITS.url });
  if (raw === '') return '';
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new ValidationError('Der Link ist keine gültige Adresse.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Es sind nur Links mit http oder https erlaubt.');
  }
  if (url.username || url.password) {
    throw new ValidationError('Links mit Benutzername oder Passwort sind nicht erlaubt.');
  }
  if (url.href.length > LIMITS.url) {
    throw new ValidationError(`Der Link ist zu lang (max. ${LIMITS.url} Zeichen).`);
  }
  return url.href;
}

/** Returns the URL if it is a safe http(s) URL, otherwise ''. Used when rendering. */
export function safeHref(value) {
  try {
    return cleanUrl(value);
  } catch {
    return '';
  }
}

/**
 * Parses a price typed by a person ("25", "24,90", "1.234,50", "25 €").
 * Returns a number or null for empty input.
 */
export function parsePrice(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return validatePrice(input);
  let s = String(input).replace(/[€\s]|EUR/gi, '');
  if (s === '') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new ValidationError('Bitte gib einen gültigen Preis ein, z. B. 25 oder 24,90.');
  }
  return validatePrice(Number(s));
}

function validatePrice(n) {
  if (!Number.isFinite(n) || n < 0 || n > LIMITS.maxPrice) {
    throw new ValidationError(`Der Preis muss zwischen 0 und ${LIMITS.maxPrice} € liegen.`);
  }
  return Math.round(n * 100) / 100;
}

export function parseBudget(input) {
  if (input === null || input === undefined || input === '') return null;
  const n = parsePrice(input);
  if (n === null) return null;
  if (n > LIMITS.maxBudget) {
    throw new ValidationError(`Der Preisrahmen darf höchstens ${LIMITS.maxBudget} € betragen.`);
  }
  return n;
}

function cleanTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Validates one wish. `ctx.ownerId` and `ctx.personIds` are needed for reservations. */
export function parseWish(raw, ctx = {}) {
  if (!isPlainObject(raw)) throw new ValidationError('Ungültiger Wunsch.');
  const wish = {
    id: cleanId(raw.id, 'Wunsch-ID'),
    title: cleanText(raw.title, { label: 'Titel', max: LIMITS.title, min: 1 }),
    note: cleanText(raw.note, { label: 'Notiz', max: LIMITS.note, multiline: true }),
    price: raw.price === null || raw.price === undefined ? null : parsePrice(raw.price),
    url: cleanUrl(raw.url),
    prio: [1, 2, 3].includes(raw.prio) ? raw.prio : 2,
    shared: raw.shared === true,
    reservedBy: [],
    u: cleanTimestamp(raw.u),
    ru: cleanTimestamp(raw.ru),
  };
  if (ctx.reservations !== false && raw.reservedBy !== undefined) {
    if (!Array.isArray(raw.reservedBy)) throw new ValidationError('Ungültige Reservierung.');
    const seen = new Set();
    for (const pid of raw.reservedBy) {
      cleanId(pid, 'Personen-ID');
      if (!ctx.personIds?.has(pid) || pid === ctx.ownerId || seen.has(pid)) {
        throw new ValidationError('Ungültige Reservierung.');
      }
      seen.add(pid);
      wish.reservedBy.push(pid);
    }
    if (!wish.shared && wish.reservedBy.length > 1) {
      throw new ValidationError('Ungültige Reservierung.');
    }
  }
  return wish;
}

/** Validates a whole group (from URL hash, import or storage). Returns a clean copy. */
export function parseGroup(raw) {
  if (!isPlainObject(raw)) throw new ValidationError('Das ist keine gültige Wunschlisten-Gruppe.');
  if (raw.v !== SCHEMA_VERSION) throw new ValidationError('Unbekannte Datenversion.');
  if (!Array.isArray(raw.people) || raw.people.length > LIMITS.people) {
    throw new ValidationError(`Eine Gruppe darf höchstens ${LIMITS.people} Personen enthalten.`);
  }

  const personIds = new Set();
  for (const p of raw.people) {
    if (!isPlainObject(p)) throw new ValidationError('Ungültige Person.');
    personIds.add(cleanId(p.id, 'Personen-ID'));
  }
  if (personIds.size !== raw.people.length) throw new ValidationError('Doppelte Personen-ID.');

  const usedIds = new Set(personIds);
  const people = raw.people.map((p) => {
    if (!Array.isArray(p.wishes) || p.wishes.length > LIMITS.wishesPerPerson) {
      throw new ValidationError(`Pro Person sind höchstens ${LIMITS.wishesPerPerson} Wünsche erlaubt.`);
    }
    const wishes = p.wishes.map((w) => {
      const wish = parseWish(w, { ownerId: p.id, personIds });
      if (usedIds.has(wish.id)) throw new ValidationError('Doppelte Wunsch-ID.');
      usedIds.add(wish.id);
      return wish;
    });
    return {
      id: p.id,
      name: cleanText(p.name, { label: 'Name', max: LIMITS.personName, min: 1 }),
      wishes,
    };
  });

  const deletedRaw = raw.deleted ?? [];
  if (!Array.isArray(deletedRaw) || deletedRaw.length > LIMITS.deleted) {
    throw new ValidationError('Ungültige Daten (deleted).');
  }
  const deleted = [...new Set(deletedRaw.map((id) => cleanId(id)))];

  return {
    v: SCHEMA_VERSION,
    gid: cleanId(raw.gid, 'Gruppen-ID'),
    name: cleanText(raw.name, { label: 'Gruppenname', max: LIMITS.groupName, min: 1 }),
    budget: raw.budget === null || raw.budget === undefined ? null : parseBudget(raw.budget),
    people,
    deleted,
  };
}

/** Public header of a Secret Santa link (the assignment itself is encrypted). */
export function parseSantaLink(raw) {
  if (!isPlainObject(raw) || raw.v !== SCHEMA_VERSION || raw.k !== 'santa') {
    throw new ValidationError('Das ist kein gültiger Wichtel-Link.');
  }
  const cipher = raw.e;
  if (typeof cipher !== 'string' || !BASE64URL_RE.test(cipher) || cipher.length > LIMITS.cipher) {
    throw new ValidationError('Der Wichtel-Link ist beschädigt.');
  }
  return {
    v: SCHEMA_VERSION,
    k: 'santa',
    groupName: cleanText(raw.n, { label: 'Gruppenname', max: LIMITS.groupName, min: 1 }),
    budget: raw.b === null || raw.b === undefined ? null : parseBudget(raw.b),
    giver: cleanText(raw.g, { label: 'Name', max: LIMITS.personName, min: 1 }),
    drawId: cleanId(raw.d, 'Ziehungs-ID'),
    cipher,
  };
}

/** Decrypted content of a Secret Santa link: who to gift and that person's wishes. */
export function parseSantaReveal(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.w) || raw.w.length > LIMITS.wishesPerPerson) {
    throw new ValidationError('Das Ergebnis ist beschädigt.');
  }
  const ids = new Set();
  const wishes = raw.w.map((w) => {
    const wish = parseWish(w, { reservations: false });
    if (ids.has(wish.id)) throw new ValidationError('Das Ergebnis ist beschädigt.');
    ids.add(wish.id);
    return wish;
  });
  return {
    receiver: cleanText(raw.r, { label: 'Name', max: LIMITS.personName, min: 1 }),
    wishes,
  };
}
