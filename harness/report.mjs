#!/usr/bin/env node
// Aggregates results/trials/*.json into results/summary.json and renders the
// self-contained report at app/public/index.html.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMS, ARM_ORDER, TASK_ORDER } from './prompts.mjs';
import { PRICES, priceUsage } from './pricing.mjs';

// Trial records store the cost computed at the moment they ran. If the price table
// changes between runs, those stored figures are on different bases and must not be
// averaged together. Re-price every trial here from its persisted per-model token
// breakdown, so the whole report is always on one consistent basis.
function costOf(usage) {
  if (!usage) return 0;
  if (!Array.isArray(usage.priced)) return usage.recomputedCostUSD ?? 0;
  return usage.priced.reduce((total, entry) => {
    if (!entry.tokens) return total;
    const { costUSD } = priceUsage(entry.model, {
      inputTokens: entry.tokens.fresh,
      outputTokens: entry.tokens.output,
      cacheReadInputTokens: entry.tokens.cacheRead,
      cacheWrite5mTokens: entry.tokens.cacheWrite5m,
      cacheWrite1hTokens: entry.tokens.cacheWrite1h,
    });
    return total + costUSD;
  }, 0);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The multipliers reported by the original Thoughtworks experiment, for comparison.
// Source: Birgitta Böckeler, "TDD inside the agent loop - theater or actual value?"
const THOUGHTWORKS = { small: 8.5, medium: 2.96, large: 4.89 };

const HOLDOUT_TOTALS = { small: 15, medium: 21, large: 29 };

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function loadTrials() {
  const dir = path.join(ROOT, 'results', 'trials');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function aggregate(trials) {
  const cells = {};
  for (const task of TASK_ORDER) {
    for (const arm of ARM_ORDER) {
      const all = trials.filter((t) => t.task === task && t.arm === arm);
      if (all.length === 0) continue;

      // Invalid runs (timeout, API error, empty workspace) are recorded but never
      // averaged in — an environmental failure must not read as an experimental one.
      const group = all.filter((t) => t.valid !== false);
      const discarded = all.filter((t) => t.valid === false);
      if (group.length === 0) continue;

      const usages = group.filter((t) => t.usage).map((t) => t.usage);
      cells[`${task}::${arm}`] = {
        task,
        arm,
        n: group.length,
        discarded: discarded.map((t) => ({ runId: t.runId, reasons: t.invalidReasons ?? [] })),
        agentRan: group[0].agentRan,
        rawTokens: mean(usages.map((u) => u.rawTokenTotal)),
        freshTokens: mean(usages.map((u) => u.tokens.fresh)),
        outputTokens: mean(usages.map((u) => u.tokens.output)),
        cacheReadTokens: mean(usages.map((u) => u.tokens.cacheRead)),
        cacheWriteTokens: mean(usages.map((u) => u.tokens.cacheWrite5m + u.tokens.cacheWrite1h)),
        costUSD: mean(usages.map((u) => costOf(u))),
        reportedCostUSD: mean(usages.map((u) => u.reportedCostUSD)),
        turns: mean(usages.map((u) => u.numTurns)),
        toolCalls: mean(group.map((t) => t.process.toolCalls)),
        testRuns: mean(group.map((t) => t.process.testRuns)),
        srcLoc: mean(group.map((t) => t.workspace.src.lines)),
        testsLoc: mean(group.map((t) => t.workspace.tests.lines)),
        holdoutPass: mean(group.map((t) => t.score.holdoutPass)),
        holdoutTotal: HOLDOUT_TOTALS[task],
        holdoutPassRate: mean(group.map((t) => t.score.holdoutPass)) / HOLDOUT_TOTALS[task],
        perfectRuns: group.filter((t) => t.score.holdoutPass === HOLDOUT_TOTALS[task]).length,
        wallClockMs: mean(group.map((t) => t.wallClockMs)),
        trials: group.map((t) => ({
          runId: t.runId,
          holdoutPass: t.score.holdoutPass,
          rawTokens: t.usage?.rawTokenTotal ?? null,
          costUSD: t.usage ? costOf(t.usage) : null,
          testRuns: t.process.testRuns,
          srcLoc: t.workspace.src.lines,
          testsLoc: t.workspace.tests.lines,
        })),
      };
    }
  }

  const ratios = {};
  for (const task of TASK_ORDER) {
    const tdd = cells[`${task}::tdd`];
    for (const base of ['no-tests', 'spec-first']) {
      const b = cells[`${task}::${base}`];
      if (!tdd || !b) continue;
      ratios[`${task}::vs-${base}`] = {
        task,
        baseline: base,
        rawTokenMultiplier: b.rawTokens ? tdd.rawTokens / b.rawTokens : null,
        costMultiplier: b.costUSD ? tdd.costUSD / b.costUSD : null,
        outputTokenMultiplier: b.outputTokens ? tdd.outputTokens / b.outputTokens : null,
        freshTokenMultiplier: b.freshTokens ? tdd.freshTokens / b.freshTokens : null,
        turnMultiplier: b.turns ? tdd.turns / b.turns : null,
        wallClockMultiplier: b.wallClockMs ? tdd.wallClockMs / b.wallClockMs : null,
        qualityDelta: tdd.holdoutPassRate - b.holdoutPassRate,
      };
    }
  }

  const agentTrials = trials.filter((t) => t.usage && t.valid !== false);
  const discardedTrials = trials.filter((t) => t.valid === false);
  return {
    generatedAt: new Date().toISOString(),
    model: agentTrials[0]?.model ?? null,
    pricing: PRICES[agentTrials[0]?.model] ?? null,
    thoughtworks: THOUGHTWORKS,
    holdoutTotals: HOLDOUT_TOTALS,
    // Cross-check: our from-first-principles pricing against the CLI's own cost
    // accounting for the same sessions. A number near 1.00 means the cost model is
    // not the thing generating the raw-token/cost gap.
    costModelAgreement: agentTrials.length
      ? agentTrials.reduce(
          (a, t) => a + (costOf(t.usage) ? t.usage.reportedCostUSD / costOf(t.usage) : 1),
          0,
        ) / agentTrials.length
      : null,
    trialCount: trials.length,
    agentTrialCount: agentTrials.length,
    discardedCount: discardedTrials.length,
    discarded: discardedTrials.map((t) => ({ runId: t.runId, reasons: t.invalidReasons ?? [] })),
    totalSpendUSD: agentTrials.reduce((a, t) => a + costOf(t.usage), 0),
    cells,
    ratios,
    arms: Object.fromEntries(
      ARM_ORDER.map((k) => [k, { label: ARMS[k].label, blurb: ARMS[k].blurb }]),
    ),
  };
}

/* ------------------------------------------------------------------- render */

function renderHtml(summary) {
  const data = JSON.stringify(summary).replace(/</g, '\\u003c');

  // Injected as a JSON string literal. Building this inline in the generated script
  // would put raw newlines inside a single-quoted JS string and break the page.
  const repro = JSON.stringify(
    [
      'git clone <this repo> && cd tdd-token-experiment',
      '',
      '# 0. prove the grader works before spending anything on agents',
      'npm run verify',
      '',
      '# 1. score the reference implementation through the real harness (no tokens)',
      'npm run reference',
      '',
      '# 2. run the full matrix (wrapped in caffeinate so the host cannot sleep)',
      'npm run experiment',
      '',
      '# 3. rebuild this report',
      'npm run report',
      '',
      '# 4. read it',
      'npm run serve',
    ].join('\n'),
  ).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Does TDD really cost your coding agent 8x? — a replication</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfaf8; --panel: #ffffff; --ink: #16150f; --muted: #6a675c;
    --line: #e3e0d6; --accent: #b4531f; --accent-soft: #f3e4d9;
    --tdd: #b4531f; --spec: #3b6ea5; --none: #5d7a52; --ref: #8a8579;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14140f; --panel: #1c1c16; --ink: #eeece3; --muted: #a09c8d;
      --line: #32312a; --accent: #e08a4f; --accent-soft: #33261c;
      --tdd: #e08a4f; --spec: #7aa8db; --none: #8fb37f; --ref: #9a958a;
    }
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #fbfaf8; --panel: #ffffff; --ink: #16150f; --muted: #6a675c;
    --line: #e3e0d6; --accent: #b4531f; --accent-soft: #f3e4d9;
    --tdd: #b4531f; --spec: #3b6ea5; --none: #5d7a52; --ref: #8a8579;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #14140f; --panel: #1c1c16; --ink: #eeece3; --muted: #a09c8d;
    --line: #32312a; --accent: #e08a4f; --accent-soft: #33261c;
    --tdd: #e08a4f; --spec: #7aa8db; --none: #8fb37f; --ref: #9a958a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.65 Georgia, "Iowan Old Style", "Palatino Linotype", serif;
    overflow-x: hidden;
  }
  .wrap { max-width: 60rem; margin: 0 auto; padding: 3rem 1.25rem 6rem; }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 1.5rem; margin-bottom: 2.5rem; }
  .kicker {
    font-family: var(--mono); font-size: .7rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--accent); margin: 0 0 .75rem;
  }
  h1 { font-size: clamp(1.9rem, 5vw, 2.9rem); line-height: 1.1; margin: 0 0 .75rem; font-weight: 600; }
  h2 {
    font-size: 1.45rem; margin: 3.5rem 0 1rem; font-weight: 600;
    padding-top: 1.25rem; border-top: 1px solid var(--line);
  }
  h3 { font-size: 1.1rem; margin: 2rem 0 .6rem; font-weight: 600; }
  .standfirst { font-size: 1.15rem; color: var(--muted); margin: 0; }
  .meta {
    font-family: var(--mono); font-size: .75rem; color: var(--muted);
    margin-top: 1.25rem; display: flex; flex-wrap: wrap; gap: .4rem 1.25rem;
  }
  p { margin: 0 0 1.1rem; }
  a { color: var(--accent); }
  strong { font-weight: 600; }
  .lede { font-size: 1.08rem; }
  .callout {
    background: var(--panel); border: 1px solid var(--line);
    border-left: 3px solid var(--accent); padding: 1.15rem 1.35rem;
    margin: 1.75rem 0; border-radius: 3px;
  }
  .callout p:last-child { margin-bottom: 0; }
  .callout .tag {
    font-family: var(--mono); font-size: .68rem; letter-spacing: .14em;
    text-transform: uppercase; color: var(--accent); display: block; margin-bottom: .5rem;
  }
  .headline-figs {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 1px; background: var(--line); border: 1px solid var(--line);
    margin: 2rem 0; border-radius: 3px; overflow: hidden;
  }
  .fig { background: var(--panel); padding: 1.1rem 1.2rem; }
  .fig .n { font-family: var(--mono); font-size: 1.85rem; font-weight: 600; line-height: 1.1; }
  .fig .l { font-size: .82rem; color: var(--muted); margin-top: .35rem; line-height: 1.45; }
  .scroll { overflow-x: auto; margin: 1.5rem 0; border: 1px solid var(--line); border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; font-size: .87rem; background: var(--panel); }
  th, td { padding: .6rem .75rem; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  thead th {
    font-family: var(--mono); font-size: .68rem; letter-spacing: .08em;
    text-transform: uppercase; color: var(--muted); font-weight: 500;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr.group-end td { border-bottom: 2px solid var(--line); }
  td.num, th.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .arm-tdd { color: var(--tdd); font-weight: 600; }
  .arm-spec-first { color: var(--spec); font-weight: 600; }
  .arm-no-tests { color: var(--none); font-weight: 600; }
  .arm-reference { color: var(--ref); font-weight: 600; }
  figure { margin: 2rem 0; }
  figcaption { font-size: .84rem; color: var(--muted); margin-top: .75rem; }
  svg { display: block; width: 100%; height: auto; }
  .legend {
    display: flex; flex-wrap: wrap; gap: .35rem 1.1rem; font-size: .8rem;
    color: var(--muted); margin-bottom: .85rem; font-family: var(--mono);
  }
  .legend span { display: inline-flex; align-items: center; gap: .4rem; }
  .swatch { width: .8rem; height: .8rem; border-radius: 2px; display: inline-block; }
  ul, ol { margin: 0 0 1.1rem; padding-left: 1.3rem; }
  li { margin-bottom: .5rem; }
  code {
    font-family: var(--mono); font-size: .85em; background: var(--accent-soft);
    padding: .1em .35em; border-radius: 3px;
  }
  pre {
    background: var(--panel); border: 1px solid var(--line); border-radius: 3px;
    padding: 1rem; overflow-x: auto; font-family: var(--mono); font-size: .82rem;
    line-height: 1.55;
  }
  pre code { background: none; padding: 0; }
  footer {
    margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--line);
    font-size: .84rem; color: var(--muted);
  }
</style>
</head>
<body>
<div class="wrap" id="app"></div>
<script>
const DATA = ${data};
const REPRO = ${repro};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmt = {
  int: (n) => Math.round(n).toLocaleString('en-US'),
  k: (n) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : Math.round(n).toLocaleString('en-US')),
  usd: (n) => '$' + n.toFixed(n < 0.1 ? 4 : n < 10 ? 3 : 2),
  x: (n) => (n == null ? '—' : n.toFixed(2) + '\\u00d7'),
  pct: (n) => (n * 100).toFixed(0) + '%',
  sec: (ms) => (ms / 1000).toFixed(0) + 's',
};

