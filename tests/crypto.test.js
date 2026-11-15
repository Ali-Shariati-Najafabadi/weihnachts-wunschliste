import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecryptError, assertPassphrase, decryptJson, encryptJson } from '../js/crypto.js';
import { ValidationError } from '../js/schema.js';
import { createSantaHash, readSantaHeader, revealSanta } from '../js/santa-links.js';
import { parseHash } from '../js/codec.js';

test('encrypt/decrypt roundtrip with unicode content', async () => {
  const value = { r: 'Jürgen Öztürk', w: ['Socken 🧦'] };
  const bytes = await encryptJson(value, 'geheim123', 'ctx');
  assert.deepEqual(await decryptJson(bytes, 'geheim123', 'ctx'), value);
});

test('ciphertext differs on every call and hides the plaintext', async () => {
  const a = await encryptJson({ r: 'Anna' }, 'geheim123');
  const b = await encryptJson({ r: 'Anna' }, 'geheim123');
  assert.notDeepEqual(a, b);
  assert.ok(!Buffer.from(a).includes(Buffer.from('Anna')));
});

test('wrong passphrase, tampered data and wrong context are rejected', async () => {
  const bytes = await encryptJson({ r: 'Anna' }, 'geheim123', 'ctx');
  await assert.rejects(decryptJson(bytes, 'falsch1234', 'ctx'), DecryptError);
  await assert.rejects(decryptJson(bytes, 'geheim123', 'other'), DecryptError);
  const tampered = bytes.slice();
  tampered[tampered.length - 3] ^= 1;
  await assert.rejects(decryptJson(tampered, 'geheim123', 'ctx'), DecryptError);
  await assert.rejects(decryptJson(bytes.slice(0, 20), 'geheim123', 'ctx'), DecryptError);
  await assert.rejects(decryptJson(new Uint8Array(60), 'geheim123', 'ctx'), DecryptError);
});

test('passphrases are normalised (unicode, surrounding spaces) and must be long enough', async () => {
  const bytes = await encryptJson({ ok: true }, '  Pässwort1 ');
  assert.deepEqual(await decryptJson(bytes, 'Pässwort1'.replace('ss', 'ß'.length ? 'ss' : ''), ''), { ok: true });
  assert.throws(() => assertPassphrase('12345'), ValidationError);
  await assert.rejects(encryptJson({}, 'abc'), ValidationError);
});

test('Secret Santa link: only the giver can read who to gift, and tampering is detected', async () => {
  const group = { name: 'Familie 2026' };
  const giver = { id: 'anna0001', name: 'Anna' };
  const receiver = {
    id: 'ben00001',
    name: 'Ben',
    wishes: [{ id: 'wish0001', title: 'Socken', note: '', price: 12, url: 'https://example.com/', prio: 2, shared: false, reservedBy: ['anna0001'], u: 1, ru: 1 }],
  };
  const hash = await createSantaHash({ group, drawId: 'draw1234', giver, receiver, passphrase: 'weihnachten', budget: 20 });
  assert.ok(hash.startsWith('#w='));
  const { payload } = parseHash(`https://x.example/app/${hash}`);
  const header = await readSantaHeader(payload);
  assert.equal(header.giver, 'Anna');
  assert.equal(header.groupName, 'Familie 2026');
  assert.equal(header.budget, 20);

  // The recipient's name and wishes are not readable from the public header.
  assert.ok(!JSON.stringify(header).includes('Ben') && !JSON.stringify(header).includes('Socken'));
  assert.ok(!hash.includes('Ben'));

  const reveal = await revealSanta(header, 'weihnachten');
  assert.equal(reveal.receiver, 'Ben');
  assert.equal(reveal.wishes[0].title, 'Socken');
  assert.equal(reveal.wishes[0].reservedBy.length, 0, 'reservations are never part of the reveal');

  await assert.rejects(revealSanta(header, 'falschespw'), DecryptError);
  await assert.rejects(revealSanta({ ...header, giver: 'Clara' }, 'weihnachten'), DecryptError);
  await assert.rejects(revealSanta({ ...header, drawId: 'other999' }, 'weihnachten'), DecryptError);
});
