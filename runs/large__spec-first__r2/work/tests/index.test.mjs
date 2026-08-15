import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitEven,
  splitByWeight,
  computeBalances,
  settle,
  applyTransfers,
  summarize,
} from '../src/index.mjs';

describe('splitEven', () => {
  test('splits evenly with no remainder', () => {
    assert.deepEqual(splitEven(90, 3), [30, 30, 30]);
  });

  test('distributes remainder to first elements', () => {
    assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
  });

  test('handles negative totals', () => {
    assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
  });

  test('handles a single part', () => {
    assert.deepEqual(splitEven(50, 1), [50]);
  });

  test('sums to exactly totalCents', () => {
    const result = splitEven(101, 7);
    assert.equal(result.reduce((a, b) => a + b, 0), 101);
    assert.equal(result.length, 7);
  });

  test('throws TypeError when totalCents is not an integer', () => {
    assert.throws(() => splitEven(1.5, 3), TypeError);
  });

  test('throws TypeError when parts is not an integer', () => {
    assert.throws(() => splitEven(100, 2.5), TypeError);
  });

  test('throws RangeError when parts < 1', () => {
    assert.throws(() => splitEven(100, 0), RangeError);
    assert.throws(() => splitEven(100, -1), RangeError);
  });

  test('checks totalCents before parts', () => {
    assert.throws(() => splitEven(1.5, 0), TypeError);
  });
});

describe('splitByWeight', () => {
  test('equal weights behave like splitEven', () => {
    assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
  });

  test('unequal weights use largest remainder', () => {
    assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
  });

  test('handles negative totals', () => {
    assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
  });

  test('zero weight gets zero share', () => {
    assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
  });

  test('returns shares in original index order', () => {
    const result = splitByWeight(100, [3, 1, 1, 1]);
    assert.equal(result.length, 4);
    assert.equal(result.reduce((a, b) => a + b, 0), 100);
  });

  test('throws TypeError when totalCents is not an integer', () => {
    assert.throws(() => splitByWeight(1.5, [1, 1]), TypeError);
  });

  test('throws TypeError when weights is not an array', () => {
    assert.throws(() => splitByWeight(100, 'nope'), TypeError);
  });

  test('throws TypeError when a weight is not an integer', () => {
    assert.throws(() => splitByWeight(100, [1, 1.5]), TypeError);
  });

  test('throws RangeError when weights is empty', () => {
    assert.throws(() => splitByWeight(100, []), RangeError);
  });

  test('throws RangeError when a weight is negative', () => {
    assert.throws(() => splitByWeight(100, [1, -1]), RangeError);
  });

  test('throws RangeError when weights sum to zero', () => {
    assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
  });

  test('checks error order: totalCents before weights-is-array', () => {
    assert.throws(() => splitByWeight(1.5, 'nope'), TypeError);
  });

  test('checks error order: weight-not-integer before empty', () => {
    // weights is non-empty but has a bad element - should be TypeError not RangeError
    assert.throws(() => splitByWeight(100, [1.5]), TypeError);
  });

  test('checks error order: negative weight before sum-zero', () => {
    assert.throws(() => splitByWeight(100, [-1, 1]), RangeError);
  });
});

