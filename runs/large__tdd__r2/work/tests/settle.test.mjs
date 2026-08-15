import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../src/index.mjs';

test('settle produces transfers from debtors to creditors', () => {
  assert.deepEqual(settle({ a: 66, b: -33, c: -33 }), [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ]);
});

test('settle returns an empty array for an all-zero balance sheet', () => {
  assert.deepEqual(settle({ a: 0, b: 0 }), []);
});

test('settle splits a single debtor across multiple creditors', () => {
  assert.deepEqual(settle({ a: -100, b: 60, c: 40 }), [
    { from: 'a', to: 'b', amountCents: 60 },
    { from: 'a', to: 'c', amountCents: 40 },
  ]);
});

test('settle throws TypeError when balances is not a non-null plain object', () => {
  assert.throws(() => settle(null), TypeError);
});

test('settle throws TypeError when balances is an array', () => {
  assert.throws(() => settle([1, 2, 3]), TypeError);
});

test('settle throws TypeError when a balance value is not an integer', () => {
  assert.throws(() => settle({ a: 1.5, b: -1.5 }), TypeError);
});

test('settle throws RangeError when balances do not sum to zero', () => {
  assert.throws(() => settle({ a: 10, b: -5 }), RangeError);
});
