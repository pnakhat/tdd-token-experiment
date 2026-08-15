import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/index.mjs';

test('summarize returns an all-zero roll-up for empty expenses', () => {
  assert.deepEqual(summarize(['a', 'b'], []), {
    totalCents: 0,
    balances: { a: 0, b: 0 },
    transfers: [],
  });
});

test('summarize propagates validation errors from computeBalances', () => {
  assert.throws(() => summarize([], []), RangeError);
});

test('summarize rolls up totalCents, balances, and transfers', () => {
  const result = summarize(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]);
  assert.deepEqual(result, {
    totalCents: 100,
    balances: { a: 66, b: -33, c: -33 },
    transfers: [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ],
  });
});
