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

  test('handles zero total', () => {
    assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
  });

  test('single part returns whole amount', () => {
    assert.deepEqual(splitEven(50, 1), [50]);
  });

  test('throws TypeError when totalCents is not an integer', () => {
    assert.throws(() => splitEven(1.5, 2), TypeError);
    assert.throws(() => splitEven('100', 2), TypeError);
    assert.throws(() => splitEven(NaN, 2), TypeError);
  });

  test('throws TypeError when parts is not an integer', () => {
    assert.throws(() => splitEven(100, 2.5), TypeError);
    assert.throws(() => splitEven(100, '2'), TypeError);
  });

  test('throws RangeError when parts < 1', () => {
    assert.throws(() => splitEven(100, 0), RangeError);
    assert.throws(() => splitEven(100, -1), RangeError);
  });

  test('validates totalCents before parts', () => {
    assert.throws(() => splitEven(1.5, 0), TypeError);
  });

  test('validates parts type before parts < 1', () => {
    assert.throws(() => splitEven(100, 2.5), TypeError);
  });

  test('sums always equal totalCents', () => {
    for (const [total, parts] of [[100, 3], [-100, 3], [7, 7], [-7, 4], [0, 5]]) {
      const parts_ = splitEven(total, parts);
      assert.equal(parts_.reduce((a, b) => a + b, 0), total);
      assert.equal(parts_.length, parts);
    }
  });
});

describe('splitByWeight', () => {
  test('example: equal weights with remainder', () => {
    assert.deepEqual(splitByWeight(100, [1, 1, 1]), [34, 33, 33]);
  });

  test('example: uneven weights', () => {
    assert.deepEqual(splitByWeight(10, [1, 2]), [3, 7]);
  });

  test('example: negative total mirrors positive split', () => {
    assert.deepEqual(splitByWeight(-10, [1, 2]), [-3, -7]);
  });

  test('example: zero-weight participant gets nothing', () => {
    assert.deepEqual(splitByWeight(100, [1, 0]), [100, 0]);
  });

  test('returns shares in original index order regardless of remainder order', () => {
    const shares = splitByWeight(100, [3, 1, 1, 1]);
    assert.equal(shares.reduce((a, b) => a + b, 0), 100);
    assert.equal(shares.length, 4);
  });

  test('ties in remainder broken by lower index first', () => {
    assert.deepEqual(splitByWeight(10, [1, 1, 1]), [4, 3, 3]);
  });

  test('throws TypeError when totalCents is not an integer', () => {
    assert.throws(() => splitByWeight(1.5, [1, 1]), TypeError);
  });

  test('throws TypeError when weights is not an array', () => {
    assert.throws(() => splitByWeight(100, 'x'), TypeError);
    assert.throws(() => splitByWeight(100, null), TypeError);
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

  test('throws RangeError when weights sum to 0', () => {
    assert.throws(() => splitByWeight(100, [0, 0]), RangeError);
  });

  test('error priority: totalCents before weights type', () => {
    assert.throws(() => splitByWeight(1.5, 'x'), TypeError);
  });

  test('error priority: weights type before element integer check', () => {
    assert.throws(() => splitByWeight(100, 'x'), TypeError);
  });

  test('error priority: element integer check before empty check (still empty wins if no elements)', () => {
    assert.throws(() => splitByWeight(100, []), RangeError);
  });

  test('error priority: empty check before negative check', () => {
    assert.throws(() => splitByWeight(100, []), RangeError);
  });

  test('error priority: negative check before sum-zero check', () => {
    assert.throws(() => splitByWeight(100, [-1, -1]), RangeError);
  });
});

describe('computeBalances', () => {
  test('example: single payer, default even split', () => {
    assert.deepEqual(
      computeBalances(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]),
      { a: 66, b: -33, c: -33 },
    );
  });

  test('untouched members present as 0', () => {
    const result = computeBalances(['a', 'b', 'c', 'd'], [{ payer: 'a', amountCents: 30, participants: ['a', 'b'] }]);
    assert.equal(result.c, 0);
    assert.equal(result.d, 0);
  });

  test('balances always sum to 0', () => {
    const result = computeBalances(
      ['a', 'b', 'c'],
      [
        { payer: 'a', amountCents: 100 },
        { payer: 'b', amountCents: 50, participants: ['b', 'c'] },
      ],
    );
    assert.equal(Object.values(result).reduce((a, b) => a + b, 0), 0);
  });

  test('empty expenses yields all-zero balances', () => {
    assert.deepEqual(computeBalances(['a', 'b'], []), { a: 0, b: 0 });
  });

  test('participants explicit subset in listed order', () => {
    const result = computeBalances(['a', 'b', 'c'], [
      { payer: 'a', amountCents: 10, participants: ['b', 'c'] },
    ]);
    assert.deepEqual(result, { a: 10, b: -5, c: -5 });
  });

  test('weights used instead of even split', () => {
    const result = computeBalances(['a', 'b'], [
      { payer: 'a', amountCents: 10, participants: ['a', 'b'], weights: [1, 2] },
    ]);
    assert.deepEqual(result, { a: 7, b: -7 });
  });

  test('negative amountCents supported', () => {
    const result = computeBalances(['a', 'b'], [{ payer: 'a', amountCents: -10 }]);
    assert.equal(Object.values(result).reduce((a, b) => a + b, 0), 0);
  });

  test('throws TypeError when members is not an array', () => {
    assert.throws(() => computeBalances('abc', []), TypeError);
  });

  test('throws TypeError when a member is not a non-empty string', () => {
    assert.throws(() => computeBalances(['a', ''], []), TypeError);
    assert.throws(() => computeBalances(['a', 1], []), TypeError);
  });

  test('throws RangeError when members is empty', () => {
    assert.throws(() => computeBalances([], []), RangeError);
  });

  test('throws RangeError on duplicate member', () => {
    assert.throws(() => computeBalances(['a', 'a'], []), RangeError);
  });

  test('throws TypeError when expenses is not an array', () => {
    assert.throws(() => computeBalances(['a'], 'x'), TypeError);
  });

  test('throws TypeError when an expense is not a non-null object', () => {
    assert.throws(() => computeBalances(['a'], [null]), TypeError);
    assert.throws(() => computeBalances(['a'], ['x']), TypeError);
  });

  test('throws TypeError when amountCents is not an integer', () => {
    assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 1.5 }]), TypeError);
    assert.throws(() => computeBalances(['a'], [{ payer: 'a', amountCents: 'x' }]), TypeError);
  });

  test('throws RangeError when payer is not in members', () => {
    assert.throws(() => computeBalances(['a'], [{ payer: 'b', amountCents: 10 }]), RangeError);
  });

  test('throws TypeError when participants present but not an array', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: 'x' }]),
      TypeError,
    );
  });

  test('throws RangeError when participants is empty', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: [] }]),
      RangeError,
    );
  });

  test('throws RangeError on duplicate participant', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'a'] }]),
      RangeError,
    );
  });

  test('throws RangeError on unknown participant', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: ['a', 'c'] }]),
      RangeError,
    );
  });

  test('throws TypeError when weights present but not an array', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, weights: 'x' }]),
      TypeError,
    );
  });

  test('throws RangeError when weights.length !== participants length', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, weights: [1] }]),
      RangeError,
    );
  });

  test('error priority: members array check before member string check', () => {
    assert.throws(() => computeBalances('abc', []), TypeError);
  });

  test('error priority: member string check before empty check', () => {
    assert.throws(() => computeBalances([1], []), TypeError);
  });

  test('error priority: empty check before duplicate check', () => {
    assert.throws(() => computeBalances([], []), RangeError);
  });

  test('error priority: expenses array check before expense object check', () => {
    assert.throws(() => computeBalances(['a'], 'nope'), TypeError);
  });

  test('error priority: amountCents check before payer check', () => {
    assert.throws(
      () => computeBalances(['a'], [{ payer: 'nope', amountCents: 1.5 }]),
      TypeError,
    );
  });

  test('error priority: payer check before participants check', () => {
    assert.throws(
      () => computeBalances(['a'], [{ payer: 'nope', amountCents: 10, participants: 'x' }]),
      RangeError,
    );
  });

  test('error priority: participants array check before empty check', () => {
    assert.throws(
      () => computeBalances(['a'], [{ payer: 'a', amountCents: 10, participants: 5 }]),
      TypeError,
    );
  });

  test('error priority: participants checks before weights checks', () => {
    assert.throws(
      () => computeBalances(['a', 'b'], [{ payer: 'a', amountCents: 10, participants: [], weights: 'x' }]),
      RangeError,
    );
  });
});

