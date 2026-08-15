import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../src/index.mjs';

test('settle matches the worked example, sorting debtors and creditors correctly', () => {
  assert.deepEqual(settle({ a: 66, b: -33, c: -33 }), [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ]);
});

test('settle returns an empty array for an all-zero balance sheet', () => {
  assert.deepEqual(settle({ a: 0, b: 0 }), []);
});

test('settle throws TypeError when balances is not a non-null plain object', () => {
  assert.throws(() => settle(null), TypeError);
});

test('settle throws TypeError when balances is an array', () => {
  assert.throws(() => settle([1, 2]), TypeError);
});

test('settle throws TypeError when a balance value is not an integer', () => {
  assert.throws(() => settle({ a: 1.5, b: -1.5 }), TypeError);
});

test('settle throws RangeError when balances do not sum to 0', () => {
  assert.throws(() => settle({ a: 10, b: -5 }), RangeError);
});

test('settle handles multiple debtors and creditors with a two-pointer greedy pass', () => {
  // debtors sorted ascending: c(-40), a(-10)
  // creditors sorted descending: b(30), d(20)
  assert.deepEqual(settle({ a: -10, b: 30, c: -40, d: 20 }), [
    { from: 'c', to: 'b', amountCents: 30 },
    { from: 'c', to: 'd', amountCents: 10 },
    { from: 'a', to: 'd', amountCents: 10 },
  ]);
});
