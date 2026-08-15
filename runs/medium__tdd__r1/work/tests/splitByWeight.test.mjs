import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitByWeight } from '../src/index.mjs';

test('splitByWeight splits equal weights with largest-remainder tie to lower index', () => {
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
});

test('splitByWeight splits exactly when weights divide evenly', () => {
  assert.deepEqual(splitByWeight(100, [2, 1, 1]), [50, 25, 25]);
});

test('splitByWeight assigns leftover to the index with the largest remainder', () => {
  assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
});

test('splitByWeight gives a zero weight nothing', () => {
  assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
});

test('splitByWeight negates the result computed on the absolute total', () => {
  assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
});

test('splitByWeight throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitByWeight(1.5, [1, 1]), TypeError);
});

test('splitByWeight throws TypeError when weights is not an array', () => {
  const arrayLike = { reduce: Array.prototype.reduce, map: Array.prototype.map, length: 2, 0: 1, 1: 1 };
  assert.throws(() => splitByWeight(100, arrayLike), TypeError);
});

test('splitByWeight throws TypeError when a weight is not an integer', () => {
  assert.throws(() => splitByWeight(100, [1, 1.5]), TypeError);
});

test('splitByWeight throws RangeError when weights is empty', () => {
  assert.throws(() => splitByWeight(100, []), RangeError);
});

test('splitByWeight throws RangeError when a weight is negative', () => {
  assert.throws(() => splitByWeight(100, [1, -1]), RangeError);
});

test('splitByWeight throws RangeError when weights sum to zero', () => {
  assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
});
