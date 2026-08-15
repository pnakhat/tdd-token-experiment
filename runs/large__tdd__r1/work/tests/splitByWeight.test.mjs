import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitByWeight } from '../src/index.mjs';

test('splitByWeight splits by equal weights same as splitEven', () => {
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
});

test('splitByWeight apportions by unequal weights', () => {
  assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
});

test('splitByWeight handles negative totals', () => {
  assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
});

test('splitByWeight handles a zero weight', () => {
  assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
});

test('splitByWeight throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitByWeight(1.5, [1, 2]), TypeError);
});

test('splitByWeight throws TypeError when weights is not an array', () => {
  assert.throws(() => splitByWeight(10, 'nope'), TypeError);
});
