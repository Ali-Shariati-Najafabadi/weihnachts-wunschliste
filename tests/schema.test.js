import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  cleanText,
  cleanUrl,
  parseBudget,
  parseGroup,
  parsePrice,
  parseSantaLink,
  parseSantaReveal,
  safeHref,
} from '../js/schema.js';

const validGroup = () => ({
  v: 1,
  gid: 'grp12345',
  name: 'Familie 2026',
  budget: 30,
  people: [
    {
      id: 'anna0001',
      name: 'Anna',
      wishes: [
        {
          id: 'wish0001',
          title: 'Buch',
          note: 'Gern gebunden',
          price: 19.9,
          url: 'https://example.com/buch',
          prio: 3,
          shared: false,
          reservedBy: ['ben00001'],
          u: 5,
          ru: 6,
        },
      ],
    },
    { id: 'ben00001', name: 'Ben', wishes: [] },
  ],
  deleted: ['gone0001'],
});

test('cleanUrl only allows http and https', () => {
  assert.equal(cleanUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(cleanUrl('example.com/shop'), 'https://example.com/shop');
  assert.equal(cleanUrl(''), '');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'file:///etc/passwd']) {
    assert.throws(() => cleanUrl(bad), ValidationError, bad);
  }
  assert.throws(() => cleanUrl('https://user:pw@example.com'), ValidationError);
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('http://example.com'), 'http://example.com/');
});

test('parsePrice understands German and English notation', () => {
  assert.equal(parsePrice('25'), 25);
  assert.equal(parsePrice('24,90'), 24.9);
  assert.equal(parsePrice('1.234,50 €'), 1234.5);
  assert.equal(parsePrice('1.234'), 1234);
  assert.equal(parsePrice('25.5'), 25.5);
  assert.equal(parsePrice(''), null);
  assert.throws(() => parsePrice('abc'), ValidationError);
  assert.throws(() => parsePrice('-5'), ValidationError);
  assert.throws(() => parsePrice('1,234'), ValidationError);
  assert.throws(() => parsePrice('999999'), ValidationError);
  assert.equal(parseBudget('30'), 30);
  assert.throws(() => parseBudget('20000'), ValidationError);
});

test('cleanText strips control characters and enforces limits', () => {
  assert.equal(cleanText('  a\u0000b\n c  ', { label: 'x', max: 20 }), 'a b c');
  assert.equal(cleanText('a‮b', { label: 'x', max: 20 }), 'ab');
  assert.equal(cleanText('a\r\nb', { label: 'x', max: 20, multiline: true }), 'a\nb');
  assert.throws(() => cleanText('', { label: 'x', max: 5, min: 1 }), ValidationError);
  assert.throws(() => cleanText('abcdef', { label: 'x', max: 5 }), ValidationError);
  assert.throws(() => cleanText(42, { label: 'x', max: 5 }), ValidationError);
});

test('parseGroup accepts a valid group and returns a clean copy', () => {
  const input = validGroup();
  input.people[0].wishes[0].evil = '<script>';
  const group = parseGroup(input);
  assert.equal(group.name, 'Familie 2026');
  assert.equal(group.people[0].wishes[0].evil, undefined);
  assert.deepEqual(group.people[0].wishes[0].reservedBy, ['ben00001']);
});

test('parseGroup rejects broken or hostile data', () => {
  const cases = {
    'not an object': 'hello',
    'wrong version': { ...validGroup(), v: 2 },
    'bad group id': { ...validGroup(), gid: '../etc' },
    'proto id': { ...validGroup(), gid: '__proto__' },
    'empty name': { ...validGroup(), name: '  ' },
    'people not array': { ...validGroup(), people: {} },
  };
  for (const [label, data] of Object.entries(cases)) {
    assert.throws(() => parseGroup(data), ValidationError, label);
  }

  const dupPerson = validGroup();
  dupPerson.people[1].id = 'anna0001';
  assert.throws(() => parseGroup(dupPerson), ValidationError);

  const dupWish = validGroup();
  dupWish.people[1].wishes.push({ ...dupWish.people[0].wishes[0], reservedBy: [] });
  assert.throws(() => parseGroup(dupWish), ValidationError);

  const jsUrl = validGroup();
  jsUrl.people[0].wishes[0].url = 'javascript:alert(1)';
  assert.throws(() => parseGroup(jsUrl), ValidationError);

  const selfReserved = validGroup();
  selfReserved.people[0].wishes[0].reservedBy = ['anna0001'];
  assert.throws(() => parseGroup(selfReserved), ValidationError);

  const unknownReserver = validGroup();
  unknownReserver.people[0].wishes[0].reservedBy = ['nobody01'];
  assert.throws(() => parseGroup(unknownReserver), ValidationError);

  const twoOnSingle = validGroup();
  twoOnSingle.people.push({ id: 'cara0001', name: 'Cara', wishes: [] });
  twoOnSingle.people[0].wishes[0].reservedBy = ['ben00001', 'cara0001'];
  assert.throws(() => parseGroup(twoOnSingle), ValidationError);
  twoOnSingle.people[0].wishes[0].shared = true;
  assert.equal(parseGroup(twoOnSingle).people[0].wishes[0].reservedBy.length, 2);

  const tooMany = validGroup();
  tooMany.people[0].wishes = Array.from({ length: 61 }, (_, i) => ({
    ...validGroup().people[0].wishes[0],
    id: `w${String(i).padStart(6, '0')}`,
    reservedBy: [],
  }));
  assert.throws(() => parseGroup(tooMany), ValidationError);
});

test('parseSantaLink and parseSantaReveal validate their input', () => {
  const link = { v: 1, k: 'santa', n: 'Familie', b: 20, g: 'Anna', d: 'draw1234', e: 'AbC-_123' };
  assert.equal(parseSantaLink(link).giver, 'Anna');
  assert.throws(() => parseSantaLink({ ...link, e: 'not base64!' }), ValidationError);
  assert.throws(() => parseSantaLink({ ...link, k: 'group' }), ValidationError);
  assert.throws(() => parseSantaLink({ ...link, d: 'X' }), ValidationError);

  const reveal = { r: 'Ben', w: [{ id: 'wish0001', title: 'Socken', prio: 1 }] };
  assert.equal(parseSantaReveal(reveal).wishes[0].title, 'Socken');
  assert.throws(() => parseSantaReveal({ r: 'Ben', w: 'x' }), ValidationError);
  assert.throws(() => parseSantaReveal({ r: '', w: [] }), ValidationError);
});
