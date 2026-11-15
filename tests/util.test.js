import { test } from 'node:test';
import assert from 'node:assert/strict';
import { christmasInfo, randomInt, shuffle, slugify, uid } from '../js/util.js';

test('christmasInfo counts the days to Christmas Eve', () => {
  const info = christmasInfo(new Date(2026, 10, 15, 18, 0));
  assert.equal(info.state, 'countdown');
  assert.equal(info.days, 39);
  assert.equal(info.nikolausDays, 21);
});

test('christmasInfo handles the holidays and the following year', () => {
  assert.equal(christmasInfo(new Date(2026, 11, 24, 8)).state, 'eve');
  assert.equal(christmasInfo(new Date(2026, 11, 25)).state, 'holidays');
  assert.equal(christmasInfo(new Date(2026, 11, 26)).state, 'holidays');
  const after = christmasInfo(new Date(2026, 11, 27));
  assert.equal(after.state, 'countdown');
  assert.equal(after.days, 362);
  assert.equal(christmasInfo(new Date(2026, 11, 7)).nikolausDays, null);
});

test('randomInt stays in range and rejects bad input', () => {
  for (let i = 0; i < 500; i++) {
    const n = randomInt(7);
    assert.ok(n >= 0 && n < 7);
  }
  assert.throws(() => randomInt(0), RangeError);
  assert.throws(() => randomInt(1.5), RangeError);
});

test('shuffle keeps all elements and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

test('uid and slugify produce safe strings', () => {
  assert.match(uid(10), /^[a-z0-9]{10}$/);
  assert.equal(slugify('Familie Shariati 2026!'), 'familie-shariati-2026');
  assert.equal(slugify('Äpfel & Öl'), 'apfel-ol');
  assert.equal(slugify('???'), 'gruppe');
});
