// Personal Secret Santa links. The link header (group, budget, giver name,
// draw id) is public; who the giver has to gift, plus that person's wishes,
// is encrypted with a passphrase only the giver knows.

import { buildHash, decodePayload, fromBase64Url, toBase64Url } from './codec.js';
import { SCHEMA_VERSION, parseSantaLink, parseSantaReveal } from './schema.js';
import { decryptJson, encryptJson } from './crypto.js';
import { uid } from './util.js';

export const newDrawId = () => uid(8);

const aadFor = (drawId, giverName) => `wwl-santa|${drawId}|${giverName}`;

const publicWish = (w) => ({
  id: w.id, title: w.title, note: w.note, price: w.price, url: w.url, prio: w.prio, shared: w.shared,
});

/**
 * Builds "#w=..." for one giver.
 * @param {{ group: object, drawId: string, giver: object, receiver: object, passphrase: string }} args
 */
export async function createSantaHash({ group, drawId, giver, receiver, passphrase, budget = null }) {
  const reveal = { r: receiver.name, w: receiver.wishes.map(publicWish) };
  const cipher = await encryptJson(reveal, passphrase, aadFor(drawId, giver.name));
  return buildHash('santa', {
    v: SCHEMA_VERSION, k: 'santa', n: group.name, b: budget, g: giver.name, d: drawId, e: toBase64Url(cipher),
  });
}

/** Reads the public header from a decoded "#w=" payload. */
export async function readSantaHeader(payload) {
  return parseSantaLink(await decodePayload(payload));
}

/** Decrypts a validated header with the giver's passphrase. */
export async function revealSanta(header, passphrase) {
  const data = await decryptJson(fromBase64Url(header.cipher), passphrase, aadFor(header.drawId, header.giver));
  return parseSantaReveal(data);
}
