import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEven, splitByWeight, computeBalances } from '../src/index.mjs';

test('splitEven: basic example', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
});

test('splitEven: negative total', () => {
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
});

test('splitEven: zero total', () => {
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('splitEven: exact division, no remainder', () => {
  assert.deepEqual(splitEven(90, 3), [30, 30, 30]);
});

test('splitEven: parts = 1 returns whole amount', () => {
  assert.deepEqual(splitEven(50, 1), [50]);
});

test('splitEven: sums exactly to totalCents', () => {
  for (const [total, parts] of [[101, 7], [-101, 7], [0, 5], [999999, 13]]) {
    const result = splitEven(total, parts);
    assert.equal(result.length, parts);
    assert.equal(result.reduce((a, b) => a + b, 0), total);
  }
});

test('splitEven: totalCents not integer throws TypeError', () => {
  assert.throws(() => splitEven(1.5, 3), TypeError);
});

test('splitEven: parts not integer throws TypeError', () => {
  assert.throws(() => splitEven(100, 2.5), TypeError);
});

test('splitEven: parts < 1 throws RangeError', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
  assert.throws(() => splitEven(100, -1), RangeError);
});

test('splitEven: error check order - totalCents checked before parts', () => {
  assert.throws(() => splitEven(1.5, 2.5), TypeError);
});

test('splitEven: error check order - parts type checked before parts < 1 range', () => {
  assert.throws(() => splitEven(100, NaN), TypeError);
});

test('splitByWeight: [1,1,1] example', () => {
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
});

test('splitByWeight: [2,1,1] example', () => {
  assert.deepEqual(splitByWeight(100, [2, 1, 1]), [50, 25, 25]);
});

test('splitByWeight: [1,2] example', () => {
  assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
});

test('splitByWeight: zero weight example', () => {
  assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
});

test('splitByWeight: negative total example', () => {
  assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
});

test('splitByWeight: tie-break by lower index first', () => {
  // W=2, T=1: base=[0,0], rem=[1,1] tie -> leftover 1 goes to index 0
  assert.deepEqual(splitByWeight(1, [1, 1]), [1, 0]);
});

test('splitByWeight: sums exactly to totalCents', () => {
  for (const [total, weights] of [
    [100, [1, 1, 1]],
    [-100, [3, 5, 7]],
    [0, [1, 2, 3]],
    [1000, [1, 0, 0, 1]],
  ]) {
    const result = splitByWeight(total, weights);
    assert.equal(result.length, weights.length);
    assert.equal(result.reduce((a, b) => a + b, 0), total);
  }
});

test('splitByWeight: all-zero-but-not-empty leftover still works with single positive weight', () => {
  assert.deepEqual(splitByWeight(7, [0, 0, 1]), [0, 0, 7]);
});

test('splitByWeight: totalCents not integer throws TypeError', () => {
  assert.throws(() => splitByWeight(1.5, [1, 1]), TypeError);
});

test('splitByWeight: weights not an array throws TypeError', () => {
  assert.throws(() => splitByWeight(100, 'nope'), TypeError);
});

test('splitByWeight: weights containing non-integer throws TypeError', () => {
  assert.throws(() => splitByWeight(100, [1, 1.5]), TypeError);
});

test('splitByWeight: empty weights throws RangeError', () => {
  assert.throws(() => splitByWeight(100, []), RangeError);
});

test('splitByWeight: negative weight throws RangeError', () => {
  assert.throws(() => splitByWeight(100, [1, -1]), RangeError);
});

test('splitByWeight: sum of weights zero throws RangeError', () => {
  assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
});

test('splitByWeight: error check order - totalCents before weights type', () => {
  assert.throws(() => splitByWeight(1.5, 'nope'), TypeError);
});

test('splitByWeight: error check order - weights type before element type', () => {
  assert.throws(() => splitByWeight(100, null), TypeError);
});

test('splitByWeight: error check order - element type before empty check', () => {
  assert.throws(() => splitByWeight(100, [1.5]), TypeError);
});

test('splitByWeight: error check order - empty check before negative check', () => {
  assert.throws(() => splitByWeight(100, []), RangeError);
});

test('splitByWeight: error check order - negative check before sum-zero check', () => {
  assert.throws(() => splitByWeight(100, [-1, -1]), RangeError);
});

test('computeBalances: worked example from spec', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100 },
  ]);
  assert.deepEqual(balances, { a: 66, b: -33, c: -33 });
});

