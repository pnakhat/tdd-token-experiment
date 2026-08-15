// HOLD-OUT SUITE — small task.
// Written before any agent ran; never visible inside a run workspace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEven } from '../src/index.mjs';

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('splits evenly when divisible', () => {
  assert.deepEqual(splitEven(90, 3), [30, 30, 30]);
});

test('remainder goes to the earliest elements', () => {
  assert.deepEqual(splitEven(100, 3), [34, 33, 33]);
  assert.deepEqual(splitEven(101, 3), [34, 34, 33]);
});

test('parts of 1 returns the whole amount', () => {
  assert.deepEqual(splitEven(10, 1), [10]);
  assert.deepEqual(splitEven(-7, 1), [-7]);
});

test('zero total', () => {
  assert.deepEqual(splitEven(0, 4), [0, 0, 0, 0]);
});

test('more parts than cents', () => {
  assert.deepEqual(splitEven(5, 10), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
});

test('negative totals follow the floor rule', () => {
  assert.deepEqual(splitEven(-100, 3), [-33, -33, -34]);
  assert.deepEqual(splitEven(-1, 3), [0, 0, -1]);
});

test('always returns exactly `parts` integers', () => {
  for (const parts of [1, 2, 3, 7, 12, 100]) {
    const out = splitEven(12345, parts);
    assert.equal(out.length, parts);
    assert.ok(out.every(Number.isInteger), 'all elements integer');
  }
});

test('always sums exactly to the total (property sweep)', () => {
  for (let total = -60; total <= 60; total++) {
    for (let parts = 1; parts <= 9; parts++) {
      assert.equal(sum(splitEven(total, parts)), total, `${total}/${parts}`);
    }
  }
});

test('elements differ by at most 1', () => {
  for (let total = -60; total <= 60; total++) {
    for (let parts = 1; parts <= 9; parts++) {
      const out = splitEven(total, parts);
      assert.ok(Math.max(...out) - Math.min(...out) <= 1, `${total}/${parts}`);
    }
  }
});

test('handles large values without float error', () => {
  const out = splitEven(1_000_000_007, 3);
  assert.equal(sum(out), 1_000_000_007);
  assert.ok(out.every(Number.isInteger));
});

test('TypeError on non-integer total', () => {
  for (const bad of [1.5, NaN, Infinity, '100', null, undefined, {}]) {
    assert.throws(() => splitEven(bad, 3), TypeError, `total=${String(bad)}`);
  }
});

test('TypeError on non-integer parts', () => {
  for (const bad of [1.5, NaN, Infinity, '3', null, undefined, {}]) {
    assert.throws(() => splitEven(100, bad), TypeError, `parts=${String(bad)}`);
  }
});

test('RangeError when parts < 1', () => {
  assert.throws(() => splitEven(100, 0), RangeError);
  assert.throws(() => splitEven(100, -2), RangeError);
});

test('thrown errors carry a non-empty message', () => {
  try {
    splitEven(100, 0);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(typeof e.message === 'string' && e.message.length > 0);
  }
});

test('does not mutate or alias its output', () => {
  const a = splitEven(100, 3);
  const b = splitEven(100, 3);
  a[0] = 999;
  assert.equal(b[0], 34);
});
