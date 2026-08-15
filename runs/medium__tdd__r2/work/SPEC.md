# SPEC — `split-share` (task size: MEDIUM)

Implement an ESM module at `src/index.mjs` for Node 20+ with **no dependencies**.

All money is represented as **integer cents**. Never use floating point for money.

You must export three functions: `splitEven`, `splitByWeight`, `computeBalances`.

---

## 1. `export function splitEven(totalCents, parts)`

Split `totalCents` into exactly `parts` integer amounts summing **exactly** to `totalCents`.

1. `base = Math.floor(totalCents / parts)`
2. `remainder = totalCents - base * parts` — always an integer in `[0, parts)`.
3. Every element starts at `base`; the **first `remainder` elements** each get `+1`.

Errors, checked in this order:

| Condition | Error type |
|---|---|
| `totalCents` is not an integer | `TypeError` |
| `parts` is not an integer | `TypeError` |
| `parts < 1` | `RangeError` |

Examples: `splitEven(100, 3) → [34, 33, 33]`; `splitEven(-100, 3) → [-33, -33, -34]`;
`splitEven(0, 4) → [0, 0, 0, 0]`.

---

## 2. `export function splitByWeight(totalCents, weights)`

Split `totalCents` proportionally to `weights` using the **largest-remainder
(Hamilton) method**, with all arithmetic done in integers.

### Algorithm (must be followed exactly)

Let `W = sum(weights)` and `sign = totalCents < 0 ? -1 : 1`, `T = Math.abs(totalCents)`.

1. For each index `i`: `base[i] = Math.floor(T * weights[i] / W)`.
2. For each index `i`: `rem[i] = T * weights[i] - base[i] * W`  (an exact integer).
3. `leftover = T - sum(base)`.
4. Order the indices by `rem[i]` **descending**; break ties by **lower index first**.
5. The first `leftover` indices in that order each get `+1`.
6. Multiply every element by `sign` and return in **original index order**.

The result always sums exactly to `totalCents`. A weight of `0` receives `0`
(its `base` and `rem` are both `0`, so it can never win a leftover unit while any
positive-remainder index remains — and if it did tie at `rem = 0`, lower index wins).

### Errors, checked in this order

| Condition | Error type |
|---|---|
| `totalCents` is not an integer | `TypeError` |
| `weights` is not an array | `TypeError` |
| any element of `weights` is not an integer | `TypeError` |
| `weights` is empty | `RangeError` |
| any element of `weights` is negative | `RangeError` |
| `sum(weights) === 0` | `RangeError` |

### Worked examples

| call | result | why |
|---|---|---|
| `splitByWeight(100, [1, 1, 1])` | `[34, 33, 33]` | base `[33,33,33]`, rem `[1,1,1]`, leftover 1 → index 0 |
| `splitByWeight(100, [2, 1, 1])` | `[50, 25, 25]` | exact |
| `splitByWeight(10, [1, 2])` | `[3, 7]` | base `[3,6]`, rem `[1,2]`, leftover 1 → index 1 |
| `splitByWeight(100, [1, 0])` | `[100, 0]` | |
| `splitByWeight(-10, [1, 2])` | `[-3, -7]` | computed on `10` then negated |

---

## 3. `export function computeBalances(members, expenses)`

Compute each member's net position: **what they paid minus what they owe**.

### Inputs

- `members`: a non-empty array of unique, non-empty strings.
- `expenses`: an array (possibly empty) of objects:
  - `payer` — a string that must be in `members`.
  - `amountCents` — an integer (may be negative, representing a refund).
  - `participants` — **optional**. An array of unique strings, each in `members`,
    non-empty. When omitted, it defaults to the full `members` array **in the order
    given in `members`**.

### Algorithm

Start every member at `0`. For each expense:

1. Add `amountCents` to `balances[payer]`.
2. Compute `shares = splitEven(amountCents, participants.length)`.
3. Subtract `shares[i]` from `balances[participants[i]]`, matching the
   **order in which participants are listed** (this is what makes remainder
   assignment deterministic and observable).

### Returns

A plain object mapping **every** member id to its integer net balance. Members with
no activity are present with value `0`. The returned balances always sum to exactly `0`.

### Errors, checked in this order

| Condition | Error type |
|---|---|
| `members` is not an array | `TypeError` |
| any member is not a non-empty string | `TypeError` |
| `members` is empty | `RangeError` |
| `members` contains duplicates | `RangeError` |
| `expenses` is not an array | `TypeError` |
| an expense is not a non-null object | `TypeError` |
| `amountCents` is not an integer | `TypeError` |
| `payer` is not in `members` | `RangeError` |
| `participants` is present but not an array | `TypeError` |
| `participants` is present and empty | `RangeError` |
| `participants` contains a duplicate | `RangeError` |
| `participants` contains an id not in `members` | `RangeError` |

### Worked example

```js
computeBalances(['a', 'b', 'c'], [
  { payer: 'a', amountCents: 100 },
]);
// a paid 100; shares are splitEven(100,3) = [34,33,33] over ['a','b','c']
// → { a: 66, b: -33, c: -33 }
```
