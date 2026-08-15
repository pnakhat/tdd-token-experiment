// HOLD-OUT SUITE — medium task.
// Written before any agent ran; never visible inside a run workspace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEven, splitByWeight, computeBalances } from '../src/index.mjs';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const sumVals = (o) => Object.values(o).reduce((x, y) => x + y, 0);

/* ---------------------------------------- splitEven */

test('splitEven: remainder to earliest, exact sum', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
  assert.deepEqual(splitEven(90, 3), [30, 30, 30]);
  assert.deepEqual(splitEven(5, 10), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
});

test('splitEven: negative totals follow the floor rule', () => {
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
});

test('splitEven: property sweep sums exactly', () => {
  for (let total = -40; total <= 40; total++) {
    for (let parts = 1; parts <= 7; parts++) {
      assert.equal(sum(splitEven(total, parts)), total, `${total}/${parts}`);
    }
  }
});

test('splitEven: error types', () => {
  assert.throws(() => splitEven(1.5, 3), TypeError);
  assert.throws(() => splitEven(100, 2.5), TypeError);
  assert.throws(() => splitEven(100, 0), RangeError);
});

/* ---------------------------------------- splitByWeight */

test('splitByWeight: exact proportional cases', () => {
  assert.deepEqual(splitByWeight(100, [2, 1, 1]), [50, 25, 25]);
  assert.deepEqual(splitByWeight(60, [1, 1, 1]), [20, 20, 20]);
});

test('splitByWeight: largest-remainder tie-break favours lower index', () => {
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
});

test('splitByWeight: leftover goes to the biggest remainder', () => {
  // base [3,6], rem [1,2], leftover 1 -> index 1
  assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
});

test('splitByWeight: zero weights receive nothing', () => {
  assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
  assert.deepEqual(splitByWeight(100, [0, 1, 0]), [0, 100, 0]);
});

test('splitByWeight: negative totals are computed on the magnitude then negated', () => {
  assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
  assert.deepEqual(splitByWeight(-100, [1, 1, 1]), [-34, -33, -33]);
});

test('splitByWeight: zero total', () => {
  assert.deepEqual(splitByWeight(0, [3, 1]), [0, 0]);
});

test('splitByWeight: property sweep sums exactly and stays non-negative in sign', () => {
  const weightSets = [[1, 1], [1, 2], [1, 2, 3], [5, 5, 1], [7, 1, 1, 1], [1, 0, 2]];
  for (const w of weightSets) {
    for (let total = -37; total <= 37; total++) {
      const out = splitByWeight(total, w);
      assert.equal(out.length, w.length);
      assert.ok(out.every(Number.isInteger));
      assert.equal(sum(out), total, `${total} / ${JSON.stringify(w)}`);
    }
  }
});

test('splitByWeight: error types', () => {
  assert.throws(() => splitByWeight(1.5, [1]), TypeError);
  assert.throws(() => splitByWeight(100, 'nope'), TypeError);
  assert.throws(() => splitByWeight(100, [1, 1.5]), TypeError);
  assert.throws(() => splitByWeight(100, []), RangeError);
  assert.throws(() => splitByWeight(100, [1, -1]), RangeError);
  assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
});

/* ---------------------------------------- computeBalances */

test('computeBalances: single expense split across all members', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]),
    { a: 66, b: -33, c: -33 },
  );
});

test('computeBalances: every member appears, inactive ones at zero', () => {
  const out = computeBalances(['a', 'b', 'c', 'd'], []);
  assert.deepEqual(out, { a: 0, b: 0, c: 0, d: 0 });
});

test('computeBalances: participants subset and ordering', () => {
  // shares splitEven(100,2) = [50,50] over ['b','c']
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [
      { payer: 'a', amountCents: 100, participants: ['b', 'c'] },
    ]),
    { a: 100, b: -50, c: -50 },
  );
  // ordering is observable through the remainder
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [
      { payer: 'a', amountCents: 101, participants: ['b', 'c'] },
    ]),
    { a: 101, b: -51, c: -50 },
  );
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [
      { payer: 'a', amountCents: 101, participants: ['c', 'b'] },
    ]),
    { a: 101, b: -50, c: -51 },
  );
});

test('computeBalances: payer can also be a participant', () => {
  assert.deepEqual(
    computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 50, participants: ['a'] }]),
    { a: 0, b: 0 },
  );
});

test('computeBalances: multiple expenses accumulate', () => {
  const out = computeBalances(['a', 'b'], [
    { payer: 'a', amountCents: 100 },
    { payer: 'b', amountCents: 40 },
  ]);
  assert.deepEqual(out, { a: 30, b: -30 });
});

test('computeBalances: negative amounts (refunds) are supported', () => {
  const out = computeBalances(['a', 'b'], [{ payer: 'a', amountCents: -100 }]);
  assert.deepEqual(out, { a: -50, b: 50 });
});

test('computeBalances: balances always sum to zero', () => {
  const members = ['a', 'b', 'c', 'd'];
  const expenses = [
    { payer: 'a', amountCents: 1001 },
    { payer: 'b', amountCents: 77, participants: ['a', 'c'] },
    { payer: 'd', amountCents: -13, participants: ['b', 'c', 'd'] },
    { payer: 'c', amountCents: 5 },
  ];
  assert.equal(sumVals(computeBalances(members, expenses)), 0);
});

test('computeBalances: error types', () => {
  assert.throws(() => computeBalances('a', []), TypeError);
  assert.throws(() => computeBalances([1, 2], []), TypeError);
  assert.throws(() => computeBalances(['a', ''], []), TypeError);
  assert.throws(() => computeBalances([], []), RangeError);
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
  assert.throws(() => computeBalances(['a'], 'nope'), TypeError);
  assert.throws(() => computeBalances(['a'], [null]), TypeError);
  assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
  assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 10 }]), RangeError);
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: 'a' }]),
    TypeError,
  );
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: [] }]),
    RangeError,
  );
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'a'] }]),
    RangeError,
  );
  assert.throws(
    () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: ['z'] }]),
    RangeError,
  );
});

test('computeBalances: does not mutate its inputs', () => {
  const members = ['a', 'b'];
  const expenses = [{ payer: 'a', amountCents: 100 }];
  const snapshot = JSON.stringify({ members, expenses });
  computeBalances(members, expenses);
  assert.equal(JSON.stringify({ members, expenses }), snapshot);
});