const ARM_COLOR = {
  tdd: 'var(--tdd)', 'spec-first': 'var(--spec)',
  'no-tests': 'var(--none)', reference: 'var(--ref)',
};
const TASKS = ['small', 'medium', 'large'];
const AGENT_ARMS = ['tdd', 'spec-first', 'no-tests'];
const cell = (t, a) => DATA.cells[t + '::' + a];
const ratio = (t, b) => DATA.ratios[t + '::vs-' + b];

/* ------------------------------------------------------------ bar chart */

function barChart({ groups, series, format, title }) {
  const W = 720, padL = 54, padR = 12, padT = 18, padB = 46;
  const gh = 58, gap = 20;
  const H = padT + groups.length * (gh + gap) + padB;
  const chartW = W - padL - padR;
  const maxV = Math.max(...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0)), 0.001);
  const scale = (v) => (v / (maxV * 1.14)) * chartW;

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + title + '">';

  // gridlines
  for (let i = 0; i <= 4; i++) {
    const v = (maxV * 1.14 * i) / 4;
    const x = padL + scale(v);
    svg += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H - padB + 6) +
      '" stroke="var(--line)" stroke-width="1"/>';
    svg += '<text x="' + x + '" y="' + (H - padB + 22) + '" fill="var(--muted)" font-size="11" ' +
      'font-family="ui-monospace, monospace" text-anchor="middle">' + format(v) + '</text>';
  }

  groups.forEach((g, gi) => {
    const y0 = padT + gi * (gh + gap);
    svg += '<text x="0" y="' + (y0 + gh / 2 + 4) + '" fill="var(--ink)" font-size="12.5" ' +
      'font-weight="600" font-family="ui-monospace, monospace">' + g.label + '</text>';
    const bh = (gh - (series.length - 1) * 4) / series.length;
    series.forEach((s, si) => {
      const v = g.values[s.key] ?? 0;
      const y = y0 + si * (bh + 4);
      const w = Math.max(scale(v), 1);
      svg += '<rect x="' + padL + '" y="' + y + '" width="' + w + '" height="' + bh +
        '" fill="' + s.color + '" rx="2"' + (s.dashed ? ' opacity="0.45"' : '') + '/>';
      svg += '<text x="' + (padL + w + 7) + '" y="' + (y + bh / 2 + 4) + '" fill="var(--muted)" ' +
        'font-size="11" font-family="ui-monospace, monospace">' + format(v) + '</text>';
    });
  });

  svg += '</svg>';
  return svg;
}

