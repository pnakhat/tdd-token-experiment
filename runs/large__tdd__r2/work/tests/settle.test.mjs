import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../src/index.mjs';

test('settle matches debtors to creditors with a two-pointer greedy pass', () => {
  const result = settle({ a: 66, b: -33, c: -33 });
  assert.deepEqual(result, [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ]);
});

test('settle returns an empty array for an all-zero balance sheet', () => {
  assert.deepEqual(settle({ a: 0, b: 0 }), []);
});

test('settle throws TypeError when balances is not a non-null plain object', () => {
  assert.throws(() => settle(null), TypeError);
  assert.throws(() => settle([1, 2]), TypeError);
});

test('settle throws TypeError when a balance value is not an integer', () => {
  assert.throws(() => settle({ a: 1.5, b: -1.5 }), TypeError);
});

test('settle throws RangeError when values do not sum to zero', () => {
  assert.throws(() => settle({ a: 10, b: -5 }), RangeError);
});
