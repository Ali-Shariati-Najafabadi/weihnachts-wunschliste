// Pure operations on a group object. All functions validate their input and
// mutate the given group in place; the store takes care of persistence.

import {
  LIMITS,
  SCHEMA_VERSION,
  ValidationError,
  cleanText,
  cleanUrl,
  parseBudget,
  parsePrice,
} from './schema.js';
import { uid } from './util.js';

const now = () => Date.now();

function freshId(group) {
  const used = new Set(group.deleted);
  for (const p of group.people) {
    used.add(p.id);
    for (const w of p.wishes) used.add(w.id);
  }
  let id;
  do {
    id = uid(8);
  } while (used.has(id));
  return id;
}

export function normalizeName(name) {
  return cleanText(name, { label: 'Name', max: LIMITS.personName, min: 1 });
}

function assertUniqueName(group, name, exceptId = null) {
  const lower = name.toLocaleLowerCase('de');
  if (group.people.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase('de') === lower)) {
    throw new ValidationError(`„${name}“ gibt es schon in dieser Gruppe.`);
  }
}

export function createGroup({ name, budget = null, people = [] }) {
  const group = {
    v: SCHEMA_VERSION,
    gid: uid(10),
    name: cleanText(name, { label: 'Gruppenname', max: LIMITS.groupName, min: 1 }),
    budget: parseBudget(budget),
    people: [],
    deleted: [],
  };
  for (const personName of people) addPerson(group, personName);
  return group;
}

export function findPerson(group, personId) {
  return group.people.find((p) => p.id === personId) ?? null;
}

export function findWish(group, wishId) {
  for (const person of group.people) {
    const wish = person.wishes.find((w) => w.id === wishId);
    if (wish) return { person, wish };
  }
  return null;
}

export function addPerson(group, name) {
  const clean = normalizeName(name);
  if (group.people.length >= LIMITS.people) {
    throw new ValidationError(`Eine Gruppe darf höchstens ${LIMITS.people} Personen enthalten.`);
  }
  assertUniqueName(group, clean);
  const person = { id: freshId(group), name: clean, wishes: [] };
  group.people.push(person);
  return person;
}

export function renamePerson(group, personId, name) {
  const person = findPerson(group, personId);
  if (!person) throw new ValidationError('Person nicht gefunden.');
  const clean = normalizeName(name);
  assertUniqueName(group, clean, personId);
  person.name = clean;
}

/** Removes a person with their wishes and their reservations on other lists. */
export function removePerson(group, personId) {
  const person = findPerson(group, personId);
  if (!person) return;
  group.deleted.push(person.id, ...person.wishes.map((w) => w.id));
  group.people = group.people.filter((p) => p.id !== personId);
  const t = now();
  for (const p of group.people) {
    for (const w of p.wishes) {
      if (w.reservedBy.includes(personId)) {
        w.reservedBy = w.reservedBy.filter((id) => id !== personId);
        w.ru = t;
      }
    }
  }
  trimTombstones(group);
}

function trimTombstones(group) {
  if (group.deleted.length > LIMITS.deleted) {
    group.deleted = group.deleted.slice(-LIMITS.deleted);
  }
}

/** Validates the fields of the wish form and returns a clean field object. */
export function cleanWishFields(fields) {
  const prio = Number(fields.prio);
  if (![1, 2, 3].includes(prio)) throw new ValidationError('Bitte wähle eine Priorität.');
  return {
    title: cleanText(fields.title, { label: 'Titel', max: LIMITS.title, min: 1 }),
    note: cleanText(fields.note, { label: 'Notiz', max: LIMITS.note, multiline: true }),
    price: parsePrice(fields.price),
    url: cleanUrl(fields.url),
    prio,
    shared: fields.shared === true,
  };
}

export function addWish(group, personId, fields) {
  const person = findPerson(group, personId);
  if (!person) throw new ValidationError('Person nicht gefunden.');
  if (person.wishes.length >= LIMITS.wishesPerPerson) {
    throw new ValidationError(`Pro Person sind höchstens ${LIMITS.wishesPerPerson} Wünsche erlaubt.`);
  }
  const t = now();
  const wish = { id: freshId(group), ...cleanWishFields(fields), reservedBy: [], u: t, ru: t };
  person.wishes.push(wish);
  return wish;
}

export function updateWish(group, wishId, fields) {
  const found = findWish(group, wishId);
  if (!found) throw new ValidationError('Wunsch nicht gefunden.');
  const { wish } = found;
  const clean = cleanWishFields(fields);
  Object.assign(wish, clean);
  if (!wish.shared && wish.reservedBy.length > 1) {
    wish.reservedBy = wish.reservedBy.slice(0, 1);
    wish.ru = now();
  }
  wish.u = now();
  return wish;
}