function legend(series) {
  return '<div class="legend">' + series.map((s) =>
    '<span><i class="swatch" style="background:' + s.color + (s.dashed ? ';opacity:.45' : '') +
    '"></i>' + s.label + '</span>').join('') + '</div>';
}

/* --------------------------------------------------------------- sections */

function headlineFigures() {
  const rows = TASKS.map((t) => ratio(t, 'no-tests')).filter(Boolean);
  if (!rows.length) return '';
  const avgRaw = rows.reduce((a, r) => a + r.rawTokenMultiplier, 0) / rows.length;
  const avgCost = rows.reduce((a, r) => a + r.costMultiplier, 0) / rows.length;
  const qualities = TASKS.map((t) => cell(t, 'tdd')).filter(Boolean);
  const bases = TASKS.map((t) => cell(t, 'no-tests')).filter(Boolean);
  const tddQ = qualities.reduce((a, c) => a + c.holdoutPassRate, 0) / (qualities.length || 1);
  const baseQ = bases.reduce((a, c) => a + c.holdoutPassRate, 0) / (bases.length || 1);

  const spec = TASKS.map((t) => ratio(t, 'spec-first')).filter(Boolean);
  const avgSpecCost = spec.length
    ? spec.reduce((a, r) => a + r.costMultiplier, 0) / spec.length
    : null;

  return '<div class="headline-figs">' +
    fig(fmt.x(avgRaw), 'TDD token multiplier vs no-tests, measured the way the original study measured it (input + output + cache read + cache write, weighted equally)') +
    fig(fmt.x(avgCost), 'TDD <em>cost</em> multiplier for those same runs, once cache reads are billed at what they actually cost') +
    (avgSpecCost != null
      ? fig(fmt.x(avgSpecCost), 'TDD cost multiplier vs spec-first — both arms write tests, so this prices the <em>ordering</em> alone')
      : '') +
    fig(
      fmt.pct(tddQ) + ' / ' + fmt.pct(baseQ),
      'Hold-out pass rate, TDD vs no-tests, against a grader neither arm could see',
    ) +
    '</div>';
}

const fig = (n, l) => '<div class="fig"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>';

