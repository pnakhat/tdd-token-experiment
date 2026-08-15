# SPEC — `split-even` (task size: SMALL)

Implement an ESM module at `src/index.mjs` for Node 20+ with **no dependencies**.

All money is represented as **integer cents**. Never use floating point for money.

---

## `export function splitEven(totalCents, parts)`

Split `totalCents` into exactly `parts` integer amounts that sum **exactly** to `totalCents`.

### Algorithm (must be followed exactly)

1. `base = Math.floor(totalCents / parts)`
2. `remainder = totalCents - base * parts` — this is always an integer in `[0, parts)`.
3. Every returned element starts at `base`.
4. The **first `remainder` elements** (indices `0 .. remainder-1`) each get `+1`.

This rule applies unchanged to negative totals, because `Math.floor` rounds toward
negative infinity and therefore keeps `remainder` in `[0, parts)`.

### Returns

An `Array` of exactly `parts` integers, in index order.

### Errors

Throw in this order of checking:

| Condition | Error type | Message |
|---|---|---|
| `totalCents` is not an integer (includes `NaN`, `Infinity`, non-numbers, numeric strings) | `TypeError` | `"totalCents must be an integer"` |
| `parts` is not an integer | `TypeError` | `"parts must be an integer"` |
| `parts < 1` | `RangeError` | `"parts must be at least 1"` |

Only the error **type** is asserted by the grader; the message is checked only for
being a non-empty string.

### Worked examples

| `totalCents` | `parts` | result |
|---|---|---|
| `100` | `3` | `[34, 33, 33]` |
| `10` | `1` | `[10]` |
| `0` | `4` | `[0, 0, 0, 0]` |
| `-100` | `3` | `[-33, -33, -34]` |
| `7` | `7` | `[1, 1, 1, 1, 1, 1, 1]` |
| `5` | `10` | `[1, 1, 1, 1, 1, 0, 0, 0, 0, 0]` |

Note the negative case: `base = Math.floor(-100/3) = -34`, `remainder = -100 - (-34*3) = 2`,
so the first two elements are `-33` and the third stays `-34`.
