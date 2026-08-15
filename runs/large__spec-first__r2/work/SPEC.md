# SPEC — `ledger` (task size: LARGE)

Implement an ESM module at `src/index.mjs` for Node 20+ with **no dependencies**.

All money is represented as **integer cents**. Never use floating point for money.

You must export six functions: `splitEven`, `splitByWeight`, `computeBalances`,
`settle`, `applyTransfers`, `summarize`.

---

## 1. `export function splitEven(totalCents, parts)`

Split `totalCents` into exactly `parts` integers summing **exactly** to `totalCents`.

1. `base = Math.floor(totalCents / parts)`
2. `remainder = totalCents - base * parts` — always an integer in `[0, parts)`.
3. Every element starts at `base`; the **first `remainder` elements** each get `+1`.

Errors in order: `totalCents` not an integer → `TypeError`; `parts` not an integer →
`TypeError`; `parts < 1` → `RangeError`.

Examples: `splitEven(100, 3) → [34, 33, 33]`; `splitEven(-100, 3) → [-33, -33, -34]`.

---

## 2. `export function splitByWeight(totalCents, weights)`

Largest-remainder (Hamilton) apportionment, in integer arithmetic.

Let `W = sum(weights)`, `sign = totalCents < 0 ? -1 : 1`, `T = Math.abs(totalCents)`.

1. `base[i] = Math.floor(T * weights[i] / W)`
2. `rem[i] = T * weights[i] - base[i] * W`
3. `leftover = T - sum(base)`
4. Order indices by `rem[i]` **descending**, ties broken by **lower index first**.
5. First `leftover` indices in that order get `+1`.
6. Multiply all by `sign`; return in **original index order**.

Errors in order: `totalCents` not an integer → `TypeError`; `weights` not an array →
`TypeError`; any weight not an integer → `TypeError`; `weights` empty → `RangeError`;
any weight negative → `RangeError`; `sum(weights) === 0` → `RangeError`.

Examples: `splitByWeight(100, [1,1,1]) → [34,33,33]`; `splitByWeight(10, [1,2]) → [3,7]`;
`splitByWeight(-10, [1,2]) → [-3,-7]`; `splitByWeight(100, [1,0]) → [100,0]`.

---

## 3. `export function computeBalances(members, expenses)`

Net position per member: **paid minus owed**.

- `members`: non-empty array of unique non-empty strings.
- `expenses`: array of `{ payer, amountCents, participants?, weights? }`.
  - `payer` must be in `members`.
  - `amountCents` is an integer (may be negative).
  - `participants` optional; defaults to all of `members` **in `members` order**.
    Must be non-empty, unique, all in `members`.
  - `weights` optional; when present it must be an array of the **same length as the
    effective participants list**, and shares are computed with
    `splitByWeight(amountCents, weights)` instead of `splitEven`.

For each expense: add `amountCents` to the payer's balance, then subtract
`shares[i]` from `participants[i]`, matching the **order participants are listed**.

Returns a plain object mapping **every** member to an integer balance (untouched
members are present as `0`). Balances always sum to exactly `0`.

Errors in order: `members` not an array → `TypeError`; a member not a non-empty string
→ `TypeError`; `members` empty → `RangeError`; duplicate member → `RangeError`;
`expenses` not an array → `TypeError`; an expense not a non-null object → `TypeError`;
`amountCents` not an integer → `TypeError`; `payer` not in `members` → `RangeError`;
`participants` present but not an array → `TypeError`; `participants` empty →
`RangeError`; duplicate participant → `RangeError`; unknown participant → `RangeError`;
`weights` present but not an array → `TypeError`; `weights.length` !== participants
length → `RangeError`.

Example:

```js
computeBalances(['a','b','c'], [{ payer: 'a', amountCents: 100 }]);
// → { a: 66, b: -33, c: -33 }
```

---

## 4. `export function settle(balances)`

Turn a balance sheet into a short list of payments.

### Input

`balances`: a plain object mapping member id → integer. It must sum to exactly `0`.

### Algorithm (must be followed exactly — a two-pointer greedy pass)

1. Build `debtors`  = entries with balance `< 0`, sorted by **balance ascending**
   (most negative first); ties broken by **member id ascending** (`<` on strings).
2. Build `creditors` = entries with balance `> 0`, sorted by **balance descending**
   (largest first); ties broken by **member id ascending**.
3. Walk both lists with an index into each, holding a mutable remaining amount for the
   current debtor and current creditor. At each step:
   - `amount = Math.min(remainingCredit, -remainingDebt)`
   - emit `{ from: debtorId, to: creditorId, amountCents: amount }`
   - reduce both remaining amounts by `amount`
   - advance the debtor pointer when its remaining amount reaches `0`; likewise the
     creditor pointer.
4. Stop when either list is exhausted.

Do **not** re-sort between steps. Never emit a transfer with `amountCents === 0`.

### Returns

An array of `{ from, to, amountCents }` with `amountCents` a positive integer.
An all-zero balance sheet returns `[]`.

### Errors in order

`balances` not a non-null plain object → `TypeError`; any value not an integer →
`TypeError`; values do not sum to `0` → `RangeError`.

### Worked example

```js
settle({ a: 66, b: -33, c: -33 });
// debtors sorted: b(-33), c(-33)  (tie on balance → id ascending)
// creditors sorted: a(66)
// → [ { from: 'b', to: 'a', amountCents: 33 },
//     { from: 'c', to: 'a', amountCents: 33 } ]
```

---

## 5. `export function applyTransfers(balances, transfers)`

Return a **new** balances object with the transfers applied. Must not mutate its input.

For each transfer: `result[from] += amountCents` and `result[to] -= amountCents`.
(A debtor paying moves their negative balance toward zero.)

Applying `settle(b)` to `b` must always yield an all-zero sheet.

Errors in order: `balances` invalid as in `settle` (except the sum-to-zero rule is
**not** enforced here) → `TypeError`; `transfers` not an array → `TypeError`; a transfer
not a non-null object → `TypeError`; `amountCents` not an integer → `TypeError`;
`amountCents <= 0` → `RangeError`; `from` or `to` not a key of `balances` →
`RangeError`; `from === to` → `RangeError`.

---

## 6. `export function summarize(members, expenses)`

Convenience roll-up. Returns:

```js
{
  totalCents,  // sum of every expense's amountCents
  balances,    // computeBalances(members, expenses)
  transfers,   // settle(balances)
}
```

Validation is delegated to the functions it calls — errors propagate unchanged.
An empty `expenses` array yields `{ totalCents: 0, balances: <all zero>, transfers: [] }`.
