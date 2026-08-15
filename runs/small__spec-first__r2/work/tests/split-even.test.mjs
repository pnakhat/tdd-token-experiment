import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEven } from '../src/index.mjs';

test('worked example: 100 / 3', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
});

test('worked example: 10 / 1', () => {
  assert.deepEqual(splitEven(10, 1), [10]);
});

test('worked example: 0 / 4', () => {
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('worked example: -100 / 3', () => {
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
});

test('worked example: 7 / 7', () => {
  assert.deepEqual(splitEven(7, 7), [1, 1, 1, 1, 1, 1, 1]);
});

test('worked example: 5 / 10', () => {
  assert.deepEqual(splitEven(5, 10), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
});

test('returns an Array of exactly `parts` integers', () => {
  const result = splitEven(50, 6);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 6);
  for (const n of result) {
    assert.ok(Number.isInteger(n));
  }
});

test('sums exactly to totalCents for various inputs', () => {
  const cases = [
    [100, 3],
    [0, 4],
    [-100, 3],
    [7, 7],
    [5, 10],
    [-5, 10],
    [1, 1000],
    [999999, 13],
    [-999999, 13],
  ];
  for (const [totalCents, parts] of cases) {
    const result = splitEven(totalCents, parts);
    const sum = result.reduce((a, b) => a + b, 0);
    assert.equal(sum, totalCents, `sum mismatch for splitEven(${totalCents}, ${parts})`);
  }
});

test('negative total splits correctly with remainder distributed', () => {
  assert.deepEqual(splitEven(-7, 7), [-1, -1, -1, -1, -1, -1, -1]);
  assert.deepEqual(splitEven(-5, 10), [0, 0, 0, 0, 0, -1, -1, -1, -1, -1]);
});

test('throws TypeError for non-integer totalCents (NaN)', () => {
  assert.throws(() => splitEven(NaN, 3), (err) => {
    assert.ok(err instanceof TypeError);
    assert.equal(typeof err.message, 'string');
    assert.ok(err.message.length > 0);
    return true;
  });
});

test('throws TypeError for non-integer totalCents (Infinity)', () => {
  assert.throws(() => splitEven(Infinity, 3), TypeError);
  assert.throws(() => splitEven(-Infinity, 3), TypeError);
});

test('throws TypeError for non-integer totalCents (float)', () => {
  assert.throws(() => splitEven(100.5, 3), TypeError);
});

test('throws TypeError for non-integer totalCents (non-number)', () => {
  assert.throws(() => splitEven(undefined, 3), TypeError);
  assert.throws(() => splitEven(null, 3), TypeError);
  assert.throws(() => splitEven({}, 3), TypeError);
  assert.throws(() => splitEven([], 3), TypeError);
});

test('throws TypeError for numeric string totalCents', () => {
  assert.throws(() => splitEven('100', 3), TypeError);
});

test('throws TypeError for non-integer parts', () => {
  assert.throws(() => splitEven(100, 3.5), TypeError);
  assert.throws(() => splitEven(100, NaN), TypeError);
  assert.throws(() => splitEven(100, '3'), TypeError);
  assert.throws(() => splitEven(100, undefined), TypeError);
});

test('throws RangeError for parts < 1', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
  assert.throws(() => splitEven(100, -3), RangeError);
});

test('checks totalCents before parts', () => {
  assert.throws(() => splitEven(1.5, 0), TypeError);
});

test('checks parts integer before parts range', () => {
  assert.throws(() => splitEven(100, -1.5), TypeError);
});

test('error messages are non-empty strings', () => {
  try {
    splitEven(1.5, 3);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(typeof err.message, 'string');
    assert.ok(err.message.length > 0);
  }

  try {
    splitEven(100, 1.5);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(typeof err.message, 'string');
    assert.ok(err.message.length > 0);
  }

  try {
    splitEven(100, 0);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(typeof err.message, 'string');
    assert.ok(err.message.length > 0);
  }
});
