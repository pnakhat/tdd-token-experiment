import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances } from '../src/index.mjs';

test('computeBalances splits an expense evenly across all members by default', () => {
  const result = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100 },
  ]);
  assert.deepEqual(result, { a: 66, b: -33, c: -33 });
});

test('computeBalances returns every member at zero when there are no expenses', () => {
  assert.deepEqual(computeBalances(['a', 'b'], []), { a: 0, b: 0 });
});

test('computeBalances splits only among the listed participants', () => {
  const result = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100, participants: ['a', 'b'] },
  ]);
  assert.deepEqual(result, { a: 50, b: -50, c: 0 });
});

test('computeBalances handles a negative amountCents as a refund', () => {
  const result = computeBalances(['a', 'b'], [
    { payer: 'a', amountCents: -100 },
  ]);
  assert.deepEqual(result, { a: -50, b: 50 });
});

test('computeBalances throws TypeError when members is not an array', () => {
  assert.throws(() => computeBalances('not-an-array', []), TypeError);
});

test('computeBalances throws TypeError when a member is not a non-empty string', () => {
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
});

test('computeBalances throws RangeError when members is empty', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances throws RangeError when members contains duplicates', () => {
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
});

test('computeBalances throws TypeError when expenses is not an array', () => {
  const iterableExpenses = {
    [Symbol.iterator]: function* () {
      yield { payer: 'a', amountCents: 0 };
    },
  };
  assert.throws(() => computeBalances(['a'], iterableExpenses), TypeError);
});

test('computeBalances throws TypeError when an expense is not a non-null object', () => {
  const fakeExpense = function () {};
  fakeExpense.payer = 'a';
  fakeExpense.amountCents = 0;
  assert.throws(() => computeBalances(['a'], [fakeExpense]), TypeError);
});

test('computeBalances throws TypeError when amountCents is not an integer', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
});

test('computeBalances throws RangeError when payer is not in members', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 10 }]), RangeError);
});

test('computeBalances throws TypeError when participants is present but not an array', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: 'not-an-array' }]),
    TypeError,
  );
});

test('computeBalances throws RangeError when participants is present and empty', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: [] }]),
    RangeError,
  );
});

test('computeBalances throws RangeError when participants contains a duplicate', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'a'] }]),
    RangeError,
  );
});

test('computeBalances throws RangeError when participants contains an id not in members', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'z'] }]),
    RangeError,
  );
});
