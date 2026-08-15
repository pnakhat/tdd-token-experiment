import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances } from '../src/index.mjs';

test('computeBalances splits an expense evenly among all members by default', () => {
  const result = computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]);
  assert.deepEqual(result, { a: 66, b: -33, c: -33 });
});

test('computeBalances splits an expense only among explicit participants', () => {
  const result = computeBalances(
    ['a', 'b', 'c'],
    [{ payer: 'a', amountCents: 100, participants: ['a', 'b'] }]
  );
  assert.deepEqual(result, { a: 50, b: -50, c: 0 });
});

test('computeBalances splits an expense by weight when weights are given', () => {
  const result = computeBalances(
    ['a', 'b'],
    [{ payer: 'a', amountCents: 10, participants: ['a', 'b'], weights: [1, 2] }]
  );
  assert.deepEqual(result, { a: 7, b: -7 });
});

test('computeBalances throws TypeError when members is not an array', () => {
  assert.throws(() => computeBalances('nope', []), TypeError);
});

test('computeBalances throws TypeError when a member is not a non-empty string', () => {
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
});

test('computeBalances throws RangeError when members is empty', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances throws RangeError when members has a duplicate', () => {
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
});

test('computeBalances throws TypeError when expenses is not an array', () => {
  assert.throws(() => computeBalances(['a'], 'nope'), TypeError);
});

test('computeBalances throws TypeError when an expense is not a non-null object', () => {
  assert.throws(() => computeBalances(['a'], [null]), TypeError);
  assert.throws(() => computeBalances(['a'], [42]), TypeError);
});

test('computeBalances throws TypeError when amountCents is not an integer', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
});

test('computeBalances throws RangeError when payer is not in members', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 10 }]), RangeError);
});

test('computeBalances checks amountCents before payer membership', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'z', amountCents: 1.5 }]),
    TypeError
  );
});

test('computeBalances throws TypeError when participants is present but not an array', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: 'nope' }]),
    TypeError
  );
});

test('computeBalances throws RangeError when participants is empty', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: [] }]),
    RangeError
  );
});

test('computeBalances throws RangeError when participants has a duplicate', () => {
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
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, weights: 'nope' }]),
    TypeError
  );
});

test('computeBalances throws RangeError when weights length does not match participants length', () => {
  assert.throws(
    () =>
      computeBalances(
        ['a', 'b'],
        [{ payer: 'a', amountCents: 10, participants: ['a', 'b'], weights: [1] }]
      ),
    RangeError
  );
});

test('computeBalances includes untouched members at zero', () => {
  const result = computeBalances(
    ['a', 'b', 'c'],
    [{ payer: 'a', amountCents: 10, participants: ['a'] }]
  );
  assert.deepEqual(result, { a: 0, b: 0, c: 0 });
});
