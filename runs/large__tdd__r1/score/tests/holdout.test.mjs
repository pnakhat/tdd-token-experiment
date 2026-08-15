// HOLD-OUT SUITE — large task.
// Written before any agent ran; never visible inside a run workspace.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitEven,
  splitByWeight,
  computeBalances,
  settle,
  applyTransfers,
  summarize,
} from '../src/index.mjs';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const sumVals = (o) => Object.values(o).reduce((x, y) => x + y, 0);

/* ---------------------------------------- splitEven */

test('splitEven: remainder to earliest, exact sum', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
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

test('splitByWeight: exact and largest-remainder cases', () => {
  assert.deepEqual(splitByWeight(100, [2, 1, 1]), [50, 25, 25]);
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
});

test('splitByWeight: zero weights and negative totals', () => {
  assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
  assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
});

test('splitByWeight: property sweep sums exactly', () => {
  for (const w of [[1, 1], [1, 2], [1, 2, 3], [5, 5, 1], [1, 0, 2]]) {
    for (let total = -30; total <= 30; total++) {
      assert.equal(sum(splitByWeight(total, w)), total, `${total}/${JSON.stringify(w)}`);
    }
  }
});

test('splitByWeight: error types', () => {
  assert.throws(() => splitByWeight(100, []), RangeError);
  assert.throws(() => splitByWeight(100, [1, -1]), RangeError);
  assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
  assert.throws(() => splitByWeight(100, [1, 1.5]), TypeError);
});

/* ---------------------------------------- computeBalances */

test('computeBalances: basic split and zero-sum', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]),
    { a: 66, b: -33, c: -33 },
  );
});

test('computeBalances: participant order is observable', () => {
  assert.deepEqual(
    computeBalances(['a', 'b', 'c'], [
      { payer: 'a', amountCents: 101, participants: ['c', 'b'] },
    ]),
    { a: 101, b: -50, c: -51 },
  );
});

test('computeBalances: weighted shares', () => {
  // splitByWeight(100,[1,3]) -> base [25,75], exact -> [25,75]
  assert.deepEqual(
    computeBalances(['a', 'b'], [
      { payer: 'a', amountCents: 100, participants: ['a', 'b'], weights: [1, 3] },
    ]),
    { a: 75, b: -75 },
  );
});

test('computeBalances: weights default over all members when participants omitted', () => {
  assert.deepEqual(
    computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, weights: [1, 4] }]),
    { a: 8, b: -8 },
  );
});

test('computeBalances: inactive members present at zero, balances sum to zero', () => {
  const out = computeBalances(['a', 'b', 'c', 'd'], [
    { payer: 'a', amountCents: 1001 },
    { payer: 'b', amountCents: 77, participants: ['a', 'c'] },
    { payer: 'd', amountCents: -13, participants: ['b', 'c', 'd'] },
  ]);
  assert.deepEqual(Object.keys(out).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(sumVals(out), 0);
});

test('computeBalances: error types', () => {
  assert.throws(() => computeBalances([], []), RangeError);
  assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
  assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 10 }]), RangeError);
  assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
  assert.throws(
    () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, weights: [1] }]),
    RangeError,
  );
});

/* ---------------------------------------- settle */

test('settle: worked example from the spec', () => {
  assert.deepEqual(settle({ a: 66, b: -33, c: -33 }), [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ]);
});

test('settle: one debtor across two creditors, largest credit first', () => {
  assert.deepEqual(settle({ a: 50, b: 30, c: -80 }), [
    { from: 'c', to: 'a', amountCents: 50 },
    { from: 'c', to: 'b', amountCents: 30 },
  ]);
});

test('settle: creditor ties break on member id ascending', () => {
  assert.deepEqual(settle({ b: 30, a: 30, c: -60 }), [
    { from: 'c', to: 'a', amountCents: 30 },
    { from: 'c', to: 'b', amountCents: 30 },
  ]);
});

test('settle: all-zero sheet yields no transfers', () => {
  assert.deepEqual(settle({ a: 0, b: 0 }), []);
  assert.deepEqual(settle({}), []);
});

