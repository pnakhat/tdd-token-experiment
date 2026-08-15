import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEven } from '../src/index.mjs';

test('splits evenly divisible amounts', () => {
  assert.deepEqual(splitEven(10, 1), [10]);
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('worked example: 100 / 3', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
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

test('result always sums exactly to totalCents', () => {
  const cases = [
    [100, 3],
    [-100, 3],
    [7, 7],
    [5, 10],
    [1, 3],
    [-1, 3],
    [999999, 13],
    [-999999, 13],
  ];
  for (const [totalCents, parts] of cases) {
    const result = splitEven(totalCents, parts);
    const sum = result.reduce((a, b) => a + b, 0);
    assert.equal(sum, totalCents, `sum mismatch for ${totalCents}/${parts}`);
    assert.equal(result.length, parts);
  }
});

test('every element is an integer', () => {
  const result = splitEven(100, 3);
  for (const n of result) {
    assert.equal(Number.isInteger(n), true);
  }
});

test('negative parts values differ by at most 1', () => {
  const result = splitEven(-100, 3);
  const min = Math.min(...result);
  const max = Math.max(...result);
  assert.equal(max - min <= 1, true);
});

test('throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitEven(1.5, 3), TypeError);
  assert.throws(() => splitEven(NaN, 3), TypeError);
  assert.throws(() => splitEven(Infinity, 3), TypeError);
  assert.throws(() => splitEven('100', 3), TypeError);
  assert.throws(() => splitEven(undefined, 3), TypeError);
  assert.throws(() => splitEven(null, 3), TypeError);
});

test('totalCents TypeError has non-empty message', () => {
  try {
    splitEven(1.5, 3);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err instanceof TypeError, true);
    assert.equal(typeof err.message, 'string');
    assert.equal(err.message.length > 0, true);
  }
});

test('throws TypeError when parts is not an integer', () => {
  assert.throws(() => splitEven(100, 1.5), TypeError);
  assert.throws(() => splitEven(100, NaN), TypeError);
  assert.throws(() => splitEven(100, '3'), TypeError);
  assert.throws(() => splitEven(100, undefined), TypeError);
});

test('parts TypeError has non-empty message', () => {
  try {
    splitEven(100, 1.5);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err instanceof TypeError, true);
    assert.equal(typeof err.message, 'string');
    assert.equal(err.message.length > 0, true);
  }
});

test('throws RangeError when parts < 1', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
  assert.throws(() => splitEven(100, -1), RangeError);
});

test('RangeError has non-empty message', () => {
  try {
    splitEven(100, 0);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err instanceof RangeError, true);
    assert.equal(typeof err.message, 'string');
    assert.equal(err.message.length > 0, true);
  }
});

test('checks totalCents before parts', () => {
  assert.throws(() => splitEven(1.5, 0), TypeError);
  assert.throws(() => splitEven(1.5, 'x'), TypeError);
});

test('checks parts is-integer before parts < 1', () => {
  assert.throws(() => splitEven(100, 0.5), TypeError);
});