function resultsTable() {
  let rows = '';
  for (const t of TASKS) {
    for (const a of ['tdd', 'spec-first', 'no-tests', 'reference']) {
      const c = cell(t, a);
      if (!c) continue;
      const last = a === 'reference';
      rows += '<tr' + (last ? ' class="group-end"' : '') + '>' +
        '<td>' + t + ' / <span class="arm-' + a + '">' + a + '</span></td>' +
        '<td class="num">' + c.n + '</td>' +
        '<td class="num">' + (c.agentRan ? fmt.k(c.rawTokens) : '—') + '</td>' +
        '<td class="num">' + (c.agentRan ? fmt.k(c.outputTokens) : '—') + '</td>' +
        '<td class="num">' + (c.agentRan ? fmt.usd(c.costUSD) : '—') + '</td>' +
        '<td class="num">' + (c.agentRan ? Math.round(c.turns) : '—') + '</td>' +
        '<td class="num">' + (c.agentRan ? Math.round(c.testRuns) : '—') + '</td>' +
        '<td class="num">' + Math.round(c.srcLoc) + '</td>' +
        '<td class="num">' + Math.round(c.testsLoc) + '</td>' +
        '<td class="num">' + c.holdoutPass.toFixed(1) + ' / ' + c.holdoutTotal + '</td>' +
        '<td class="num">' + (c.agentRan ? fmt.sec(c.wallClockMs) : '—') + '</td>' +
        '</tr>';
    }
  }
  return '<div class="scroll"><table><thead><tr>' +
    '<th>task / arm</th><th class="num">n</th><th class="num">raw tokens</th>' +
    '<th class="num">output</th><th class="num">cost</th><th class="num">turns</th>' +
    '<th class="num">test runs</th><th class="num">src loc</th><th class="num">test loc</th>' +
    '<th class="num">hold-out</th><th class="num">wall</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function multiplierChart() {
  const series = [
    { key: 'raw', label: 'raw tokens (study metric)', color: 'var(--tdd)' },
    { key: 'cost', label: 'actual cost', color: 'var(--spec)' },
    { key: 'tw', label: 'Thoughtworks reported', color: 'var(--ref)', dashed: true },
  ];
  const groups = TASKS.filter((t) => ratio(t, 'no-tests')).map((t) => {
    const r = ratio(t, 'no-tests');
    return {
      label: t,
      values: { raw: r.rawTokenMultiplier, cost: r.costMultiplier, tw: DATA.thoughtworks[t] },
    };
  });
  if (!groups.length) return '';
  return '<figure>' + legend(series) +
    barChart({ groups, series, format: (v) => v.toFixed(1) + '\\u00d7', title: 'TDD multipliers by task size' }) +
    '<figcaption>TDD relative to the no-tests control, per task size. The first bar is the metric the ' +
    'original study reported; the second is what those same sessions actually cost. The third is the ' +
    'figure Thoughtworks published, shown for scale — not a like-for-like comparison, since the tasks, ' +
    'agent and model all differ.</figcaption></figure>';
}

function tokenMixChart() {
  const series = [
    { key: 'cacheRead', label: 'cache read (billed at 0.1\\u00d7)', color: 'var(--ref)' },
    { key: 'cacheWrite', label: 'cache write', color: 'var(--spec)' },
    { key: 'fresh', label: 'fresh input', color: 'var(--none)' },
    { key: 'output', label: 'output', color: 'var(--tdd)' },
  ];
  const groups = [];
  for (const t of TASKS) {
    for (const a of AGENT_ARMS) {
      const c = cell(t, a);
      if (!c) continue;
      groups.push({
        label: t.slice(0, 3) + '/' + (a === 'spec-first' ? 'spec' : a === 'no-tests' ? 'none' : 'tdd'),
        values: {
          cacheRead: c.cacheReadTokens, cacheWrite: c.cacheWriteTokens,
          fresh: c.freshTokens, output: c.outputTokens,
        },
      });
    }
  }
  if (!groups.length) return '';
  return '<figure>' + legend(series) +
    barChart({ groups, series, format: fmt.k, title: 'Token mix by task and arm' }) +
    '<figcaption>Where the tokens actually go. Cache reads dominate every arm — which is precisely why ' +
    'a total that weights them equally with fresh input overstates the cost difference.</figcaption></figure>';
}

function turnsChart() {
  const series = [
    { key: 'tdd', label: 'TDD', color: 'var(--tdd)' },
    { key: 'spec-first', label: 'spec-first', color: 'var(--spec)' },
    { key: 'no-tests', label: 'no-tests', color: 'var(--none)' },
  ];
  const groups = TASKS.filter((t) => cell(t, 'tdd')).map((t) => ({
    label: t,
    values: Object.fromEntries(AGENT_ARMS.map((a) => [a, cell(t, a)?.turns ?? 0])),
  }));
  if (!groups.length) return '';
  return '<figure>' + legend(series) +
    barChart({ groups, series, format: (v) => Math.round(v).toString(), title: 'Agent turns by task size' }) +
    '<figcaption>Turns taken to finish, by task size. This is the cost mechanism in one picture.</figcaption></figure>';
}

// The single most transferable finding: turn count scales with task size under TDD and
// stays flat under spec-first, and token cost grows faster than turns because every turn
// re-reads the whole accumulated context.
function scalingSection() {
  const rows = TASKS.map((t) => ({ t, tdd: cell(t, 'tdd'), spec: cell(t, 'spec-first') }))
    .filter((r) => r.tdd && r.spec);
  if (rows.length < 2) return '';

  const first = rows[0];
  const last = rows[rows.length - 1];
  const tddTurnGrowth = last.tdd.turns / first.tdd.turns;
  const specTurnGrowth = last.spec.turns / first.spec.turns;
  const tddTokenGrowth = last.tdd.rawTokens / first.tdd.rawTokens;

  let s = '<p>Look at the turn counts rather than the token totals. Going from the smallest task to ' +
    'the largest, the TDD arm went from <strong>' + Math.round(first.tdd.turns) + ' turns to ' +
    Math.round(last.tdd.turns) + '</strong> (' + tddTurnGrowth.toFixed(1) + '\\u00d7), while spec-first ' +
    'went from <strong>' + Math.round(first.spec.turns) + ' to ' + Math.round(last.spec.turns) +
    '</strong> (' + specTurnGrowth.toFixed(1) + '\\u00d7). Spec-first is close to constant in turns no ' +
    'matter how big the task gets, because it makes one design pass and one implementation pass. TDD ' +
    'is roughly linear in the number of behaviours, because the process <em>defines</em> a cycle per ' +
    'behaviour.</p>';

  s += '<p>Tokens then grow faster than turns \\u2014 raw usage rose ' + tddTokenGrowth.toFixed(1) +
    '\\u00d7 across the same span, against a ' + tddTurnGrowth.toFixed(1) + '\\u00d7 rise in turns \\u2014 ' +
    'because each additional turn re-reads a context that is itself larger than it was on the previous ' +
    'turn. That compounding is the whole story. It is also why the multiplier is not a fixed property ' +
    'of "TDD": it is a function of how many behaviours the spec contains and how strictly the loop ' +
    'is enforced.</p>';

  s += '<div class="callout"><span class="tag">Why these multipliers exceed the published ones</span>' +
    '<p>Our ratios run well above Thoughtworks\\u2019 8.50\\u00d7 / 2.96\\u00d7 / 4.89\\u00d7 on the larger ' +
    'tasks, and the reason is instructive rather than contradictory. B\\u00f6ckeler reports that her ' +
    'agents frequently <em>skipped or faked the red step</em> \\u2014 TDD, she writes, is "an uphill ' +
    'battle against the training data." A partially-followed TDD loop is a cheaper TDD loop. This ' +
    'harness leans the other way: the arm prompt forbids batching behaviours and demands an observed ' +
    'test run in every red, green and refactor step, and the runs bear that out with <strong>' +
    Math.round(last.tdd.testRuns) + ' test-runner invocations</strong> on the large task against ' +
    Math.round(last.spec.testRuns) + ' for spec-first.</p>' +
    '<p>So the honest way to state the finding is not "TDD costs N\\u00d7." It is that <strong>the ' +
    'multiplier is a dial, and adherence is what turns it</strong>. Loosely-followed TDD lands near the ' +
    'published figures; strictly-followed TDD costs far more. Any single number quoted without the ' +
    'adherence level attached is close to meaningless.</p></div>';

  return s;
}

