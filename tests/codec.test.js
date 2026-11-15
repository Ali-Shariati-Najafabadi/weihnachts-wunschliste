import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, decodePayload, encodePayload, fromBase64Url, parseHash, toBase64Url } from '../js/codec.js';
import { ValidationError, parseGroup } from '../js/schema.js';
import { addWish, createGroup } from '../js/model.js';

test('base64url roundtrip for all byte values', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const text = toBase64Url(bytes);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(fromBase64Url(text), bytes);
  assert.throws(() => fromBase64Url('ab+/'), ValidationError);
  assert.throws(() => fromBase64Url('a'), ValidationError);
});

test('encodePayload / decodePayload roundtrip with unicode', async () => {
  const value = { name: 'Weihnachten 🎄 Müller–Öztürk', list: [1, 2, 3], nested: { ß: 'straße' } };
  const text = await encodePayload(value);
  assert.match(text, /^[zr][A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodePayload(text), value);
});

test('a realistic group survives the hash and gets smaller than plain JSON', async () => {
  const group = createGroup({ name: 'Familie 2026', budget: 30, people: ['Anna', 'Ben', 'Clara', 'David'] });
  for (const person of group.people) {
    for (let i = 0; i < 8; i++) {
      addWish(group, person.id, {
        title: `Wunsch ${i} für ${person.name}`,
        note: 'Gern in Blau, Größe M',
        price: 19.99 + i,
        url: `https://www.example.com/produkt/${i}`,
        prio: (i % 3) + 1,
        shared: false,
      });
    }
  }
  const hash = await buildHash('group', group);
  assert.ok(hash.startsWith('#g='));
  assert.ok(hash.length < JSON.stringify(group).length, 'compressed hash should be shorter');
  const parsed = parseHash(`https://example.com/app/${hash}`);
  assert.equal(parsed.kind, 'group');
  const decoded = parseGroup(await decodePayload(parsed.payload));
  assert.deepEqual(decoded, group);
});

test('parseHash recognises kinds and rejects junk', () => {
  assert.deepEqual(parseHash('#g=zAbc'), { kind: 'group', payload: 'zAbc' });
  assert.deepEqual(parseHash('#w=rAbc'), { kind: 'santa', payload: 'rAbc' });
  assert.equal(parseHash('#x=abc'), null);
  assert.equal(parseHash('#g='), null);
  assert.equal(parseHash('#g=<script>'), null);
  assert.equal(parseHash(''), null);
  assert.equal(parseHash(undefined), null);
});

test('decodePayload rejects garbage, wrong markers and truncated data', async () => {
  await assert.rejects(decodePayload(''), ValidationError);
  await assert.rejects(decodePayload('x1234'), ValidationError);
  await assert.rejects(decodePayload('z!!!!'), ValidationError);
  await assert.rejects(decodePayload('zAAAA'), ValidationError);
  await assert.rejects(decodePayload('rAAAA'), ValidationError);
  const good = await encodePayload({ a: 'hello world, hello world, hello world' });
  await assert.rejects(decodePayload(good.slice(0, good.length - 6)), ValidationError);
  await assert.rejects(decodePayload('r' + toBase64Url(new TextEncoder().encode('not json'))), ValidationError);
});

test('decodePayload refuses decompression bombs', async () => {
  const bomb = await encodePayload({ filler: 'a'.repeat(3_000_000) });
  assert.ok(bomb.length < 10_000, 'the bomb itself is small');
  await assert.rejects(decodePayload(bomb), ValidationError);
});