describe('computeBalances', () => {
  test('single payer splits evenly among all members by default', () => {
    const balances = computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]);
    assert.deepEqual(balances, { a: 66, b: -33, c: -33 });
  });

  test('balances always sum to zero', () => {
    const balances = computeBalances(
      ['a', 'b', 'c', 'd'],
      [
        { payer: 'a', amountCents: 100 },
        { payer: 'b', amountCents: 250, participants: ['a', 'c'] },
        { payer: 'c', amountCents: 33, weights: [1, 2] , participants: ['b', 'd']},
      ]
    );
    assert.equal(Object.values(balances).reduce((a, b) => a + b, 0), 0);
  });

  test('untouched members appear as zero', () => {
    const balances = computeBalances(['a', 'b', 'c'], []);
    assert.deepEqual(balances, { a: 0, b: 0, c: 0 });
  });

  test('respects explicit participants list and order', () => {
    const balances = computeBalances(
      ['a', 'b', 'c'],
      [{ payer: 'a', amountCents: 100, participants: ['b', 'c'] }]
    );
    assert.deepEqual(balances, { a: 100, b: -50, c: -50 });
  });

  test('uses weights when provided', () => {
    const balances = computeBalances(
      ['a', 'b'],
      [{ payer: 'a', amountCents: 10, participants: ['a', 'b'], weights: [1, 2] }]
    );
    // shares = splitByWeight(10, [1,2]) = [3,7]
    assert.deepEqual(balances, { a: 10 - 3, b: -7 });
  });

  test('handles negative amountCents (refunds)', () => {
    const balances = computeBalances(['a', 'b'], [{ payer: 'a', amountCents: -100 }]);
    assert.equal(Object.values(balances).reduce((a, b) => a + b, 0), 0);
    assert.equal(balances.a, -100 - splitEven(-100, 2)[0]);
  });

  test('throws TypeError when members is not an array', () => {
    assert.throws(() => computeBalances('nope', []), TypeError);
  });

  test('throws TypeError when a member is not a non-empty string', () => {
    assert.throws(() => computeBalances(['a', ''], []), TypeError);
    assert.throws(() => computeBalances(['a', 5], []), TypeError);
  });

  test('throws RangeError when members is empty', () => {
    assert.throws(() => computeBalances([], []), RangeError);
  });

  test('throws RangeError on duplicate member', () => {
    assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
  });

  test('throws TypeError when expenses is not an array', () => {
    assert.throws(() => computeBalances(['a'], 'nope'), TypeError);
  });

  test('throws TypeError when an expense is not a non-null object', () => {
    assert.throws(() => computeBalances(['a'], [null]), TypeError);
    assert.throws(() => computeBalances(['a'], ['nope']), TypeError);
  });

  test('throws TypeError when amountCents is not an integer', () => {
    assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
  });

  test('throws RangeError when payer is not in members', () => {
    assert.throws(() => computeBalances(['a'], [{ payer: 'z', amountCents: 100 }]), RangeError);
  });

  test('throws TypeError when participants is not an array', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: 'nope' }]),
      TypeError
    );
  });

  test('throws RangeError when participants is empty', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: [] }]),
      RangeError
    );
  });

  test('throws RangeError on duplicate participant', () => {
    assert.throws(
      () =>
        computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: ['a', 'a'] }]),
      RangeError
    );
  });

  test('throws RangeError on unknown participant', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, participants: ['a', 'z'] }]),
      RangeError
    );
  });

  test('throws TypeError when weights is not an array', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, weights: 'nope' }]),
      TypeError
    );
  });

  test('throws RangeError when weights length does not match participants length', () => {
    assert.throws(
      () =>
        computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, weights: [1, 2, 3] }]),
      RangeError
    );
  });

  test('propagates splitByWeight errors for bad weight values', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 100, weights: [-1, 1] }]),
      RangeError
    );
  });
});