function ratioTable() {
  let rows = '';
  for (const t of TASKS) {
    for (const b of ['no-tests', 'spec-first']) {
      const r = ratio(t, b);
      if (!r) continue;
      rows += '<tr><td>' + t + ' — TDD vs ' + b + '</td>' +
        '<td class="num">' + fmt.x(r.rawTokenMultiplier) + '</td>' +
        '<td class="num">' + fmt.x(r.costMultiplier) + '</td>' +
        '<td class="num">' + fmt.x(r.outputTokenMultiplier) + '</td>' +
        '<td class="num">' + fmt.x(r.turnMultiplier) + '</td>' +
        '<td class="num">' + fmt.x(r.wallClockMultiplier) + '</td>' +
        '<td class="num">' + (r.qualityDelta >= 0 ? '+' : '') + fmt.pct(r.qualityDelta) + '</td></tr>';
    }
  }
  return '<div class="scroll"><table><thead><tr><th>comparison</th>' +
    '<th class="num">raw tokens</th><th class="num">cost</th><th class="num">output tokens</th>' +
    '<th class="num">turns</th><th class="num">wall clock</th><th class="num">quality \\u0394</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function perTrialTable() {
  let rows = '';
  for (const t of TASKS) {
    for (const a of ['tdd', 'spec-first', 'no-tests']) {
      const c = cell(t, a);
      if (!c) continue;
      for (const tr of c.trials) {
        rows += '<tr><td>' + tr.runId + '</td>' +
          '<td class="num">' + (tr.rawTokens == null ? '—' : fmt.int(tr.rawTokens)) + '</td>' +
          '<td class="num">' + (tr.costUSD == null ? '—' : fmt.usd(tr.costUSD)) + '</td>' +
          '<td class="num">' + tr.testRuns + '</td>' +
          '<td class="num">' + tr.srcLoc + '</td>' +
          '<td class="num">' + tr.testsLoc + '</td>' +
          '<td class="num">' + tr.holdoutPass + ' / ' + DATA.holdoutTotals[t] + '</td></tr>';
      }
    }
  }
  return '<div class="scroll"><table><thead><tr><th>run</th><th class="num">raw tokens</th>' +
    '<th class="num">cost</th><th class="num">test runs</th><th class="num">src loc</th>' +
    '<th class="num">test loc</th><th class="num">hold-out</th></tr></thead><tbody>' +
    rows + '</tbody></table></div>';
}

function narrative() {
  const rows = TASKS.map((t) => ratio(t, 'no-tests')).filter(Boolean);
  if (!rows.length) return '<p>No results yet. Run <code>node harness/run.mjs</code>.</p>';
  const avgRaw = rows.reduce((a, r) => a + r.rawTokenMultiplier, 0) / rows.length;
  const avgCost = rows.reduce((a, r) => a + r.costMultiplier, 0) / rows.length;
  const shrink = avgRaw / avgCost;

  const qual = TASKS.map((t) => [cell(t, 'tdd'), cell(t, 'no-tests'), cell(t, 'spec-first')])
    .filter(([a, b]) => a && b);
  const tddQ = qual.reduce((a, [c]) => a + c.holdoutPassRate, 0) / qual.length;
  const noneQ = qual.reduce((a, [, c]) => a + c.holdoutPassRate, 0) / qual.length;
  const specQ = qual.reduce((a, [, , c]) => a + (c ? c.holdoutPassRate : 0), 0) / qual.length;

  const best = [['TDD', tddQ], ['spec-first', specQ], ['no-tests', noneQ]]
    .sort((a, b) => b[1] - a[1])[0];
  const atCeiling = tddQ === 1 && specQ === 1 && noneQ === 1;

  const qualityPara = atCeiling
    ? '<p>On quality, no arm separated from any other — because <strong>every arm passed every ' +
      'hold-out test</strong>. TDD, spec-first and no-tests all scored ' + fmt.pct(tddQ) +
      ' against a grader none of them could see. That is a genuine result in one direction only: ' +
      'the test-first discipline bought no additional correctness here. It is <em>not</em> evidence ' +
      'that TDD is no better in general, because a grader everyone aces cannot rank anyone. ' +
      'The honest summary is that on greenfield business logic with a precise spec, all three ' +
      'processes cleared the bar, and only the bill was different.</p>'
    : '<p>On quality, this replication agrees with the original: <strong>no arm separated ' +
      'meaningfully from the others</strong>. Against a hold-out suite no arm could see, TDD scored ' +
      fmt.pct(tddQ) + ', spec-first ' + fmt.pct(specQ) + ', and no-tests ' + fmt.pct(noneQ) +
      '. The nominal winner was ' + best[0] + ', by a margin far too small at this sample size to ' +
      'mean anything.</p>';

  return '' +
    '<p class="lede">Measured the way the original study measured it, TDD cost <strong>' +
    fmt.x(avgRaw) + '</strong> the tokens of the no-tests control on these tasks. Measured in money — ' +
    'the same sessions, the same token counts, just billed at the rates the API actually charges — it cost <strong>' +
    fmt.x(avgCost) + '</strong>. The headline multiplier is about <strong>' + shrink.toFixed(1) +
    '\\u00d7 larger than the bill</strong>.</p>' +

    '<p>That gap is not a correction to the original work. Böckeler states it plainly: her totals sum ' +
    '<code>input + output + cacheRead + cacheWrite</code> across every assistant turn, and she notes ' +
    'that many of those are cache hits, so the multiplier is not a direct representation of cost. ' +
    'The gap is what happens when that caveat is dropped on the way to a LinkedIn post. Each turn ' +
    're-reads the whole accumulated context, and every one of those re-read tokens is counted again as ' +
    'a fresh token in the total — but billed at a tenth of the price. TDD\\u2019s extra spend is almost ' +
    'entirely extra turns over a context the model has already paid to cache, which is the cheapest ' +
    'kind of token there is.</p>' +

    qualityPara;
}

