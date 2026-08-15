# I rebuilt the "TDD costs your agent 8× more tokens" experiment. The number is real. The metric isn't.

A statistic has been going around: **test-driven development costs your coding agent 8× more
tokens than skipping it, for no quality gain.** Usually no source, no link. Just the stat.

It's real, and it has a source: Birgitta Böckeler's
[*"TDD inside the agent loop — theater or actual value?"*](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html)
on Martin Fowler's site. It's a small, careful, honestly hedged experiment. It deserves
better than the way it's being quoted.

So I rebuilt it from scratch — same shape, three task sizes, a hidden grader — and counted
the bill two different ways. The code and every run record are
[in the repo](https://github.com/pnakhat/tdd-token-experiment).

---

## First: what the source actually says

The original reports **three** multipliers, not one:

| task size | reported TDD token multiplier | runs behind it |
|---|---|---|
| small | 8.50× | 2 vs 2 |
| medium | 2.96× | 6 vs 2 |
| large | 4.89× | 2 vs 2 |

Two things get lost in the retelling.

**The "~3× on bigger tasks" everyone repeats is the *medium* number.** The large task was
**4.89×** — nearly double the figure usually quoted as the conservative case.

**And the totals weight a cache-read token exactly like a fresh one.** Böckeler says so
herself: she sums `input + output + cacheRead + cacheWrite` across every assistant turn,
and notes the factor "aren't a direct representation of actual cost." That caveat is load
bearing, and it does not survive the trip to LinkedIn.

Here's why it matters. An agent turn re-reads its whole accumulated context. Those re-read
tokens get counted again in that turn's `cacheRead` — but they bill at **a tenth** of fresh
input. A workflow whose defining characteristic is *many short turns over a growing context*
is precisely the workflow that metric punishes hardest.

TDD is exactly that workflow.

---

## The setup

Three arms build the same library from a **byte-identical spec**. The only variable is the
process instruction appended to the agent's system prompt:

- **`tdd`** — strict red-green-refactor. One behaviour per cycle, tests actually run and
  observed failing before any implementation code.
- **`spec-first`** — read the whole spec, design and implement in one pass, *then* write a
  test suite and fix what it catches.
- **`no-tests`** — implement straight from the spec, write nothing else. The control that
  separates *the cost of tests* from *the cost of ordering them first*.

Three task sizes, all greenfield integer-money business logic where correctness is
unambiguous: splitting cents *n* ways (small), weighted apportionment and balance
computation (medium), a full settlement engine reducing a balance sheet to minimal payments
(large).

The controls that matter:

- **The grader is hidden.** A 65-test hold-out suite, written before any agent ran, never
  enters a run workspace. No arm can optimise against it, and `no-tests` isn't penalised for
  having none. Tests the agent writes are never used for scoring.
- **Fresh workspace per run**, containing only the spec and empty `src/` and `tests/`.
- **Hermetic**: no network, no installs, no subagents, no local `CLAUDE.md` or plugins.
- **Cost recomputed from the raw token breakdown** at published rates — cache reads at 0.1×,
  writes at 1.25×/2×. That independent figure matches the agent CLI's own accounting to
  **1.0000**, so the gap below isn't my arithmetic.
- A **human-written reference implementation** scored through the identical grader, proving
  the tasks are solvable and the suites aren't the bottleneck.

Runs are validity-checked: anything killed by a timeout, an API error, or a spend cap is
marked invalid, retried, and **excluded from every average**. (This mattered — see the
footnote on how I nearly fooled myself.)

---

## What I found

17 valid agent runs on Claude Sonnet 5. Total spend: $13.04.

| task | arm | raw tokens | cost | turns | test runs | src LOC | test LOC | hold-out |
|---|---|---|---|---|---|---|---|---|
| small | tdd | 785,296 | $0.484 | 33 | 15 | 18 | 42 | 100% |
| small | spec-first | 98,764 | $0.111 | 7 | 1 | 18 | 109 | 100% |
| small | no-tests | 78,542 | $0.080 | 5 | 0 | 18 | 0 | 100% |
| medium | tdd | 6,218,580 | $2.819 | 119 | 56 | 105 | 147 | 100% |
| medium | spec-first | 132,931 | $0.255 | 6 | 1 | 122 | 206 | 100% |
| medium | no-tests | 86,972 | $0.115 | 5 | 0 | 120 | 0 | 100% |
| large | tdd | 9,393,939 | $3.983 | 157 | 75 | 203 | 192 | 100% |
| large | spec-first | 165,262 | $0.466 | 7 | 1 | 205 | 394 | 100% |
| large | no-tests | 113,575 | $0.202 | 6 | 0 | 169 | 0 | 100% |

### Finding 1 — the metric overstates cost, and it gets worse as tasks grow

| task | raw-token multiplier | actual cost multiplier | overstatement |
|---|---|---|---|
| small | 10.0× | 6.0× | **1.65×** |
| medium | 71.5× | 24.6× | **2.90×** |
| large | 82.7× | 19.7× | **4.19×** |

*(TDD vs no-tests. Against spec-first the overstatement runs 1.8× / 4.2× / 6.6×.)*

The distortion isn't a rounding error, and it isn't constant. **It compounds with task
size** — because bigger tasks mean longer sessions, longer sessions mean more accumulated
context, and more accumulated context means the cache-read share of the total grows. On the
large task, the headline metric overstates the actual bill by more than **4×**.

Which means the number is least trustworthy exactly where people quote it as most
conservative.

### Finding 2 — the multiplier is a dial, and adherence turns it

My raw-token ratios (10× / 71× / 83×) run far above the published 8.50× / 2.96× / 4.89×.
That isn't a contradiction. It's the most useful thing I learned.

Böckeler reports her agents frequently **skipped or faked the red step** — TDD, she writes,
is "an uphill battle against the training data." A partially-followed TDD loop is a cheap
TDD loop.

My arm prompt pushes the other way: it forbids batching behaviours and demands an observed
test run in every red, green and refactor step. The runs bear that out — **75 test-runner
invocations** on the large task, against 1 for spec-first.

So the honest statement isn't "TDD costs N×." It's that **the multiplier is a function of
how strictly the loop is enforced**, and any single number quoted without the adherence
level attached is close to meaningless.

### Finding 3 — turn count is the whole mechanism

| task | TDD turns | spec-first turns |
|---|---|---|
| small | 33 | 7 |
| medium | 119 | 6 |
| large | 157 | 7 |

**Spec-first is roughly constant in turns regardless of task size. TDD is roughly linear in
the number of behaviours**, because the process *defines* a cycle per behaviour.

Then tokens grow faster than turns — 12× the raw usage across a 4.8× rise in turns — because
each additional turn re-reads a context that is itself bigger than it was last turn. That
compounding is the entire cost story.

### Finding 4 — TDD produced *less* test code

This one I did not expect. Averaged test-suite size:

| task | TDD | spec-first |
|---|---|---|
| small | 42 LOC | 109 LOC |
| medium | 147 LOC | 206 LOC |
| large | 192 LOC | 394 LOC |

The spec-first arm wrote **roughly twice the test code** — while spending a fraction of the
tokens. Writing tests first didn't buy more testing here. It bought the same implementation
and a thinner suite, more slowly.

That makes sense on reflection: a test-first loop writes the minimum test needed to drive the
next behaviour. An arm that writes tests against a finished implementation writes tests
against *the whole spec at once*.

### Finding 5 — no quality difference, but read this one carefully

Every arm passed **every** hold-out test on **every** task. 100% across the board.

I want to be precise about what that does and doesn't show. It means TDD bought **no
additional correctness** here. It does **not** mean TDD is no better in general — a grader
everyone aces cannot rank anyone. This is a ceiling effect, and the correct reading is *no
signal*, not *no difference*. A harder task set would be needed to say anything stronger.

The original study went further than I did — LLM-judged design quality and mutation
testing — and also found no meaningful difference, with non-TDD solutions ranked slightly
higher on design. That's a stronger result than mine on the quality question.

---

## What I think this actually means

TDD's value for a human is a **forcing function**. You can't write a test against an
interface that doesn't exist, so writing the test first forces you to decide what the
interface *is* before you're allowed to implement it. It buys design attention at the moment
it's cheapest. The suite is the residue; the sequencing is the mechanism.

An agent isn't under that constraint. It can hold the whole spec in context and emit a
coherent design in one pass. My experiment is built to make this visible: every arm got a
byte-identical `SPEC.md`. Under that condition the forcing function has nothing left to
force — **the design decision was already made by the spec**. Red-green-refactor adds turns,
not thinking.

Which points at the practical conclusion, and it isn't "never use TDD with an agent":

> **TDD and a good spec are substitutes for the same underlying good** — knowing what you're
> building before you build it.

If you already work spec-first, mandating red-green-refactor on top buys you turns. If
you're handing an agent a vague one-line prompt, the design pressure has to come from
*somewhere*, and a test-first loop is one of the few things that reliably supplies it.

And note what none of this touches: **the value of having tests at all.** The spec-first arm
wrote a full suite — a bigger one than TDD — for a fraction of the cost. Tests are regression
insurance for the *next* change, and this experiment only ever measures the first one.
Nothing here argues against your agent writing tests. It argues against paying for the
ceremony of ordering them first when the design work is already done.

---

## Limitations, stated plainly

- **Small n.** 17 agent runs. Agent runs are high-variance; per-run numbers are published in
  the repo so you can see the spread rather than trust my means. Re-running a small-n study
  does not make it a large-n study.
- **The quality result is a ceiling effect**, not a ranking. See Finding 5.
- **Greenfield, spec-complete business logic.** The condition most favourable to the
  spec-first arms, and not what most real work looks like.
- **Correctness isn't design.** My grader measures whether the code does what the spec says,
  not whether it's pleasant to change — which is what TDD advocates actually claim it
  protects.
- **One model, one agent.** Claude Sonnet 5 via the Claude Code CLI. Multipliers are not
  portable across harnesses; the original used a different agent.
- **My TDD arm is stricter than theirs**, which is why my multipliers are larger. That's
  Finding 2, not a defect — but it means my numbers and theirs aren't like-for-like.

### Footnote: two ways I nearly fooled myself

Both are in the repo's git history, and both are the reason the harness now validates every
run.

**The laptop went to sleep.** One medium run died with `API Error: Your computer went to
sleep mid-response`, leaving a truncated workspace that scored 0. Averaged in, it would have
looked like TDD catastrophically failing a task. It was macOS power management. The matrix
now runs under `caffeinate`.

**My spend cap censored the most expensive arm.** I set `--max-budget-usd 4` as a safety
rail. The large TDD runs hit it — and *only* the TDD runs, because they're the only ones
expensive enough to reach it. A cap tight enough to bite truncates the priciest arm and
silently biases its multiplier **downward**. I'd have published a number that made TDD look
cheaper than it is, for a reason that had nothing to do with TDD.

Both failure modes share a shape: an environmental problem wearing an experimental result's
clothes. If you run these things, validate every trial and exclude what didn't finish.

---

*Everything — specs, hidden grader, harness, per-run records, generated report — is at
[github.com/pnakhat/tdd-token-experiment](https://github.com/pnakhat/tdd-token-experiment).
`npm run verify && npm run reference` reproduces the grader check without spending a token.*
