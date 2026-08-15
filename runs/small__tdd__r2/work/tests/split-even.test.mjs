import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEven } from '../src/index.mjs';

test('splits 100 into 3 parts as [34, 33, 33]', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
});

test('splits 10 into 1 part as [10]', () => {
  assert.deepEqual(splitEven(10, 1), [10]);
});

test('splits 0 into 4 parts as [0, 0, 0, 0]', () => {
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('splits -100 into 3 parts as [-33, -33, -34]', () => {
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
});

test('splits 7 into 7 parts as all ones', () => {
  assert.deepEqual(splitEven(7, 7), [1, 1, 1, 1, 1, 1, 1]);
});

test('splits 5 into 10 parts with trailing zeros', () => {
  assert.deepEqual(splitEven(5, 10), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
});

test('throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitEven(1.5, 3), TypeError);
});

test('throws TypeError when totalCents is a numeric string', () => {
  assert.throws(() => splitEven('100', 3), TypeError);
});

test('throws TypeError when totalCents is NaN', () => {
  assert.throws(() => splitEven(NaN, 3), TypeError);
});

test('throws TypeError when totalCents is Infinity', () => {
  assert.throws(() => splitEven(Infinity, 3), TypeError);
});

test('throws TypeError when parts is not an integer', () => {
  assert.throws(() => splitEven(100, 2.5), TypeError);
});

test('throws RangeError when parts is less than 1', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
});

test('checks totalCents before parts when both are invalid', () => {
  assert.throws(() => splitEven(1.5, 0), TypeError);
});

test('checks parts integer-ness before parts range', () => {
  assert.throws(() => splitEven(100, 0.5), TypeError);
});
