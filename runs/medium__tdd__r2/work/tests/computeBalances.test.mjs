import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances } from '../src/index.mjs';

test('computeBalances handles a single expense split evenly', () => {
  const result = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100 },
  ]);
  assert.deepEqual(result, { a: 66, b: -33, c: -33 });
});

test('computeBalances includes members with no activity at zero', () => {
  const result = computeBalances(['a', 'b', 'c'], []);
  assert.deepEqual(result, { a: 0, b: 0, c: 0 });
});

test('computeBalances splits only among listed participants', () => {
  const result = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100, participants: ['a', 'b'] },
  ]);
  assert.deepEqual(result, { a: 50, b: -50, c: 0 });
});

test('computeBalances handles negative amounts as refunds and always sums to zero', () => {
  const result = computeBalances(['a', 'b'], [
    { payer: 'a', amountCents: 100 },
    { payer: 'b', amountCents: -20 },
  ]);
  const sum = Object.values(result).reduce((x, y) => x + y, 0);
  assert.equal(sum, 0);
  assert.deepEqual(result, { a: 60, b: -60 });
});

test('computeBalances throws TypeError when members is not an array', () => {
  assert.throws(() => computeBalances('abc', []), TypeError);
});

test('computeBalances throws TypeError when a member is not a non-empty string', () => {
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
  assert.throws(() => computeBalances(['a', 1], []), TypeError);
});

test('computeBalances throws RangeError when members is empty', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances throws RangeError when members contains duplicates', () => {
  assert.throws(() => computeBalances(['a', 'b', 'a'], []), RangeError);
});

test('computeBalances throws TypeError when expenses is not an array', () => {
  assert.throws(() => computeBalances(['a'], 'not-an-array'), TypeError);
});

test('computeBalances throws TypeError when an expense is not a non-null object', () => {
  assert.throws(() => computeBalances(['a'], [null]), TypeError);
  assert.throws(() => computeBalances(['a'], ['not-an-object']), TypeError);
});

test('computeBalances throws RangeError when payer is not in members', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'c', amountCents: 100 }]),
    RangeError,
  );
});

test('computeBalances throws TypeError when amountCents is not an integer', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]),
    TypeError,
  );
});

test('computeBalances throws TypeError when participants is present but not an array', () => {
  assert.throws(
    () =>
      computeBalances(['a'], [
        { payer: 'a', amountCents: 100, participants: 'a' },
      ]),
    TypeError,
  );
});

test('computeBalances throws RangeError when participants is present and empty', () => {
  assert.throws(
    () =>
      computeBalances(['a'], [
        { payer: 'a', amountCents: 100, participants: [] },
      ]),
    RangeError,
  );
});

test('computeBalances throws RangeError when participants contains a duplicate', () => {
  assert.throws(
    () =>
      computeBalances(['a', 'b'], [
        { payer: 'a', amountCents: 100, participants: ['a', 'a'] },
      ]),
    RangeError,
  );
});

test('computeBalances throws RangeError when participants contains an id not in members', () => {
  assert.throws(
    () =>
      computeBalances(['a', 'b'], [
        { payer: 'a', amountCents: 100, participants: ['a', 'z'] },
      ]),
    RangeError,
  );
});
