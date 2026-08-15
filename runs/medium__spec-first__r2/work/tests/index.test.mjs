import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEven, splitByWeight, computeBalances } from '../src/index.mjs';

test('splitEven: basic examples from spec', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('splitEven: sums exactly to totalCents', () => {
  for (const [total, parts] of [[101, 7], [-101, 7], [1, 1], [999999, 13]]) {
    const shares = splitEven(total, parts);
    assert.equal(shares.length, parts);
    assert.equal(shares.reduce((a, b) => a + b, 0), total);
  }
});

test('splitEven: single part returns whole amount', () => {
  assert.deepEqual(splitEven(50, 1), [50]);
});

test('splitEven: throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitEven(1.5, 3), TypeError);
  assert.throws(() => splitEven('100', 3), TypeError);
  assert.throws(() => splitEven(NaN, 3), TypeError);
});

test('splitEven: throws TypeError when parts is not an integer', () => {
  assert.throws(() => splitEven(100, 2.5), TypeError);
  assert.throws(() => splitEven(100, '3'), TypeError);
});

test('splitEven: throws RangeError when parts < 1', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
  assert.throws(() => splitEven(100, -1), RangeError);
});

test('splitEven: error checking order — totalCents checked before parts', () => {
  assert.throws(() => splitEven(1.5, 0), TypeError);
});

test('splitByWeight: worked examples from spec', () => {
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(splitByWeight(100, [2, 1, 1]), [50, 25, 25]);
  assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
  assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
  assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
});

test('splitByWeight: sums exactly to totalCents', () => {
  for (const [total, weights] of [
    [1000, [3, 5, 7, 1]],
    [-1000, [3, 5, 7, 1]],
    [1, [1, 1, 1]],
    [0, [1, 2, 3]],
  ]) {
    const shares = splitByWeight(total, weights);
    assert.equal(shares.reduce((a, b) => a + b, 0), total);
  }
});

test('splitByWeight: ties broken by lower index first', () => {
  // T=10, weights [1,1,1,1]: base [2,2,2,2], rem [2,2,2,2] all equal -> leftover 2 -> indices 0,1
  assert.deepEqual(splitByWeight(10, [1, 1, 1, 1]), [3, 3, 2, 2]);
});

test('splitByWeight: all-zero-remainder weight never wins a leftover unit', () => {
  assert.deepEqual(splitByWeight(3, [0, 1, 1, 1]), [0, 1, 1, 1]);
});

test('splitByWeight: throws TypeError when totalCents is not an integer', () => {
  assert.throws(() => splitByWeight(1.5, [1, 1]), TypeError);
});

test('splitByWeight: throws TypeError when weights is not an array', () => {
  assert.throws(() => splitByWeight(100, 'nope'), TypeError);
  assert.throws(() => splitByWeight(100, null), TypeError);
});

test('splitByWeight: throws TypeError when a weight is not an integer', () => {
  assert.throws(() => splitByWeight(100, [1, 2.5]), TypeError);
});

test('splitByWeight: throws RangeError when weights is empty', () => {
  assert.throws(() => splitByWeight(100, []), RangeError);
});

test('splitByWeight: throws RangeError when a weight is negative', () => {
  assert.throws(() => splitByWeight(100, [1, -1]), RangeError);
});

test('splitByWeight: throws RangeError when sum of weights is zero', () => {
  assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
});

test('splitByWeight: error checking order — totalCents before weights type', () => {
  assert.throws(() => splitByWeight(1.5, 'nope'), TypeError);
});

test('splitByWeight: error checking order — weights type before element integer check', () => {
  assert.throws(() => splitByWeight(100, 'nope'), TypeError);
});

test('splitByWeight: error checking order — element integer check before empty check', () => {
  // empty array trivially has no non-integer elements, falls through to RangeError
  assert.throws(() => splitByWeight(100, []), RangeError);
});

test('splitByWeight: error checking order — empty check before negative check', () => {
  assert.throws(() => splitByWeight(100, []), RangeError);
});

test('computeBalances: worked example from spec', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100 },
  ]);
  assert.deepEqual(balances, { a: 66, b: -33, c: -33 });
});

test('computeBalances: all members present even with no activity', () => {
  const balances = computeBalances(['a', 'b', 'c'], []);
  assert.deepEqual(balances, { a: 0, b: 0, c: 0 });
});

test('computeBalances: balances always sum to zero', () => {
  const balances = computeBalances(['a', 'b', 'c', 'd'], [
    { payer: 'a', amountCents: 101 },
    { payer: 'b', amountCents: 50, participants: ['b', 'c'] },
    { payer: 'c', amountCents: -20 },
  ]);
  const sum = Object.values(balances).reduce((a, b) => a + b, 0);
  assert.equal(sum, 0);
});

test('computeBalances: participants defaults to full members array in order', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'c', amountCents: 10 },
  ]);
  // splitEven(10,3) = [4,3,3] over ['a','b','c']
  assert.deepEqual(balances, { a: -4, b: -3, c: 7 });
});

test('computeBalances: explicit participants subset, order-dependent remainder', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 10, participants: ['c', 'b'] },
  ]);
  // splitEven(10,2) = [5,5] over ['c','b']
  assert.deepEqual(balances, { a: 10, b: -5, c: -5 });
});

test('computeBalances: negative amountCents (refund)', () => {
  const balances = computeBalances(['a', 'b'], [
    { payer: 'a', amountCents: -10 },
  ]);
  // splitEven(-10,2) = [-5,-5]
  assert.deepEqual(balances, { a: -5, b: 5 });
});

test('computeBalances: throws TypeError when members is not an array', () => {
  assert.throws(() => computeBalances('nope', []), TypeError);
});

test('computeBalances: throws TypeError when a member is not a non-empty string', () => {
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
  assert.throws(() => computeBalances(['a', 1], []), TypeError);
});

test('computeBalances: throws RangeError when members is empty', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances: throws RangeError when members contains duplicates', () => {
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
});

test('computeBalances: throws TypeError when expenses is not an array', () => {
  assert.throws(() => computeBalances(['a'], 'nope'), TypeError);
});

test('computeBalances: throws TypeError when an expense is not a non-null object', () => {
  assert.throws(() => computeBalances(['a'], [null]), TypeError);
  assert.throws(() => computeBalances(['a'], ['nope']), TypeError);
});

test('computeBalances: throws TypeError when amountCents is not an integer', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
});

test('computeBalances: throws RangeError when payer is not in members', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 10 }]), RangeError);
});

test('computeBalances: throws TypeError when participants is present but not an array', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: 'b' }]),
    TypeError,
  );
});

test('computeBalances: throws RangeError when participants is present and empty', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: [] }]),
    RangeError,
  );
});

test('computeBalances: throws RangeError when participants contains a duplicate', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'a'] }]),
    RangeError,
  );
});

test('computeBalances: throws RangeError when participants contains an id not in members', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'z'] }]),
    RangeError,
  );
});

test('computeBalances: multiple expenses accumulate correctly', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100 },
    { payer: 'b', amountCents: 60, participants: ['a', 'b', 'c'] },
  ]);
  assert.equal(Object.values(balances).reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(Object.keys(balances).sort(), ['a', 'b', 'c']);
});
