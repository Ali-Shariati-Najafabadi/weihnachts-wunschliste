import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrawError, drawSecretSanta } from '../js/secretsanta.js';

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Person ${i}` }));

function assertValid(result, participants, exclusions = []) {
  const ids = participants.map((p) => p.id);
  assert.equal(result.size, ids.length);
  assert.deepEqual([...result.keys()].sort(), [...ids].sort(), 'every person gives once');
  assert.deepEqual([...result.values()].sort(), [...ids].sort(), 'every person receives once');
  for (const [giver, receiver] of result) {
    assert.notEqual(giver, receiver, 'nobody draws themselves');
    for (const [a, b] of exclusions) {
      assert.ok(!(giver === a && receiver === b) && !(giver === b && receiver === a), 'exclusion violated');
    }
  }
}

test('draws are valid derangements for many group sizes', () => {
  for (const n of [2, 3, 4, 5, 8, 13, 30]) {
    const p = people(n);
    for (let i = 0; i < 100; i++) assertValid(drawSecretSanta(p), p);
  }
});

test('couples never draw each other', () => {
  const p = people(6);
  const exclusions = [['p0', 'p1'], ['p2', 'p3'], ['p4', 'p5']];
  for (let i = 0; i < 300; i++) assertValid(drawSecretSanta(p, exclusions), p, exclusions);
});

test('different draws happen (not a fixed result)', () => {
  const p = people(8);
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(JSON.stringify([...drawSecretSanta(p)]));
  assert.ok(seen.size > 10);
});

test('tight constraints use the matching fallback and still succeed', () => {
  // Exclusions leave only the two ring neighbours of each person, so random permutations
  // almost never succeed and the matching fallback has to find a solution.
  const p = people(12);
  const exclusions = [];
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      if (j !== i + 1 && !(i === 0 && j === p.length - 1)) exclusions.push([p[i].id, p[j].id]);
    }
  }
  const result = drawSecretSanta(p, exclusions);
  assertValid(result, p, exclusions);
  for (const [giver, receiver] of result) {
    const gi = Number(giver.slice(1));
    const ri = Number(receiver.slice(1));
    assert.ok(ri === (gi + 1) % 12 || gi === (ri + 1) % 12, 'only ring neighbours allowed');
  }
});

test('impossible draws report a clear error', () => {
  const p = people(3);
  assert.throws(() => drawSecretSanta(p, [['p0', 'p1'], ['p0', 'p2']]), DrawError);
  assert.throws(() => drawSecretSanta(people(2), [['p0', 'p1']]), DrawError);
  assert.throws(() => drawSecretSanta(people(1)), /mindestens 2/);
  assert.throws(() => drawSecretSanta([{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }]), DrawError);
  assert.throws(() => drawSecretSanta(p, [['p0', 'nobody']]), DrawError);
  // Everybody still has options, but no complete assignment exists (pigeonhole).
  const q = people(5);
  const ex = [];
  for (const a of ['p0', 'p1', 'p2']) for (const b of ['p0', 'p1', 'p2']) if (a < b) ex.push([a, b]);
  assert.throws(() => drawSecretSanta(q, [...ex, ['p0', 'p3'], ['p1', 'p3'], ['p2', 'p3'], ['p0', 'p4'], ['p1', 'p4']]), DrawError);
});

test('a deterministic rng makes draws reproducible', () => {
  const p = people(6);
  const mk = () => { let s = 7; return (n) => (s = (s * 48271) % 2147483647) % n; };
  assert.deepEqual([...drawSecretSanta(p, [], mk())], [...drawSecretSanta(p, [], mk())]);
});