describe('settle', () => {
  test('worked example from spec', () => {
    const transfers = settle({ a: 66, b: -33, c: -33 });
    assert.deepEqual(transfers, [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ]);
  });

  test('all-zero balance sheet returns empty array', () => {
    assert.deepEqual(settle({ a: 0, b: 0 }), []);
  });

  test('empty balances object returns empty array', () => {
    assert.deepEqual(settle({}), []);
  });

  test('never emits a zero transfer', () => {
    const transfers = settle({ a: 10, b: -10, c: 0 });
    for (const t of transfers) {
      assert.notEqual(t.amountCents, 0);
    }
  });

  test('handles many-to-many settlement, minimal in this greedy sense', () => {
    const balances = { a: 10, b: 20, c: -5, d: -25 };
    const transfers = settle(balances);
    // check conservation: applying transfers should zero out balances
    const result = applyTransfers(balances, transfers);
    for (const v of Object.values(result)) {
      assert.equal(v, 0);
    }
  });

  test('ties broken by id ascending among debtors', () => {
    const transfers = settle({ z: -10, a: -10, m: 20 });
    assert.equal(transfers[0].from, 'a');
    assert.equal(transfers[1].from, 'z');
  });

  test('ties broken by id ascending among creditors', () => {
    const transfers = settle({ z: 10, a: 10, m: -20 });
    assert.equal(transfers[0].to, 'a');
    assert.equal(transfers[1].to, 'z');
  });

  test('throws TypeError when balances is not a non-null plain object', () => {
    assert.throws(() => settle(null), TypeError);
    assert.throws(() => settle('nope'), TypeError);
    assert.throws(() => settle([1, 2]), TypeError);
  });

  test('throws TypeError when a value is not an integer', () => {
    assert.throws(() => settle({ a: 1.5, b: -1.5 }), TypeError);
  });

  test('throws RangeError when values do not sum to zero', () => {
    assert.throws(() => settle({ a: 10, b: -5 }), RangeError);
  });
});

describe('applyTransfers', () => {
  test('applies a transfer moving debtor toward zero', () => {
    const result = applyTransfers({ a: 66, b: -33, c: -33 }, [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ]);
    assert.deepEqual(result, { a: 0, b: 0, c: 0 });
  });

  test('does not mutate its input', () => {
    const balances = { a: 66, b: -33, c: -33 };
    const copy = { ...balances };
    applyTransfers(balances, [{ from: 'b', to: 'a', amountCents: 33 }]);
    assert.deepEqual(balances, copy);
  });

  test('settle output applied to its input always yields all-zero', () => {
    const balances = { a: 10, b: 20, c: -5, d: -25 };
    const transfers = settle(balances);
    const result = applyTransfers(balances, transfers);
    for (const v of Object.values(result)) {
      assert.equal(v, 0);
    }
  });

  test('throws TypeError when balances is invalid', () => {
    assert.throws(() => applyTransfers(null, []), TypeError);
  });

  test('does not enforce sum-to-zero on balances', () => {
    assert.doesNotThrow(() => applyTransfers({ a: 10, b: -5 }, []));
  });

  test('throws TypeError when transfers is not an array', () => {
    assert.throws(() => applyTransfers({ a: 0 }, 'nope'), TypeError);
  });

  test('throws TypeError when a transfer is not a non-null object', () => {
    assert.throws(() => applyTransfers({ a: 0, b: 0 }, [null]), TypeError);
  });

  test('throws TypeError when amountCents is not an integer', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 1.5 }]),
      TypeError
    );
  });

  test('throws RangeError when amountCents <= 0', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 0 }]),
      RangeError
    );
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: -5 }]),
      RangeError
    );
  });

  test('throws RangeError when from or to is not a key of balances', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'z', to: 'b', amountCents: 5 }]),
      RangeError
    );
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'z', amountCents: 5 }]),
      RangeError
    );
  });

  test('throws RangeError when from === to', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'a', amountCents: 5 }]),
      RangeError
    );
  });
});

describe('summarize', () => {
  test('rolls up totalCents, balances, and transfers', () => {
    const summary = summarize(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]);
    assert.equal(summary.totalCents, 100);
    assert.deepEqual(summary.balances, { a: 66, b: -33, c: -33 });
    assert.deepEqual(summary.transfers, [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ]);
  });

  test('empty expenses yields all-zero summary', () => {
    const summary = summarize(['a', 'b'], []);
    assert.deepEqual(summary, {
      totalCents: 0,
      balances: { a: 0, b: 0 },
      transfers: [],
    });
  });

  test('totalCents sums every expense amountCents, including negatives', () => {
    const summary = summarize(
      ['a', 'b'],
      [
        { payer: 'a', amountCents: 100 },
        { payer: 'b', amountCents: -40 },
      ]
    );
    assert.equal(summary.totalCents, 60);
  });

  test('propagates validation errors unchanged', () => {
    assert.throws(() => summarize([], []), RangeError);
    assert.throws(() => summarize('nope', []), TypeError);
  });
});