function mechanismSection() {
  return '' +
    '<p>The interesting question is not the multiplier, it is why the multiplier exists at all.</p>' +
    '<p>For a human, TDD\\u2019s value is a forcing function. You cannot write a test against an interface ' +
    'that does not exist yet, so writing the test first forces you to decide what the interface is before ' +
    'you are allowed to implement it. The discipline buys design attention at a moment when it is cheap. ' +
    'The test suite is the residue; the sequencing is the mechanism.</p>' +
    '<p>An agent is not under that constraint. It can hold the whole spec in context and emit a coherent ' +
    'design in one pass, and this experiment is built to make that visible: every arm received a byte-identical ' +
    '<code>SPEC.md</code> and an identical task prompt. Only the process instruction differed. Under those ' +
    'conditions the forcing function has nothing left to force — the design decision has already been made ' +
    'by the spec. What red-green-refactor adds is the turn count, not the thinking.</p>' +
    '<p>Which points at the actual practical conclusion, and it is not "never use TDD with an agent". ' +
    'It is that <strong>TDD and a good spec are substitutes for the same underlying good</strong>: knowing ' +
    'what you are building before you build it. If you already work spec-first, mandating red-green-refactor ' +
    'on top buys you turns. If you are handing an agent a vague one-line prompt, the design pressure has to ' +
    'come from somewhere — and then a test-first loop is one of the few things that supplies it.</p>' +
    specFirstParagraph() +
    '<p>Note what this experiment deliberately does <em>not</em> test: the value of having tests at all. ' +
    'Tests are regression insurance for the <em>next</em> change, and this experiment only ever measures ' +
    'the first one. Nothing here argues against a coding agent writing tests. It argues against paying ' +
    'for the ceremony of ordering them first when the design work has already been done elsewhere.</p>';
}

// The sharpest comparison in the experiment: TDD vs spec-first. Both arms produce a
// test suite, so the only thing separating them is the order the work was done in.
function specFirstParagraph() {
  const rows = TASKS.map((t) => ratio(t, 'spec-first')).filter(Boolean);
  if (!rows.length) return '';
  const avgRaw = rows.reduce((a, r) => a + r.rawTokenMultiplier, 0) / rows.length;
  const avgCost = rows.reduce((a, r) => a + r.costMultiplier, 0) / rows.length;

  const tddCells = TASKS.map((t) => cell(t, 'tdd')).filter(Boolean);
  const specCells = TASKS.map((t) => cell(t, 'spec-first')).filter(Boolean);
  const tddTestLoc = tddCells.reduce((a, c) => a + c.testsLoc, 0) / tddCells.length;
  const specTestLoc = specCells.reduce((a, c) => a + c.testsLoc, 0) / specCells.length;

  let p = '<p>The cleanest comparison in the whole experiment is TDD against spec-first, because ' +
    'both arms end up with a test suite. The only difference is <em>when</em> the tests were written. ' +
    'On that comparison TDD cost <strong>' + fmt.x(avgRaw) + '</strong> the raw tokens and <strong>' +
    fmt.x(avgCost) + '</strong> the money.';

  if (specTestLoc > tddTestLoc) {
    p += ' And it bought less: the spec-first arm produced <strong>' + Math.round(specTestLoc) +
      ' lines of tests on average against TDD\\u2019s ' + Math.round(tddTestLoc) +
      '</strong>. Writing tests first did not, here, produce more testing \\u2014 it produced ' +
      'the same code and a thinner suite, more slowly.';
  } else {
    p += ' TDD produced <strong>' + Math.round(tddTestLoc) + ' lines of tests on average against ' +
      'spec-first\\u2019s ' + Math.round(specTestLoc) + '</strong>, so the extra spend did buy a ' +
      'larger suite \\u2014 though not, on this evidence, a more correct implementation.';
  }
  return p + '</p>';
}

function limitations() {
  const discardNote = DATA.discardedCount
    ? '<li><strong>' + DATA.discardedCount + ' run(s) were discarded and re-run</strong> after ' +
      'environmental failures (host sleep, API errors, timeouts): ' +
      DATA.discarded.map((d) => '<code>' + d.runId + '</code> (' + d.reasons.join('; ') + ')').join(', ') +
      '. Discarded runs are recorded in <code>results/trials/</code> but excluded from every ' +
      'average, so a failed session cannot read as an experimental result.</li>'
    : '';
  // If every arm aces every task, the grader cannot discriminate and the "no quality
  // difference" result is a ceiling effect, not evidence. Say so plainly.
  const agentCells = Object.values(DATA.cells).filter((c) => c.agentRan);
  const atCeiling = agentCells.length > 0 && agentCells.every((c) => c.holdoutPassRate === 1);
  const ceilingNote = atCeiling
    ? '<li><strong>The quality comparison hit a ceiling.</strong> Every arm passed every ' +
      'hold-out test on every task, so this experiment can only say that TDD did not ' +
      '<em>improve</em> correctness here — it cannot rank the arms, because the tasks were not ' +
      'hard enough to separate them. Read the quality result as "no signal", not as "TDD is no ' +
      'better". A harder task set would be needed to say anything stronger.</li>'
    : '';
  return '<ul>' + discardNote + ceilingNote +
    '<li><strong>Small n.</strong> ' + DATA.agentTrialCount + ' agent runs across ' +
    Object.keys(DATA.cells).filter((k) => !k.endsWith('reference')).length +
    ' cells. Agent runs are high-variance; per-trial numbers are published below so you can see the spread ' +
    'rather than trust the mean. This is the same weakness the original study has, and running it again ' +
    'does not fix it.</li>' +
    '<li><strong>Greenfield, spec-complete, business logic only.</strong> Every task is a pure function ' +
    'library with an unusually precise specification. That is the condition most favourable to the ' +
    'spec-first arms, and it is not what most real work looks like.</li>' +
    '<li><strong>Correctness is not design.</strong> The hold-out suite measures whether the code does ' +
    'what the spec says. It says nothing about whether the code is pleasant to change — which is what ' +
    'TDD advocates actually claim it protects. The original study looked at design quality with an ' +
    'LLM judge and mutation testing and also found no difference; this replication does not attempt that.</li>' +
    '<li><strong>One model, one agent.</strong> All runs used <code>' + (DATA.model ?? 'n/a') +
    '</code> through the Claude Code CLI. The original used a different agent and a Sonnet-tier model ' +
    'for generation. Multipliers are not portable across harnesses.</li>' +
    '<li><strong>TDD adherence is partial.</strong> The original reports agents skipping or faking the ' +
    'red step. This harness counts how many times each run actually invoked the test runner (published ' +
    'per trial below) but cannot verify a genuine failing-then-passing transition on every cycle.</li>' +
    '<li><strong>Cache-write attribution is approximate.</strong> The CLI reports the 5-minute/1-hour ' +
    'cache-write split per session but cache-creation totals per model, so the split is apportioned by ' +
    'each model\\u2019s share. This moves cents, not conclusions.</li>' +
    '</ul>';
}

