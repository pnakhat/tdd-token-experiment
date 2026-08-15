import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransfers, settle } from '../src/index.mjs';

test('applyTransfers moves balances toward zero', () => {
  const balances = { a: 66, b: -33, c: -33 };
  const result = applyTransfers(balances, [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ]);
  assert.deepEqual(result, { a: 0, b: 0, c: 0 });
});

test('applyTransfers does not mutate its input', () => {
  const balances = { a: 66, b: -33, c: -33 };
  applyTransfers(balances, [{ from: 'b', to: 'a', amountCents: 33 }]);
  assert.deepEqual(balances, { a: 66, b: -33, c: -33 });
});

test('applyTransfers of settle(b) to b always yields an all-zero sheet', () => {
  const balances = { a: 50, b: 20, c: -30, d: -40 };
  const result = applyTransfers(balances, settle(balances));
  assert.deepEqual(result, { a: 0, b: 0, c: 0, d: 0 });
});

test('applyTransfers throws TypeError when balances is invalid', () => {
  assert.throws(() => applyTransfers(null, []), TypeError);
});

test('applyTransfers throws TypeError when transfers is not an array', () => {
  assert.throws(() => applyTransfers({ a: 0 }, 'not-an-array'), TypeError);
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
});

test('applyTransfers throws RangeError when from is not a key of balances', () => {
  assert.throws(
    () => applyTransfers({ a: 0, b: 0 }, [{ from: 'z', to: 'b', amountCents: 5 }]),
    RangeError
  );
});

test('applyTransfers throws RangeError when from equals to', () => {
  assert.throws(
    () => applyTransfers({ a: 0 }, [{ from: 'a', to: 'a', amountCents: 5 }]),
    RangeError
  );
});
