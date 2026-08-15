import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances } from '../src/index.mjs';

test('computeBalances computes net position for a single payer expense', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]),
    { a: 66, b: -33, c: -33 }
  );
});

test('computeBalances returns every member, including ones untouched by any expense', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 50, participants: ['a', 'b'] }]),
    { a: 25, b: -25, c: 0 }
  );
});

test('computeBalances uses weights when provided', () => {
  assert.deepEqual(
    computeBalances(['a', 'b'], [
      { payer: 'a', amountCents: 10, participants: ['a', 'b'], weights: [1, 2] },
    ]),
    { a: 7, b: -7 }
  );
});

test('computeBalances throws TypeError when members is not an array', () => {
  assert.throws(() => computeBalances('abc', []), TypeError);
});

test('computeBalances throws TypeError when a member is not a non-empty string', () => {
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
});

test('computeBalances throws RangeError when members is empty', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances throws RangeError when a member is duplicated', () => {
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
});

test('computeBalances throws TypeError when expenses is not an array', () => {
  assert.throws(() => computeBalances(['a'], 'not-an-array'), TypeError);
});

test('computeBalances throws TypeError when an expense is not a non-null object', () => {
  assert.throws(() => computeBalances(['a'], [null]), TypeError);
});

test('computeBalances throws TypeError when amountCents is not an integer', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]),
    TypeError
  );
});

test('computeBalances throws RangeError when payer is not in members', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'z', amountCents: 10 }]),
    RangeError
  );
});

test('computeBalances throws TypeError when participants is present but not an array', () => {
  assert.throws(
    () =>
      computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: 'a' }]),
    TypeError
  );
});

test('computeBalances throws RangeError when participants is empty', () => {
  assert.throws(
    () =>
      computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: [] }]),
    RangeError
  );
});

test('computeBalances throws RangeError when a participant is duplicated', () => {
  assert.throws(
    () =>
      computeBalances(
        ['a', 'b'],
        [{ payer: 'a', amountCents: 10, participants: ['a', 'a'] }]
      ),
    RangeError
  );
});

test('computeBalances throws RangeError when a participant is unknown', () => {
  assert.throws(
    () =>
      computeBalances(
        ['a', 'b'],
        [{ payer: 'a', amountCents: 10, participants: ['a', 'z'] }]
      ),
    RangeError
  );
});

test('computeBalances throws TypeError when weights is present but not an array', () => {
  assert.throws(
    () =>
      computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, weights: 'nope' }]),
    TypeError
  );
});

test('computeBalances throws RangeError when weights.length does not match participants length', () => {
  assert.throws(
    () =>
      computeBalances(
        ['a', 'b', 'c'],
        [{ payer: 'a', amountCents: 10, weights: [1, 1] }]
      ),
    RangeError
  );
});
