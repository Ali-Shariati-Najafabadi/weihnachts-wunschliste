// Secret Santa draw: every participant gives to exactly one other person and
// receives from exactly one. Nobody draws themselves, exclusions are respected.

import { randomInt, shuffle } from './util.js';

export class DrawError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DrawError';
  }
}

const MAX_RANDOM_ATTEMPTS = 500;

/**
 * @param {{id: string, name: string}[]} participants
 * @param {[string, string][]} exclusions  pairs that must not draw each other (both directions)
 * @param {(n: number) => number} rng      returns an int in [0, n); injectable for tests
 * @returns {Map<string, string>} giver id -> receiver id
 */
export function drawSecretSanta(participants, exclusions = [], rng = randomInt) {
  const ids = participants.map((p) => p.id);
  const names = new Map(participants.map((p) => [p.id, p.name]));
  if (names.size !== ids.length) throw new DrawError('Jede Person darf nur einmal teilnehmen.');
  if (ids.length < 2) throw new DrawError('Zum Wichteln braucht es mindestens 2 Personen.');

  const forbidden = new Set();
  for (const [a, b] of exclusions) {
    if (!names.has(a) || !names.has(b)) throw new DrawError('Ein Ausschluss verweist auf eine unbekannte Person.');
    forbidden.add(`${a}|${b}`);
    forbidden.add(`${b}|${a}`);
  }
  const allowed = (giver, receiver) => giver !== receiver && !forbidden.has(`${giver}|${receiver}`);

  for (const id of ids) {
    if (!ids.some((other) => allowed(id, other))) {
      throw new DrawError(`${names.get(id)} hat durch die Ausschlüsse niemanden, den die Person beschenken könnte.`);
    }
    if (!ids.some((other) => allowed(other, id))) {
      throw new DrawError(`${names.get(id)} kann durch die Ausschlüsse von niemandem gezogen werden.`);
    }
  }

  // 1) Uniform random: shuffle and accept the first valid permutation.
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const receivers = shuffle(ids, rng);
    if (ids.every((giver, i) => allowed(giver, receivers[i]))) {
      return new Map(ids.map((giver, i) => [giver, receivers[i]]));
    }
  }

  // 2) Fallback for tight constraints: randomised bipartite matching (augmenting paths).
  //    It always finds a solution if one exists, and proves that none exists otherwise.
  const options = new Map(ids.map((giver) => [giver, shuffle(ids.filter((r) => allowed(giver, r)), rng)]));
  const receiverOwner = new Map();
  const tryAssign = (giver, visited) => {
    for (const receiver of options.get(giver)) {
      if (visited.has(receiver)) continue;
      visited.add(receiver);
      const current = receiverOwner.get(receiver);
      if (current === undefined || tryAssign(current, visited)) {
        receiverOwner.set(receiver, giver);
        return true;
      }
    }
    return false;
  };
  for (const giver of shuffle(ids, rng)) {
    if (!tryAssign(giver, new Set())) {
      throw new DrawError('Mit diesen Ausschlüssen gibt es keine gültige Ziehung. Entferne einen Ausschluss oder nimm mehr Personen dazu.');
    }
  }
  return new Map([...receiverOwner].map(([receiver, giver]) => [giver, receiver]));
}