test('settle: never emits a zero or negative amount', () => {
  const t = settle({ a: 100, b: 0, c: -60, d: -40 });
  assert.ok(t.length > 0);
  assert.ok(t.every((x) => Number.isInteger(x.amountCents) && x.amountCents > 0));
});

test('settle: uses at most n-1 transfers', () => {
  const balances = { a: 100, b: 200, c: -50, d: -250 };
  assert.ok(settle(balances).length <= Object.keys(balances).length - 1);
});

test('settle: error types', () => {
  assert.throws(() => settle(null), TypeError);
  assert.throws(() => settle('nope'), TypeError);
  assert.throws(() => settle({ a: 1.5, b: -1.5 }), TypeError);
  assert.throws(() => settle({ a: 10, b: -5 }), RangeError);
});

/* ---------------------------------------- applyTransfers */

test('applyTransfers: settling a sheet zeroes it out', () => {
  const balances = { a: 66, b: -33, c: -33 };
  const after = applyTransfers(balances, settle(balances));
  assert.deepEqual(after, { a: 0, b: 0, c: 0 });
});

test('applyTransfers: does not mutate its input', () => {
  const balances = { a: 66, b: -33, c: -33 };
  const snapshot = JSON.stringify(balances);
  applyTransfers(balances, settle(balances));
  assert.equal(JSON.stringify(balances), snapshot);
});

test('applyTransfers: direction — payer moves toward zero', () => {
  assert.deepEqual(
    applyTransfers({ a: 10, b: -10 }, [{ from: 'b', to: 'a', amountCents: 10 }]),
    { a: 0, b: 0 },
  );
});

test('applyTransfers: error types', () => {
  const b = { a: 10, b: -10 };
  assert.throws(() => applyTransfers(b, 'nope'), TypeError);
  assert.throws(() => applyTransfers(b, [null]), TypeError);
  assert.throws(() => applyTransfers(b, [{ from: 'a', to: 'b', amountCents: 1.5 }]), TypeError);
  assert.throws(() => applyTransfers(b, [{ from: 'a', to: 'b', amountCents: 0 }]), RangeError);
  assert.throws(() => applyTransfers(b, [{ from: 'a', to: 'b', amountCents: -5 }]), RangeError);
  assert.throws(() => applyTransfers(b, [{ from: 'z', to: 'b', amountCents: 5 }]), RangeError);
  assert.throws(() => applyTransfers(b, [{ from: 'a', to: 'a', amountCents: 5 }]), RangeError);
});

/* ---------------------------------------- summarize */

test('summarize: shape and roll-up', () => {
  const out = summarize(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]);
  assert.equal(out.totalCents, 100);
  assert.deepEqual(out.balances, { a: 66, b: -33, c: -33 });
  assert.deepEqual(out.transfers, [
    { from: 'b', to: 'a', amountCents: 33 },
    { from: 'c', to: 'a', amountCents: 33 },
  ]);
});

test('summarize: empty expenses', () => {
  assert.deepEqual(summarize(['a', 'b'], []), {
    totalCents: 0,
    balances: { a: 0, b: 0 },
    transfers: [],
  });
});

test('summarize: end-to-end settles to zero on a messy ledger', () => {
  const members = ['ana', 'bo', 'cy', 'di'];
  const expenses = [
    { payer: 'ana', amountCents: 7301 },
    { payer: 'bo', amountCents: 1234, participants: ['ana', 'cy'] },
    { payer: 'cy', amountCents: 999, participants: ['ana', 'bo', 'cy', 'di'], weights: [3, 1, 1, 2] },
    { payer: 'di', amountCents: -455, participants: ['bo', 'di'] },
  ];
  const out = summarize(members, expenses);
  assert.equal(out.totalCents, 7301 + 1234 + 999 - 455);
  assert.equal(sumVals(out.balances), 0);
  const after = applyTransfers(out.balances, out.transfers);
  assert.ok(Object.values(after).every((v) => v === 0), 'fully settled');
});

test('summarize: propagates validation errors', () => {
  assert.throws(() => summarize([], []), RangeError);
  assert.throws(() => summarize(['a'], [{ payer: 'z', amountCents: 1 }]), RangeError);
});