describe('settle', () => {
  test('worked example from spec', () => {
    assert.deepEqual(settle({ a: 66, b: -33, c: -33 }), [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ]);
  });

  test('all-zero balances returns empty array', () => {
    assert.deepEqual(settle({ a: 0, b: 0 }), []);
  });

  test('empty balances object returns empty array', () => {
    assert.deepEqual(settle({}), []);
  });

  test('never emits a zero amount transfer', () => {
    const result = settle({ a: 10, b: -10, c: 0 });
    for (const t of result) {
      assert.notEqual(t.amountCents, 0);
    }
  });

  test('debtors sorted ascending, ties by id ascending', () => {
    const result = settle({ x: 100, a: -50, b: -50 });
    assert.equal(result[0].from, 'a');
    assert.equal(result[1].from, 'b');
  });

  test('creditors sorted descending, ties by id ascending', () => {
    const result = settle({ a: 50, b: 50, x: -100 });
    assert.equal(result[0].to, 'a');
    assert.equal(result[1].to, 'b');
  });

  test('multi-way settlement produces minimal transfers, sums match balances', () => {
    const balances = { a: 100, b: -60, c: -40 };
    const result = settle(balances);
    const applied = applyTransfers(balances, result);
    for (const v of Object.values(applied)) {
      assert.equal(v, 0);
    }
  });

  test('applying settle(b) to b always yields all-zero sheet', () => {
    const balances = { a: 66, b: -33, c: -20, d: -13 };
    const transfers = settle(balances);
    const applied = applyTransfers(balances, transfers);
    for (const v of Object.values(applied)) assert.equal(v, 0);
  });

  test('throws TypeError when balances is not a non-null plain object', () => {
    assert.throws(() => settle(null), TypeError);
    assert.throws(() => settle('x'), TypeError);
    assert.throws(() => settle([1, 2]), TypeError);
  });

  test('throws TypeError when a value is not an integer', () => {
    assert.throws(() => settle({ a: 1.5, b: -1.5 }), TypeError);
  });

  test('throws RangeError when values do not sum to 0', () => {
    assert.throws(() => settle({ a: 10, b: -5 }), RangeError);
  });

  test('error priority: plain object check before integer check', () => {
    assert.throws(() => settle(null), TypeError);
  });

  test('error priority: integer check before sum check', () => {
    assert.throws(() => settle({ a: 1.5, b: 10 }), TypeError);
  });
});