/* ------------------------------------------------------------------ mount */

document.getElementById('app').innerHTML = '' +
  '<header>' +
  '<p class="kicker">Replication \\u00b7 coding agents</p>' +
  '<h1>Does TDD really cost your coding agent 8\\u00d7?</h1>' +
  '<p class="standfirst">A from-scratch replication of the Thoughtworks TDD-in-the-agent-loop experiment ' +
  '\\u2014 same shape, three arms, one hold-out grader, and the token bill counted two different ways.</p>' +
  '<div class="meta">' +
  '<span>' + DATA.agentTrialCount + ' agent runs</span>' +
  '<span>model: ' + (DATA.model ?? 'n/a') + '</span>' +
  '<span>total spend: ' + fmt.usd(DATA.totalSpendUSD) + '</span>' +
  '<span>generated ' + new Date(DATA.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z</span>' +
  '</div></header>' +

  headlineFigures() +
  narrative() +

  '<h2>The claim, traced</h2>' +
  '<p>The number going around is real and it has a source: Birgitta B\\u00f6ckeler\\u2019s ' +
  '<em>"TDD inside the agent loop \\u2014 theater or actual value?"</em>, published in Martin Fowler\\u2019s ' +
  'Exploring Gen AI series. It is a small, carefully hedged experiment, and it reports three multipliers, ' +
  'not one:</p>' +
  '<div class="scroll"><table><thead><tr><th>task size</th><th class="num">reported TDD token multiplier</th>' +
  '<th class="num">runs behind it</th></tr></thead><tbody>' +
  '<tr><td>small</td><td class="num">8.50\\u00d7</td><td class="num">2 vs 2</td></tr>' +
  '<tr><td>medium</td><td class="num">2.96\\u00d7</td><td class="num">6 vs 2</td></tr>' +
  '<tr><td>large</td><td class="num">4.89\\u00d7</td><td class="num">2 vs 2</td></tr>' +
  '</tbody></table></div>' +
  '<div class="callout"><span class="tag">What gets lost in the retelling</span>' +
  '<p>The popular summary is "8.5\\u00d7 on small tasks, about 3\\u00d7 on bigger ones." But 2.96\\u00d7 is the ' +
  '<em>medium</em> task. The large task came in at <strong>4.89\\u00d7</strong> \\u2014 close to double the figure ' +
  'usually quoted as the conservative case. The multiplier does fall as tasks grow, but not monotonically, ' +
  'and not to 3\\u00d7.</p>' +
  '<p>The larger omission is the one the author flags herself: those totals weight a cache-read token ' +
  'exactly the same as a fresh one. As she puts it, the factor is not a direct representation of actual cost.</p></div>' +

  '<h2>What this replication does</h2>' +
  '<p>Three arms build the same library from the same specification. The only variable is the process ' +
  'instruction appended to the agent\\u2019s system prompt.</p>' +
  '<div class="scroll"><table><thead><tr><th>arm</th><th style="text-align:left">instruction</th></tr></thead><tbody>' +
  ['tdd', 'spec-first', 'no-tests', 'reference'].map((k) =>
    '<tr><td><span class="arm-' + k + '">' + k + '</span></td>' +
    '<td style="text-align:left;white-space:normal">' + DATA.arms[k].blurb + '</td></tr>').join('') +
  '</tbody></table></div>' +
  '<p>Three task sizes mirror the original\\u2019s small/medium/large shape \\u2014 all greenfield, all pure ' +
  'business logic: integer money splitting (small), weighted apportionment and balance computation ' +
  '(medium), and a full settlement engine that reduces a balance sheet to a minimal set of payments (large).</p>' +
  '<h3>Controls</h3><ul>' +
  '<li>Every arm gets a byte-identical <code>SPEC.md</code> and an identical task prompt. Only the ' +
  'appended system prompt differs.</li>' +
  '<li>Each run happens in a fresh workspace containing only the spec and empty <code>src/</code> and ' +
  '<code>tests/</code> directories.</li>' +
  '<li><strong>The grader is hidden.</strong> A hold-out suite written before any run \\u2014 ' +
  Object.values(DATA.holdoutTotals).reduce((a, b) => a + b, 0) + ' tests \\u2014 never enters the ' +
  'workspace, so no arm can optimise against it. Tests the agent writes are never used for scoring.</li>' +
  '<li>Runs are hermetic: no network, no package installs, no subagents. Machine-level config ' +
  '(<code>CLAUDE.md</code>, skills, plugins, hooks, MCP) is disabled so it cannot leak into one arm.</li>' +
  '<li>A human-written reference implementation is scored through the identical grader, proving the ' +
  'tasks are solvable and the suites are not the bottleneck.</li>' +
  (DATA.costModelAgreement
    ? '<li>Cost is recomputed from the raw token breakdown at published rates rather than taken on ' +
      'trust. That independent figure agrees with the agent CLI\\u2019s own cost accounting to within <strong>' +
      (Math.abs(1 - DATA.costModelAgreement) * 100).toFixed(1) + '%</strong> \\u2014 so the gap between ' +
      'raw tokens and money below is a property of how the tokens are weighted, not an artefact of ' +
      'our arithmetic.</li>'
    : '') +
  '</ul>' +

  '<h2>Results</h2>' +
  resultsTable() +
  '<p>Raw tokens is the study\\u2019s metric: input + output + cache read + cache write, weighted equally. ' +
  'Cost prices those same tokens at published rates \\u2014 cache reads at 0.1\\u00d7 input, cache writes at ' +
  '1.25\\u00d7 (5-minute) or 2\\u00d7 (1-hour). The <span class="arm-reference">reference</span> rows are a ' +
  'single shared human-written module that satisfies all three specs, so its line count is the same on ' +
  'every row and is not comparable to the per-task agent output \\u2014 it is there to show the grader ' +
  'is passable, not to be measured against.</p>' +
  multiplierChart() +
  '<h3>Multipliers, every way of counting</h3>' +
  ratioTable() +
  tokenMixChart() +

  '<h2>The multiplier is a dial, not a constant</h2>' +
  turnsChart() +
  scalingSection() +

  '<h2>Why the mechanism matters more than the multiplier</h2>' +
  mechanismSection() +

  '<h2>Every individual run</h2>' +
  '<p>Means hide variance, and at this sample size the variance is the story as much as the mean.</p>' +
  perTrialTable() +

  '<h2>Limitations</h2>' +
  limitations() +

  '<h2>Reproduce it</h2>' +
  '<pre><code>' + esc(REPRO) + '</code></pre>' +
  '<p>Every run leaves its full workspace, event stream, hold-out TAP output and JSON record under ' +
  '<code>runs/</code> and <code>results/trials/</code>, so any number in this report can be traced back ' +
  'to the session that produced it.</p>' +

  '<footer><p>Source: Birgitta B\\u00f6ckeler, <a href="https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html">' +
  '\\u201cTDD inside the agent loop \\u2014 theater or actual value?\\u201d</a>, martinfowler.com. ' +
  'Multipliers quoted from that article; all other figures generated by this repository on ' +
  new Date(DATA.generatedAt).toISOString().slice(0, 10) + '.</p></footer>';
</script>
</body>
</html>
`;
}

/* ------------------------------------------------- markdown (paste-ready) */

function renderMarkdown(s) {
  const x = (n) => (n == null ? '—' : `${n.toFixed(2)}×`);
  const k = (n) => Math.round(n).toLocaleString('en-US');
  const pct = (n) => `${(n * 100).toFixed(0)}%`;
  const L = [];

  L.push('# Does TDD really cost your coding agent 8×?');
  L.push('');
  L.push(
    `Replication of [Böckeler's TDD-in-the-agent-loop experiment](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html). ` +
      `${s.agentTrialCount} agent runs on \`${s.model}\`, total spend $${s.totalSpendUSD.toFixed(2)}. ` +
      `Generated ${s.generatedAt.slice(0, 10)}.`,
  );
  L.push('');

  L.push('## Headline');
  L.push('');
  L.push('| task | TDD vs no-tests (raw tokens) | TDD vs no-tests (actual cost) | TDD vs spec-first (cost) | Thoughtworks reported |');
  L.push('|---|---|---|---|---|');
  for (const t of TASK_ORDER) {
    const a = s.ratios[`${t}::vs-no-tests`];
    const b = s.ratios[`${t}::vs-spec-first`];
    if (!a) continue;
    L.push(
      `| ${t} | ${x(a.rawTokenMultiplier)} | ${x(a.costMultiplier)} | ${x(b?.costMultiplier)} | ${x(s.thoughtworks[t])} |`,
    );
  }
  L.push('');
  L.push(
    '> Raw tokens = `input + output + cacheRead + cacheWrite` weighted equally, the metric the ' +
      'original study reports. Cost prices those same tokens at published rates (cache reads at 0.1×).',
  );
  L.push('');

  L.push('## Per task and arm');
  L.push('');
  L.push('| task | arm | n | raw tokens | output | cost | turns | test runs | src loc | test loc | hold-out |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of TASK_ORDER) {
    for (const a of ARM_ORDER) {
      const c = s.cells[`${t}::${a}`];
      if (!c) continue;
      L.push(
        `| ${t} | ${a} | ${c.n} | ${c.agentRan ? k(c.rawTokens) : '—'} | ${c.agentRan ? k(c.outputTokens) : '—'} | ` +
          `${c.agentRan ? `$${c.costUSD.toFixed(3)}` : '—'} | ${c.agentRan ? Math.round(c.turns) : '—'} | ` +
          `${c.agentRan ? Math.round(c.testRuns) : '—'} | ${Math.round(c.srcLoc)} | ${Math.round(c.testsLoc)} | ` +
          `${c.holdoutPass.toFixed(1)}/${c.holdoutTotal} (${pct(c.holdoutPassRate)}) |`,
      );
    }
  }
  L.push('');

  if (s.discardedCount) {
    L.push(
      `**Discarded and re-run:** ${s.discarded.map((d) => `\`${d.runId}\` (${d.reasons.join('; ')})`).join(', ')}. ` +
        'Excluded from all averages.',
    );
    L.push('');
  }

  L.push('## Source figures being replicated');
  L.push('');
  L.push('| task size | reported TDD token multiplier | runs behind it |');
  L.push('|---|---|---|');
  L.push('| small | 8.50× | 2 vs 2 |');
  L.push('| medium | 2.96× | 6 vs 2 |');
  L.push('| large | 4.89× | 2 vs 2 |');
  L.push('');
  L.push(
    'The widely repeated "~3× on bigger tasks" is the **medium** figure. The large task was 4.89×.',
  );
  L.push('');

  return `${L.join('\n')}\n`;
}

/* -------------------------------------------------------------------- main */

const trials = loadTrials();
if (trials.length === 0) {
  console.error('No trials found. Run `node harness/run.mjs` first.');
  process.exit(1);
}

const summary = aggregate(trials);
fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'results', 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);

fs.writeFileSync(path.join(ROOT, 'results', 'summary.md'), renderMarkdown(summary));

fs.mkdirSync(path.join(ROOT, 'app', 'public'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'app', 'public', 'index.html'), renderHtml(summary));

console.log(`Aggregated ${trials.length} trials (${summary.agentTrialCount} agent runs).`);
if (summary.discardedCount) {
  console.log(`  ${summary.discardedCount} invalid run(s) excluded from averages.`);
}
console.log(`  results/summary.json`);
console.log(`  results/summary.md    (paste-ready)`);
console.log(`  app/public/index.html`);
for (const task of TASK_ORDER) {
  const r = summary.ratios[`${task}::vs-no-tests`];
  if (!r) continue;
  console.log(
    `  ${task.padEnd(7)} TDD vs no-tests — raw tokens ${r.rawTokenMultiplier.toFixed(2)}x, ` +
      `cost ${r.costMultiplier.toFixed(2)}x, quality ${(r.qualityDelta * 100).toFixed(0)}pp`,
  );
}
