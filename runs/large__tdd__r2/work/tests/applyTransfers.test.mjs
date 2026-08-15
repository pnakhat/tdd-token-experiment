import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransfers, settle } from '../src/index.mjs';

test('applyTransfers moves amounts from debtor to creditor without mutating input', () => {
  const balances = { a: 66, b: -33, c: -33 };
  const transfers = [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ];
  const result = applyTransfers(balances, transfers);
  assert.deepEqual(result, { a: 0, b: 0, c: 0 });
  assert.deepEqual(balances, { a: 66, b: -33, c: -33 });
});

test('applying settle(b) to b always yields an all-zero sheet', () => {
  const balances = { a: 100, b: -40, c: -60 };
  const result = applyTransfers(balances, settle(balances));
  assert.deepEqual(result, { a: 0, b: 0, c: 0 });
});

test('applyTransfers throws TypeError when balances is not a non-null plain object', () => {
  assert.throws(() => applyTransfers(null, []), TypeError);
  assert.throws(() => applyTransfers([1, 2], []), TypeError);
});

test('applyTransfers throws TypeError when a balance value is not an integer', () => {
  assert.throws(() => applyTransfers({ a: 1.5 }, []), TypeError);
});

test('applyTransfers does not enforce the sum-to-zero rule', () => {
  const result = applyTransfers({ a: 10, b: -5 }, []);
  assert.deepEqual(result, { a: 10, b: -5 });
});

test('applyTransfers throws TypeError when transfers is not an array', () => {
  assert.throws(() => applyTransfers({ a: 0 }, 'nope'), TypeError);
});

test('applyTransfers throws TypeError when a transfer is not a non-null object', () => {
  assert.throws(() => applyTransfers({ a: 0 }, [null]), TypeError);
});

test('applyTransfers throws TypeError when amountCents is not an integer', () => {
  assert.throws(
    () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 1.5 }]),
    TypeError
  );
});

test('applyTransfers throws RangeError when amountCents is not positive', () => {
  assert.throws(
    () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 0 }]),
    RangeError
  );
  assert.throws(
    () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: -5 }]),
    RangeError
  );
});

test('applyTransfers throws RangeError when from or to is not a key of balances', () => {
  assert.throws(
    () => applyTransfers({ a: 0, b: 0 }, [{ from: 'z', to: 'b', amountCents: 5 }]),
    RangeError
  );
  assert.throws(
    () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'z', amountCents: 5 }]),
    RangeError
  );
});

test('applyTransfers throws RangeError when from equals to', () => {
  assert.throws(
    () => applyTransfers({ a: 0 }, [{ from: 'a', to: 'a', amountCents: 5 }]),
    RangeError
  );
});