describe('applyTransfers', () => {
  test('applies from += amount, to -= amount', () => {
    const result = applyTransfers({ a: 66, b: -33, c: -33 }, [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ]);
    assert.deepEqual(result, { a: 0, b: 0, c: 0 });
  });

  test('does not mutate input balances', () => {
    const input = { a: 66, b: -33, c: -33 };
    const copy = { ...input };
    applyTransfers(input, [{ from: 'b', to: 'a', amountCents: 33 }]);
    assert.deepEqual(input, copy);
  });

  test('does not enforce sum-to-zero on balances', () => {
    assert.doesNotThrow(() => applyTransfers({ a: 10, b: -5 }, []));
  });

  test('throws TypeError when balances is not a non-null plain object', () => {
    assert.throws(() => applyTransfers(null, []), TypeError);
    assert.throws(() => applyTransfers([1], []), TypeError);
  });

  test('throws TypeError when a balance value is not an integer', () => {
    assert.throws(() => applyTransfers({ a: 1.5 }, []), TypeError);
  });

  test('throws TypeError when transfers is not an array', () => {
    assert.throws(() => applyTransfers({ a: 0 }, 'x'), TypeError);
  });

  test('throws TypeError when a transfer is not a non-null object', () => {
    assert.throws(() => applyTransfers({ a: 0, b: 0 }, [null]), TypeError);
    assert.throws(() => applyTransfers({ a: 0, b: 0 }, ['x']), TypeError);
  });

  test('throws TypeError when amountCents is not an integer', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 1.5 }]),
      TypeError,
    );
  });

  test('throws RangeError when amountCents <= 0', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 0 }]),
      RangeError,
    );
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: -5 }]),
      RangeError,
    );
  });

  test('throws RangeError when from is not a key of balances', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'z', to: 'b', amountCents: 5 }]),
      RangeError,
    );
  });

  test('throws RangeError when to is not a key of balances', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'z', amountCents: 5 }]),
      RangeError,
    );
  });

  test('throws RangeError when from === to', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'a', amountCents: 5 }]),
      RangeError,
    );
  });

  test('error priority: balances shape check before transfers array check', () => {
    assert.throws(() => applyTransfers(null, 'x'), TypeError);
  });

  test('error priority: transfer object check before amountCents check', () => {
    assert.throws(() => applyTransfers({ a: 0, b: 0 }, ['x']), TypeError);
  });

  test('error priority: amountCents integer check before <= 0 check', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'b', amountCents: 1.5 }]),
      TypeError,
    );
  });

  test('error priority: amountCents <= 0 check before key checks', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'z', to: 'y', amountCents: -1 }]),
      RangeError,
    );
  });

  test('error priority: from key check before to key check', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'z', to: 'y', amountCents: 5 }]),
      RangeError,
    );
  });

  test('error priority: to key check before from===to check', () => {
    assert.throws(
      () => applyTransfers({ a: 0, b: 0 }, [{ from: 'a', to: 'a', amountCents: 5 }]),
      RangeError,
    );
  });
});

describe('summarize', () => {
  test('empty expenses yields totalCents 0, all-zero balances, no transfers', () => {
    assert.deepEqual(summarize(['a', 'b'], []), {
      totalCents: 0,
      balances: { a: 0, b: 0 },
      transfers: [],
    });
  });

  test('rolls up total, balances, and transfers', () => {
    const result = summarize(['a', 'b', 'c'], [{ payer: 'a', amountCents: 100 }]);
    assert.equal(result.totalCents, 100);
    assert.deepEqual(result.balances, { a: 66, b: -33, c: -33 });
    assert.deepEqual(result.transfers, [
      { from: 'b', to: 'a', amountCents: 33 },
      { from: 'c', to: 'a', amountCents: 33 },
    ]);
  });

  test('totalCents sums every expense including negative amounts', () => {
    const result = summarize(['a', 'b'], [
      { payer: 'a', amountCents: 100 },
      { payer: 'b', amountCents: -20 },
    ]);
    assert.equal(result.totalCents, 80);
  });

  test('propagates errors from computeBalances unchanged', () => {
    assert.throws(() => summarize([], []), RangeError);
    assert.throws(() => summarize(['a'], [{ payer: 'b', amountCents: 10 }]), RangeError);
    assert.throws(() => summarize('x', []), TypeError);
  });
});
