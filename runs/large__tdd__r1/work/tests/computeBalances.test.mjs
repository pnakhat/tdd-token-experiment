import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances } from '../src/index.mjs';

test('computeBalances splits an expense evenly among all members by default', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]),
    { a: 66, b: -33, c: -33 }
  );
});

test('computeBalances only splits among explicit participants, leaving others untouched at 0', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100, participants: ['a', 'b'] }]),
    { a: 50, b: -50, c: 0 }
  );
});

test('computeBalances uses weights to compute shares when provided', () => {
  assert.deepEqual(
    computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'b'], weights: [1, 2] }]),
    { a: 7, b: -7 }
  );
});

test('computeBalances balances always sum to exactly 0', () => {
  const balances = computeBalances(
    ['a', 'b', 'c'],
    [
      { payer: 'a', amountCents: 100 },
      { payer: 'b', amountCents: 37, participants: ['a', 'c'] },
    ]
  );
  const sum = Object.values(balances).reduce((x, y) => x + y, 0);
  assert.equal(sum, 0);
});

test('computeBalances throws TypeError when members is not an array', () => {
  assert.throws(() => computeBalances('nope', []), TypeError);
});

test('computeBalances throws TypeError when a member is not a non-empty string', () => {
  assert.throws(() => computeBalances(['a', '', 'c'], []), TypeError);
});

test('computeBalances throws RangeError when members is empty', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances throws RangeError when there is a duplicate member', () => {
  assert.throws(() => computeBalances(['a', 'b', 'a'], []), RangeError);
});

test('computeBalances throws TypeError when expenses is not an array', () => {
  assert.throws(() => computeBalances(['a', 'b'], 'nope'), TypeError);
});

test('computeBalances throws TypeError when an expense is not a non-null object', () => {
  assert.throws(() => computeBalances(['a', 'b'], [null]), TypeError);
});

test('computeBalances throws TypeError when amountCents is not an integer', () => {
  assert.throws(() => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
});

test('computeBalances throws RangeError when payer is not in members', () => {
  assert.throws(() => computeBalances(['a', 'b'], [{ payer: 'z', amountCents: 100 }]), RangeError);
});

test('computeBalances throws TypeError when participants is present but not an array', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: 'nope' }]),
    TypeError
  );
});

test('computeBalances throws RangeError when participants is empty', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: [] }]),
    RangeError
  );
});

test('computeBalances throws RangeError when there is a duplicate participant', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: ['a', 'a'] }]),
    RangeError
  );
});

test('computeBalances throws RangeError when a participant is unknown', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: ['a', 'z'] }]),
    RangeError
  );
});

test('computeBalances throws TypeError when weights is present but not an array', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, weights: 'nope' }]),
    TypeError
  );
});

test('computeBalances throws RangeError when weights.length does not match participants length', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, weights: [1] }]),
    RangeError
  );
});