export function removeWish(group, wishId) {
  const found = findWish(group, wishId);
  if (!found) return;
  found.person.wishes = found.person.wishes.filter((w) => w.id !== wishId);
  group.deleted.push(wishId);
  trimTombstones(group);
}

/** "Ich schenke das": `giverId` reserves a wish on somebody else's list. */
export function reserve(group, wishId, giverId) {
  const found = findWish(group, wishId);
  if (!found) throw new ValidationError('Wunsch nicht gefunden.');
  if (!findPerson(group, giverId)) throw new ValidationError('Bitte wähle zuerst, wer du bist.');
  const { person, wish } = found;
  if (person.id === giverId) {
    throw new ValidationError('Auf der eigenen Liste kann man nichts reservieren.');
  }
  if (wish.reservedBy.includes(giverId)) return wish;
  if (!wish.shared && wish.reservedBy.length > 0) {
    throw new ValidationError('Dieser Wunsch ist schon reserviert.');
  }
  wish.reservedBy.push(giverId);
  wish.ru = now();
  return wish;
}

export function unreserve(group, wishId, giverId) {
  const found = findWish(group, wishId);
  if (!found) return;
  const { wish } = found;
  if (!wish.reservedBy.includes(giverId)) return;
  wish.reservedBy = wish.reservedBy.filter((id) => id !== giverId);
  wish.ru = now();
}

// Newer reservation state wins; on equal timestamps the side with more
// reservations wins, because a lost "Ich schenke das" is worse than a stale one.
function newerReservation(current, other) {
  if (other.ru !== current.ru) return other.ru > current.ru ? other : current;
  return other.reservedBy.length > current.reservedBy.length ? other : current;
}

/**
 * Merges two versions of the same group (same gid) without a server:
 * - people and wishes are united by id
 * - deletions win (tombstones in `deleted`)
 * - for a wish present on both sides the newer content (`u`) and the newer
 *   reservation state (`ru`) win; content ties keep the local version
 * The result is a new object; the inputs are not modified.
 */
export function mergeGroups(local, incoming) {
  if (local.gid !== incoming.gid) throw new ValidationError('Die Gruppen gehören nicht zusammen.');
  const deleted = new Set([...local.deleted, ...incoming.deleted]);
  const peopleById = new Map();

  for (const source of [local, incoming]) {
    for (const person of source.people) {
      if (deleted.has(person.id)) continue;
      let target = peopleById.get(person.id);
      if (!target) {
        target = { id: person.id, name: person.name, wishes: new Map() };
        peopleById.set(person.id, target);
      }
      for (const wish of person.wishes) {
        if (deleted.has(wish.id)) continue;
        const current = target.wishes.get(wish.id);
        if (!current) {
          target.wishes.set(wish.id, structuredClone(wish));
          continue;
        }
        const winnerContent = wish.u > current.u ? wish : current;
        const winnerReservation = newerReservation(current, wish);
        target.wishes.set(wish.id, {
          id: wish.id,
          title: winnerContent.title,
          note: winnerContent.note,
          price: winnerContent.price,
          url: winnerContent.url,
          prio: winnerContent.prio,
          shared: winnerContent.shared,
          reservedBy: [...winnerReservation.reservedBy],
          u: Math.max(wish.u, current.u),
          ru: Math.max(wish.ru, current.ru),
        });
      }
    }
  }

  const people = [...peopleById.values()].map((p) => ({ ...p, wishes: [...p.wishes.values()] }));
  const personIds = new Set(people.map((p) => p.id));
  // Drop reservations that point to removed people or to the wish owner.
  for (const person of people) {
    for (const wish of person.wishes) {
      wish.reservedBy = wish.reservedBy.filter((id) => personIds.has(id) && id !== person.id);
      if (!wish.shared) wish.reservedBy = wish.reservedBy.slice(0, 1);
    }
  }

  const merged = {
    v: SCHEMA_VERSION,
    gid: local.gid,
    name: local.name,
    budget: local.budget,
    people,
    deleted: [...deleted],
  };
  trimTombstones(merged);
  return merged;
}

/** Number of wishes with at least one reservation (only meaningful for other people's lists). */
export function countReserved(person) {
  return person.wishes.filter((w) => w.reservedBy.length > 0).length;
}

/** Wishes sorted by priority (high first), then by creation order. */
export function sortedWishes(person) {
  return person.wishes
    .map((wish, index) => ({ wish, index }))
    .sort((a, b) => b.wish.prio - a.wish.prio || a.index - b.index)
    .map((x) => x.wish);
}
