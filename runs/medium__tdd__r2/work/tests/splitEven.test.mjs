import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEven } from '../src/index.mjs';

test('splitEven distributes remainder to first elements', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
});

test('splitEven handles negative totals', () => {
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
});

test('splitEven handles zero total', () => {
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('splitEven throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitEven(1.5, 3), TypeError);
});

test('splitEven throws TypeError when parts is not an integer', () => {
  assert.throws(() => splitEven(100, 2.5), TypeError);
});

test('splitEven throws RangeError when parts < 1', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
});

test('splitEven checks totalCents integer before parts validity', () => {
  assert.throws(() => splitEven(1.5, 0), TypeError);
});