test('computeBalances: no expenses gives all zero balances', () => {
  const balances = computeBalances(['a', 'b'], []);
  assert.deepEqual(balances, { a: 0, b: 0 });
});

test('computeBalances: members with no activity present with value 0', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 0, participants: ['a'] },
  ]);
  assert.deepEqual(balances, { a: 0, b: 0, c: 0 });
});

test('computeBalances: explicit participants subset', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100, participants: ['a', 'b'] },
  ]);
  assert.deepEqual(balances, { a: 50, b: -50, c: 0 });
});

test('computeBalances: participant order affects remainder assignment', () => {
  const balances1 = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100, participants: ['a', 'b', 'c'] },
  ]);
  const balances2 = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100, participants: ['c', 'b', 'a'] },
  ]);
  assert.deepEqual(balances1, { a: 66, b: -33, c: -33 });
  assert.deepEqual(balances2, { a: 67, b: -33, c: -34 });
});

test('computeBalances: negative amountCents (refund)', () => {
  const balances = computeBalances(['a', 'b'], [
    { payer: 'a', amountCents: -100 },
  ]);
  assert.deepEqual(balances, { a: -50, b: 50 });
});

test('computeBalances: multiple expenses accumulate and sum to zero', () => {
  const balances = computeBalances(['a', 'b', 'c'], [
    { payer: 'a', amountCents: 100 },
    { payer: 'b', amountCents: 50, participants: ['b', 'c'] },
    { payer: 'c', amountCents: -30 },
  ]);
  const total = Object.values(balances).reduce((x, y) => x + y, 0);
  assert.equal(total, 0);
});

test('computeBalances: members not an array throws TypeError', () => {
  assert.throws(() => computeBalances('nope', []), TypeError);
});

test('computeBalances: member not a non-empty string throws TypeError', () => {
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
  assert.throws(() => computeBalances(['a', 5], []), TypeError);
});

test('computeBalances: empty members throws RangeError', () => {
  assert.throws(() => computeBalances([], []), RangeError);
});

test('computeBalances: duplicate members throws RangeError', () => {
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
});

test('computeBalances: expenses not an array throws TypeError', () => {
  assert.throws(() => computeBalances(['a'], 'nope'), TypeError);
});

test('computeBalances: expense not a non-null object throws TypeError', () => {
  assert.throws(() => computeBalances(['a'], [null]), TypeError);
  assert.throws(() => computeBalances(['a'], ['nope']), TypeError);
});

test('computeBalances: amountCents not integer throws TypeError', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
});

test('computeBalances: payer not in members throws RangeError', () => {
  assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 100 }]), RangeError);
});

test('computeBalances: participants present but not an array throws TypeError', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: 'nope' }]),
    TypeError,
  );
});

test('computeBalances: participants empty throws RangeError', () => {
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: [] }]),
    RangeError,
  );
});

test('computeBalances: participants with duplicate throws RangeError', () => {
  assert.throws(
    () =>
      computeBalances(['a', 'b'], [
        { payer: 'a', amountCents: 100, participants: ['a', 'a'] },
      ]),
    RangeError,
  );
});

test('computeBalances: participants containing id not in members throws RangeError', () => {
  assert.throws(
    () =>
      computeBalances(['a', 'b'], [
        { payer: 'a', amountCents: 100, participants: ['a', 'z'] },
      ]),
    RangeError,
  );
});

test('computeBalances: error check order - amountCents checked before payer', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'z', amountCents: 1.5 }]),
    TypeError,
  );
});

test('computeBalances: error check order - payer checked before participants type', () => {
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'z', amountCents: 100, participants: 'nope' }]),
    RangeError,
  );
});
