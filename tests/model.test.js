import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPerson,
  addWish,
  countReserved,
  createGroup,
  findWish,
  mergeGroups,
  removePerson,
  removeWish,
  renamePerson,
  reserve,
  sortedWishes,
  unreserve,
  updateWish,
} from '../js/model.js';
import { ValidationError, parseGroup } from '../js/schema.js';

const fields = (over = {}) => ({ title: 'Buch', note: '', price: '', url: '', prio: 2, shared: false, ...over });

function setup() {
  const group = createGroup({ name: 'Test', people: ['Anna', 'Ben', 'Cara'] });
  const [anna, ben, cara] = group.people;
  return { group, anna, ben, cara };
}

test('createGroup validates names and rejects duplicates', () => {
  assert.throws(() => createGroup({ name: '' }), ValidationError);
  assert.throws(() => createGroup({ name: 'x', people: ['Anna', 'anna'] }), ValidationError);
  const { group } = setup();
  assert.throws(() => addPerson(group, 'ANNA'), ValidationError);
  assert.equal(group.people.length, 3);
});

test('wishes can be added, edited, sorted and removed', () => {
  const { group, anna } = setup();
  const a = addWish(group, anna.id, fields({ title: 'A', prio: 1 }));
  const b = addWish(group, anna.id, fields({ title: 'B', prio: 3, price: '19,90' }));
  assert.equal(b.price, 19.9);
  assert.deepEqual(sortedWishes(anna).map((w) => w.title), ['B', 'A']);
  updateWish(group, a.id, fields({ title: 'A2', prio: 3, url: 'example.com' }));
  assert.equal(findWish(group, a.id).wish.url, 'https://example.com/');
  assert.throws(() => updateWish(group, a.id, fields({ title: '' })), ValidationError);
  assert.throws(() => addWish(group, anna.id, fields({ url: 'javascript:alert(1)' })), ValidationError);
  removeWish(group, a.id);
  assert.equal(anna.wishes.length, 1);
  assert.ok(group.deleted.includes(a.id));
  parseGroup(group); // stays valid
});

test('reservations: not on own list, only one person for normal wishes', () => {
  const { group, anna, ben, cara } = setup();
  const w = addWish(group, anna.id, fields());
  assert.throws(() => reserve(group, w.id, anna.id), ValidationError);
  reserve(group, w.id, ben.id);
  assert.throws(() => reserve(group, w.id, cara.id), ValidationError);
  assert.equal(countReserved(anna), 1);
  unreserve(group, w.id, cara.id); // not the reserver: no effect
  assert.deepEqual(w.reservedBy, [ben.id]);
  unreserve(group, w.id, ben.id);
  assert.deepEqual(w.reservedBy, []);
});

test('shared wishes accept several people', () => {
  const { group, anna, ben, cara } = setup();
  const w = addWish(group, anna.id, fields({ shared: true, price: '150' }));
  reserve(group, w.id, ben.id);
  reserve(group, w.id, cara.id);
  reserve(group, w.id, cara.id);
  assert.deepEqual(w.reservedBy, [ben.id, cara.id]);
  updateWish(group, w.id, fields({ shared: false }));
  assert.deepEqual(w.reservedBy, [ben.id]);
});

test('removing a person cleans up reservations and records tombstones', () => {
  const { group, anna, ben } = setup();
  const w = addWish(group, anna.id, fields());
  reserve(group, w.id, ben.id);
  removePerson(group, ben.id);
  assert.deepEqual(w.reservedBy, []);
  removePerson(group, anna.id);
  assert.ok(group.deleted.includes(anna.id) && group.deleted.includes(w.id));
  assert.equal(group.people.length, 1);
  parseGroup(group);
  renamePerson(group, group.people[0].id, 'Carla');
  assert.equal(group.people[0].name, 'Carla');
});

test('mergeGroups unites changes made on two devices', () => {
  const { group, anna, ben, cara } = setup();
  const w1 = addWish(group, anna.id, fields({ title: 'Eins' }));
  const w2 = addWish(group, anna.id, fields({ title: 'Zwei' }));
  const w3 = addWish(group, ben.id, fields({ title: 'Drei' }));
  const a = structuredClone(group);
  const b = structuredClone(group);

  // Device A: Ben reserves Annas wish "Eins"; Cara adds a new wish.
  reserve(a, w1.id, ben.id);
  addWish(a, cara.id, fields({ title: 'Neu von A' }));
  // Device B: Cara reserves "Drei", Anna's "Zwei" is deleted, a person is added.
  reserve(b, w3.id, cara.id);
  removeWish(b, w2.id);
  addPerson(b, 'Dora');

  const merged = mergeGroups(a, b);
  parseGroup(merged);
  const titles = merged.people.flatMap((p) => p.wishes.map((w) => w.title)).sort();
  assert.deepEqual(titles, ['Drei', 'Eins', 'Neu von A']);
  assert.deepEqual(findWish(merged, w1.id).wish.reservedBy, [ben.id]);
  assert.deepEqual(findWish(merged, w3.id).wish.reservedBy, [cara.id]);
  assert.equal(merged.people.some((p) => p.name === 'Dora'), true);
  assert.equal(findWish(merged, w2.id), null);
  // inputs untouched
  assert.equal(findWish(a, w2.id) !== null, true);
});

test('mergeGroups: newer edit wins, newer reservation wins, other groups are refused', () => {
  const { group, anna, ben } = setup();
  const w = addWish(group, anna.id, fields({ title: 'Alt' }));
  const a = structuredClone(group);
  const b = structuredClone(group);
  findWish(b, w.id).wish.title = 'Neu';
  findWish(b, w.id).wish.u += 10;
  reserve(a, w.id, ben.id);
  findWish(a, w.id).wish.ru += 20;
  const merged = findWish(mergeGroups(a, b), w.id).wish;
  assert.equal(merged.title, 'Neu');
  assert.deepEqual(merged.reservedBy, [ben.id]);
  assert.throws(() => mergeGroups(a, { ...b, gid: 'other12345' }), ValidationError);
});
