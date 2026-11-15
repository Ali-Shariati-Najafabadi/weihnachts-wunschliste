import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QR_MAX_BYTES, qrCapacity, qrMatrix } from '../js/qr.js';

// Reference symbol for "https://example.com/#g=abc" (level M, version 2);
// verified by decoding it with an independent QR reader.
const SNAPSHOT = [
  '#######....#.#..#.#######',
  '#.....#...##.####.#.....#',
  '#.###.#.##..#.#...#.###.#',
  '#.###.#.##.#####..#.###.#',
  '#.###.#.#.####..#.#.###.#',
  '#.....#.###.#.##..#.....#',
  '#######.#.#.#.#.#.#######',
  '........##..#.#.#........',
  '#.#####.....##....#####..',
  '###.#..#..##.#...#.#...#.',
  '.#.#####.########..#.#.##',
  '....#..#.##.#.###.##....#',
  '##.#.##....###.#.##.#.###',
  '#.#..#....#.#...#..#.#.#.',
  '#.######..#..#.#..####.##',
  '#.##...######.#######...#',
  '#...#.#..#..###.#####.#..',
  '........####...##...##...',
  '#######..#..###.#.#.#.###',
  '#.....#.#..##.#.#...##...',
  '#.###.#.#.#.##.######.#..',
  '#.###.#.##.#.###.##.#####',
  '#.###.#.#.....##.....##.#',
  '#.....#..##.#.#.##.###..#',
  '#######.##..###..########',
];

test('qrMatrix reproduces the verified reference symbol', () => {
  const m = qrMatrix('https://example.com/#g=abc', 'M');
  assert.equal(m.version, 2);
  assert.deepEqual(m.modules.map((row) => row.map((b) => (b ? '#' : '.')).join('')), SNAPSHOT);
});

test('finder patterns and timing patterns are in place', () => {
  const { modules, size } = qrMatrix('hello', 'M');
  const finder = (x0, y0) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
        assert.equal(modules[y0 + j][x0 + i], ring !== 2, `finder at ${x0},${y0} (${i},${j})`);
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  for (let i = 8; i < size - 8; i++) assert.equal(modules[6][i], i % 2 === 0);
});

test('version grows with the data and every version holds its capacity', () => {
  let last = 0;
  for (const level of ['L', 'M']) {
    last = 0;
    for (let v = 1; v <= 40; v++) {
      const cap = qrCapacity(v, level);
      assert.ok(cap > last, `capacity must grow (v${v} ${level})`);
      last = cap;
      assert.equal(qrMatrix('a'.repeat(cap), level).version, v);
    }
  }
  assert.equal(qrCapacity(40, 'L'), QR_MAX_BYTES);
});

test('auto level falls back from M to L and refuses oversized data', () => {
  assert.equal(qrMatrix('a'.repeat(qrCapacity(40, 'M'))).ecl, 'M');
  assert.equal(qrMatrix('a'.repeat(qrCapacity(40, 'M') + 1)).ecl, 'L');
  assert.throws(() => qrMatrix('a'.repeat(QR_MAX_BYTES + 1)), RangeError);
  assert.throws(() => qrMatrix('x', 'Q'), RangeError);
});

test('output is deterministic and handles UTF-8', () => {
  assert.deepEqual(qrMatrix('Weihnachten 🎄').modules, qrMatrix('Weihnachten 🎄').modules);
});
