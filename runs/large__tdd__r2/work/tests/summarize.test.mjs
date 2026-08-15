import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/index.mjs';

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

test('summarize yields all-zero balances and no transfers for an empty expenses array', () => {
  const result = summarize(['a', 'b'], []);
  assert.deepEqual(result, {
    totalCents: 0,
    balances: { a: 0, b: 0 },
    transfers: [],
  });
});
