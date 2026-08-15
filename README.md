# Does TDD really cost your coding agent 8×?

A from-scratch replication of the Thoughtworks *TDD-in-the-agent-loop* token experiment —
built to test one specific claim that has been circulating without its caveats, and to
count the bill two different ways.

The application generates its own report. Run the matrix, run the reporter, and you get a
self-contained HTML write-up at `app/public/index.html` backed by machine-readable JSON.

---

## The claim being tested

The number going around is real and it has a source: Birgitta Böckeler's
[*"TDD inside the agent loop — theater or actual value?"*](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html),
in Martin Fowler's *Exploring Gen AI* series. It is a small, honestly hedged experiment that
reports **three** multipliers, not one:

| task size | reported TDD token multiplier | runs behind it |
|---|---|---|
| small  | **8.50×** | 2 vs 2 |
| medium | **2.96×** | 6 vs 2 |
| large  | **4.89×** | 2 vs 2 |

Two things get lost in the retelling:

1. **"About 3× on bigger tasks" is the *medium* number.** The large task came in at 4.89× —
   close to double the figure usually quoted as the conservative case.
2. **Those totals weight a cache-read token exactly like a fresh one.** Böckeler says so
   directly — she sums `input + output + cacheRead + cacheWrite` per assistant turn and
   notes the factor "aren't a direct representation of actual cost." Every agent turn
   re-reads the accumulated context, and cache reads bill at a tenth of fresh input.

This repo re-runs the experiment's *shape* and reports both numbers: the study's raw-token
metric, and what the identical sessions actually cost.

---

## Design

Three arms build the same library from a **byte-identical specification**. The only variable
is the process instruction appended to the agent's system prompt.

| arm | instruction |
|---|---|
| `tdd` | Strict red-green-refactor. One behaviour per cycle; run the tests and observe failure before writing implementation code. |
| `spec-first` | Read the whole spec, design and implement in one pass, *then* write a test suite and fix what it catches. |
| `no-tests` | Implement straight from the spec, write no tests. The control that isolates the cost of *writing* tests from the cost of *ordering them first*. |
| `reference` | The author's own implementation, scored through the identical grader. No agent runs; it proves the tasks are solvable and marks the quality ceiling. |

Three task sizes mirror the original's small/medium/large shape — all greenfield, all pure
business logic, all integer-money arithmetic where correctness is unambiguous:

- **small** — `splitEven`: split cents into *n* parts with a deterministic remainder rule.
- **medium** — adds `splitByWeight` (largest-remainder apportionment) and `computeBalances`.
- **large** — adds `settle` (reduce a balance sheet to a minimal set of payments),
  `applyTransfers` and `summarize`. Six exported functions, layered validation rules.

### What is controlled

- **The grader is hidden.** A 65-test hold-out suite, written before any agent ran, never
  enters a run workspace. Tests the agent writes are never used for scoring, so no arm can
  optimise against the thing measuring it — and the `no-tests` arm isn't penalised for
  having none.
- **Identical inputs.** Same `SPEC.md`, same task prompt, same tool set, same permissions.
- **Fresh workspace per run**, containing only the spec and empty `src/` and `tests/`.
- **Hermetic runs.** No network, no package installs, no subagents (the `Task` tool is
  withheld, so nothing spawns children that would distort token counts).
- **No local config leakage.** `--safe-mode` disables this machine's `CLAUDE.md`, skills,
  plugins, hooks and MCP servers, so none of it lands in one arm and not another.
- **Cost computed from first principles.** `harness/pricing.mjs` prices the token
  breakdown at published rates rather than only trusting the CLI's total, so the
  raw-token/actual-cost gap is auditable.

---

## Running it

Requires Node 20+ and an authenticated `claude` CLI on `PATH`.

```bash
# 0. Prove the grader works before spending anything on agents
npm run verify

# 1. Score the reference implementation through the real harness (no tokens)
npm run reference

# 2. Run the matrix — 3 tasks x 3 arms x 2 repeats
npm run experiment          # macOS; wraps the run in `caffeinate -i`
npm run experiment:linux    # Linux equivalent via systemd-inhibit

# 3. Build the report
npm run report

# 4. Read it
npm run serve      # http://localhost:4173
# ...or just open app/public/index.html
```

Useful flags on `harness/run.mjs`:

```bash
--tasks small,medium,large      # which task sizes
--arms tdd,spec-first,no-tests  # which arms
--repeats 2                     # trials per cell
--model claude-sonnet-5         # generator model
--timeout-min 30                # per-trial wall-clock cap
--max-budget-usd 12             # per-trial spend cap — see the warning below
--retries 1                     # re-run a trial that fails environmentally
```

### Set the spend cap generously

`--max-budget-usd` is a hard kill, not a hint. Because the TDD arm is by far the most
expensive, a cap tight enough to bite will truncate *that arm and only that arm* — which
silently biases its multiplier **downward** and makes TDD look cheaper than it is. This
is exactly what happened during development at a $4 cap on the large task.

The harness detects it: a trial killed this way is marked
`truncated by --max-budget-usd cap`, excluded from averages, and retried. Set the cap well
above what the priciest arm needs (the default is $12; large-task TDD runs land near $4).

### Don't let the host sleep

The full matrix takes well over an hour, and a laptop that suspends mid-session kills the
run with `API Error: Your computer went to sleep mid-response` — which shows up as a
truncated workspace rather than an obvious crash. The `npm run experiment` script wraps
everything in `caffeinate -i` for this reason.

The harness defends against it regardless: every trial is validated (did the agent finish?
did it leave a `src/index.mjs`? did the API error?) and anything that fails is marked
`valid: false`, retried, and **excluded from every average**. Discarded runs stay in
`results/trials/` and are listed in the report's limitations, so a failed session can never
quietly become a data point.

**On the model default.** The default is `claude-sonnet-5`, chosen to mirror the original
study's Sonnet-tier generator and to make repeats affordable enough to show variance. Pass
`--model claude-opus-5` to run the same matrix on a frontier model — multipliers are not
portable across models, so if you plan to cite a number, generate it on the model you
actually use.

---

## Layout

```
spec/{small,medium,large}/SPEC.md   the identical brief each arm receives
holdout/*.test.mjs                  hidden grader, written before any run
reference/index.mjs                 human-written solution (quality ceiling)
harness/
  prompts.mjs                       the arm system prompts — the experiment's one variable
  run.mjs                           runs the matrix, captures usage, scores
  pricing.mjs                       published rates + cache multipliers
  report.mjs                        aggregates and renders the report
  verify-holdout.mjs                grader self-check
app/
  server.mjs                        serves the report + raw JSON
  public/index.html                 generated report
results/
  trials/*.json                     one record per run
  summary.json                      aggregate
runs/<runId>/                       workspace, event stream, TAP output per run
```

Every number in the report traces back to a file under `runs/` or `results/trials/`.

---

## Reading the results honestly

The report states its own limitations, and they are real. The short version:

- **Sample sizes are small.** Per-trial numbers are published alongside the means so the
  spread is visible. Re-running a small-n study does not make it a large-n study.
- **Greenfield, spec-complete business logic.** This is the condition most favourable to
  the spec-first arms and least like most real work.
- **Correctness is not design.** The hold-out suite measures whether the code does what the
  spec says. It says nothing about whether the code is pleasant to change — which is what
  TDD advocates actually claim it protects. (The original study did look at design quality
  with an LLM judge and mutation testing, and also found no difference.)
- **Nothing here argues against agents writing tests.** The `spec-first` arm writes a full
  suite. What is being priced is the *ceremony of ordering them first*, on a task where the
  design work was already done by the spec.
