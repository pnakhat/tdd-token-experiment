#!/usr/bin/env node
// Runs the experiment matrix: tasks x arms x repeats.
//
//   node harness/run.mjs --tasks small,medium,large --arms tdd,spec-first,no-tests --repeats 1
//
// Each trial is one headless `claude -p` session in a clean, isolated workspace that
// contains only SPEC.md and empty src/ and tests/ directories. The hold-out suite is
// never present in the workspace, so no arm can optimise against the grader.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMS, TASK_PROMPT } from './prompts.mjs';
import { priceUsage, rawTokenTotal } from './pricing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const out = {
    tasks: ['small', 'medium', 'large'],
    arms: ['tdd', 'spec-first', 'no-tests'],
    repeats: 1,
    model: 'claude-sonnet-5',
    timeoutMs: 25 * 60 * 1000,
    maxBudgetUsd: 5,
    retries: 1,
  };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (key === 'tasks' || key === 'arms') out[key] = value.split(',').map((s) => s.trim());
    else if (key === 'repeats') out.repeats = Number(value);
    else if (key === 'model') out.model = value;
    else if (key === 'timeout-min') out.timeoutMs = Number(value) * 60 * 1000;
    else if (key === 'max-budget-usd') out.maxBudgetUsd = Number(value);
    else if (key === 'retries') out.retries = Number(value);
    else throw new Error(`unknown flag --${key}`);
  }
  return out;
}

/* ------------------------------------------------------- workspace setup */

const PERMISSIONS = {
  permissions: {
    defaultMode: 'acceptEdits',
    allow: [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      // Read-only inspection plus the test runner. Kept broad enough that routine
      // orientation commands don't generate permission denials, which would show up
      // as extra retry turns and pollute the token counts we are trying to measure.
      'Bash(node:*)',
      'Bash(ls:*)',
      'Bash(cat:*)',
      'Bash(mkdir:*)',
      'Bash(echo:*)',
      'Bash(pwd:*)',
      'Bash(head:*)',
      'Bash(tail:*)',
      'Bash(wc:*)',
      'Bash(find:*)',
      'Bash(grep:*)',
    ],
    // Keep every trial hermetic and comparable: no network, no VCS, no package installs.
    deny: ['WebSearch', 'WebFetch', 'Bash(curl:*)', 'Bash(git:*)', 'Bash(npm:*)', 'Bash(npx:*)'],
  },
};

function prepareWorkspace(runDir, task) {
  fs.rmSync(runDir, { recursive: true, force: true });
  const work = path.join(runDir, 'work');
  fs.mkdirSync(path.join(work, 'src'), { recursive: true });
  fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'spec', task, 'SPEC.md'), path.join(work, 'SPEC.md'));
  fs.writeFileSync(
    path.join(work, 'package.json'),
    `${JSON.stringify({ name: `ledger-${task}`, private: true, type: 'module' }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(runDir, 'settings.json'),
    `${JSON.stringify(PERMISSIONS, null, 2)}\n`,
  );
  return work;
}

/* -------------------------------------------------------- agent invocation */

function runAgent({ work, runDir, arm, model, timeoutMs, maxBudgetUsd }) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      TASK_PROMPT,
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      model,
      '--append-system-prompt',
      ARMS[arm].systemPrompt,
      '--settings',
      path.join(runDir, 'settings.json'),
      // Only the tools the task needs. No Task tool, so no subagents inflating token counts.
      '--tools',
      'Bash,Read,Write,Edit,Glob,Grep',
      // Strip this machine's CLAUDE.md, skills, plugins, hooks and MCP servers so the
      // only thing that differs between arms is the appended system prompt.
      '--safe-mode',
      '--no-session-persistence',
      '--max-budget-usd',
      String(maxBudgetUsd),
    ];

    const child = spawn('claude', args, {
      cwd: work,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    });

    const streamPath = path.join(runDir, 'stream.jsonl');
    const streamOut = fs.createWriteStream(streamPath);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      streamOut.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      streamOut.end();
      fs.writeFileSync(path.join(runDir, 'stderr.log'), stderr);
      resolve({ code, stdout, stderr, timedOut, streamPath });
    });
  });
}

/* ------------------------------------------------------------ stream parsing */

function parseStream(stdout) {
  const events = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      /* partial line — ignore */
    }
  }

  const result = [...events].reverse().find((e) => e.type === 'result') ?? null;

  let toolCalls = 0;
  let testRuns = 0;
  let fileWrites = 0;
  for (const e of events) {
    const content = e?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== 'tool_use') continue;
      toolCalls += 1;
      if (block.name === 'Write' || block.name === 'Edit') fileWrites += 1;
      const cmd = block?.input?.command;
      if (block.name === 'Bash' && typeof cmd === 'string' && /\bnode\b[^\n]*--test/.test(cmd)) {
        testRuns += 1;
      }
    }
  }

  return { result, toolCalls, testRuns, fileWrites, eventCount: events.length };
}

function normaliseUsage(result) {
  const perModel = {};
  const modelUsage = result?.modelUsage ?? {};
  for (const [model, u] of Object.entries(modelUsage)) {
    perModel[model] = {
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      cacheReadInputTokens: u.cacheReadInputTokens ?? 0,
      // The CLI reports cache creation in aggregate per model; the 5m/1h split is only
      // available on the session-level usage object, so attribute it there.
      cacheCreationInputTokens: u.cacheCreationInputTokens ?? 0,
      reportedCostUSD: u.costUSD ?? 0,
    };
  }

  const cacheCreation = result?.usage?.cache_creation ?? {};
  const total1h = cacheCreation.ephemeral_1h_input_tokens ?? 0;
  const total5m = cacheCreation.ephemeral_5m_input_tokens ?? 0;
  const totalCreation = total1h + total5m;

  // Split each model's cache-creation tokens using the session-wide 5m/1h ratio.
  const priced = [];
  for (const [model, u] of Object.entries(perModel)) {
    const share = totalCreation > 0 ? u.cacheCreationInputTokens / totalCreation : 0;
    priced.push(
      priceUsage(model, {
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadInputTokens: u.cacheReadInputTokens,
        cacheWrite1hTokens: Math.round(total1h * share),
        cacheWrite5mTokens: Math.round(total5m * share),
      }),
    );
  }

  const tokens = priced.reduce(
    (acc, p) => {
      if (!p.tokens) return acc;
      acc.fresh += p.tokens.fresh;
      acc.output += p.tokens.output;
      acc.cacheRead += p.tokens.cacheRead;
      acc.cacheWrite5m += p.tokens.cacheWrite5m;
      acc.cacheWrite1h += p.tokens.cacheWrite1h;
      return acc;
    },
    { fresh: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
  );

  return {
    perModel,
    priced,
    tokens,
    rawTokenTotal: rawTokenTotal(tokens),
    recomputedCostUSD: priced.reduce((a, p) => a + p.costUSD, 0),
    reportedCostUSD: result?.total_cost_usd ?? 0,
    numTurns: result?.num_turns ?? 0,
    durationMs: result?.duration_ms ?? 0,
    stopReason: result?.stop_reason ?? null,
    // `error_max_budget_usd` / `budget_exhausted` mean the trial was cut off by the
    // per-trial spend cap rather than finishing — which censors the most expensive arm
    // and would bias its multiplier downward. Recorded so it is diagnosable, not silent.
    subtype: result?.subtype ?? null,
    terminalReason: result?.terminal_reason ?? null,
    isError: result?.is_error ?? null,
    permissionDenials: result?.permission_denials?.length ?? 0,
  };
}

/* ------------------------------------------------------------------ scoring */

function scoreRun(runDir, work, task) {
  const scoreDir = path.join(runDir, 'score');
  fs.rmSync(scoreDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(scoreDir, 'tests'), { recursive: true });

  const srcDir = path.join(work, 'src');
  const hasSrc = fs.existsSync(path.join(srcDir, 'index.mjs'));
  if (hasSrc) {
    fs.cpSync(srcDir, path.join(scoreDir, 'src'), { recursive: true });
  } else {
    fs.mkdirSync(path.join(scoreDir, 'src'), { recursive: true });
  }

  fs.writeFileSync(
    path.join(scoreDir, 'package.json'),
    `${JSON.stringify({ name: 'score', private: true, type: 'module' }, null, 2)}\n`,
  );
  fs.copyFileSync(
    path.join(ROOT, 'holdout', `${task}.test.mjs`),
    path.join(scoreDir, 'tests', 'holdout.test.mjs'),
  );

  const res = spawnSync('node', ['--test', '--test-reporter=tap'], {
    cwd: scoreDir,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const stdout = res.stdout ?? '';
  fs.writeFileSync(path.join(runDir, 'holdout.tap'), stdout + (res.stderr ?? ''));

  const pass = Number(/^# pass (\d+)$/m.exec(stdout)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)$/m.exec(stdout)?.[1] ?? 0);

  return { hasSrc, holdoutPass: pass, holdoutFail: fail, holdoutExit: res.status };
}

/* -------------------------------------------------------- workspace metrics */

function workspaceMetrics(work) {
  const srcDir = path.join(work, 'src');
  const testsDir = path.join(work, 'tests');

  const countLines = (dir) => {
    if (!fs.existsSync(dir)) return { files: 0, lines: 0, bytes: 0 };
    let files = 0;
    let lines = 0;
    let bytes = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath ?? dir, entry.name);
      const text = fs.readFileSync(full, 'utf8');
      files += 1;
      lines += text.split('\n').filter((l) => l.trim().length > 0).length;
      bytes += Buffer.byteLength(text);
    }
    return { files, lines, bytes };
  };

  return { src: countLines(srcDir), tests: countLines(testsDir) };
}

/* --------------------------------------------------------------- one trial */

async function runTrial({ task, arm, repeat, model, timeoutMs, maxBudgetUsd }) {
  const runId = `${task}__${arm}__r${repeat}`;
  const runDir = path.join(ROOT, 'runs', runId);
  const started = Date.now();

  process.stdout.write(`\n▶ ${runId}  (model: ${model})\n`);

  const work = prepareWorkspace(runDir, task);

  // The reference arm is scored through the identical grader but runs no agent.
  if (arm === 'reference') {
    fs.copyFileSync(path.join(ROOT, 'reference', 'index.mjs'), path.join(work, 'src', 'index.mjs'));
    const score = scoreRun(runDir, work, task);
    const record = {
      runId,
      task,
      arm,
      repeat,
      model: null,
      agentRan: false,
      usage: null,
      process: { toolCalls: 0, testRuns: 0, fileWrites: 0 },
      workspace: workspaceMetrics(work),
      score,
      wallClockMs: Date.now() - started,
    };
    writeTrial(record);
    process.stdout.write(`  hold-out: ${score.holdoutPass} pass / ${score.holdoutFail} fail\n`);
    return record;
  }

  const run = await runAgent({ work, runDir, arm, model, timeoutMs, maxBudgetUsd });
  const parsed = parseStream(run.stdout);

  if (!parsed.result) {
    process.stdout.write(
      `  ⚠ no result event (exit ${run.code}${run.timedOut ? ', TIMED OUT' : ''})\n`,
    );
  }

  const usage = parsed.result ? normaliseUsage(parsed.result) : null;
  const score = scoreRun(runDir, work, task);
  const workspace = workspaceMetrics(work);

  // A run only counts if the agent actually finished and left something behind.
  // Timeouts, API errors (including the host machine sleeping mid-session) and
  // empty workspaces are recorded but excluded from aggregates, so an
  // environmental failure can never masquerade as an experimental result.
  const invalidReasons = [];
  if (run.timedOut) invalidReasons.push('timed out');
  if (!parsed.result) invalidReasons.push('no result event');
  if (usage?.terminalReason === 'budget_exhausted') {
    invalidReasons.push(`truncated by --max-budget-usd cap (raise it and re-run)`);
  } else if (usage?.isError) {
    invalidReasons.push(`api error (stop_reason: ${usage.stopReason}, subtype: ${usage.subtype})`);
  }
  if (!score.hasSrc) invalidReasons.push('no src/index.mjs produced');

  const record = {
    runId,
    task,
    arm,
    repeat,
    model,
    agentRan: true,
    valid: invalidReasons.length === 0,
    invalidReasons,
    exitCode: run.code,
    timedOut: run.timedOut,
    usage,
    process: {
      toolCalls: parsed.toolCalls,
      testRuns: parsed.testRuns,
      fileWrites: parsed.fileWrites,
      numTurns: usage?.numTurns ?? 0,
    },
    workspace,
    score,
    wallClockMs: Date.now() - started,
  };

  writeTrial(record);

  if (invalidReasons.length > 0) {
    process.stdout.write(`  ⚠ INVALID — ${invalidReasons.join('; ')}\n`);
  }
  if (usage) {
    process.stdout.write(
      `  tokens(raw): ${usage.rawTokenTotal.toLocaleString()}  ` +
        `output: ${usage.tokens.output.toLocaleString()}  ` +
        `cost: $${usage.recomputedCostUSD.toFixed(4)}  ` +
        `turns: ${usage.numTurns}  test-runs: ${parsed.testRuns}\n`,
    );
  }
  process.stdout.write(
    `  hold-out: ${score.holdoutPass} pass / ${score.holdoutFail} fail  ` +
      `src: ${workspace.src.lines} loc  tests: ${workspace.tests.lines} loc\n`,
  );

  return record;
}

function writeTrial(record) {
  const dir = path.join(ROOT, 'results', 'trials');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${record.runId}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

/* -------------------------------------------------------------------- main */

async function main() {
  const opts = parseArgs(process.argv);
  process.stdout.write(
    `Experiment matrix: tasks=[${opts.tasks}] arms=[${opts.arms}] repeats=${opts.repeats}\n`,
  );

  const records = [];
  for (const task of opts.tasks) {
    for (const arm of opts.arms) {
      for (let repeat = 1; repeat <= opts.repeats; repeat += 1) {
        if (arm === 'reference' && repeat > 1) continue; // deterministic, run once

        let record = await runTrial({ ...opts, task, arm, repeat });
        // Retry environmental failures (host sleep, transient API errors, timeouts)
        // rather than letting them stand in as data.
        for (let attempt = 1; attempt <= opts.retries && record.valid === false; attempt += 1) {
          process.stdout.write(`  ↻ retrying (attempt ${attempt} of ${opts.retries})\n`);
          record = await runTrial({ ...opts, task, arm, repeat });
        }
        records.push(record);
      }
    }
  }

  const agentRuns = records.filter((r) => r.agentRan && r.usage);
  const totalCost = agentRuns.reduce((a, r) => a + r.usage.recomputedCostUSD, 0);
  process.stdout.write(
    `\n${records.length} trials complete. Recomputed spend: $${totalCost.toFixed(4)}\n` +
      `Run \`node harness/report.mjs\` to build the report.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
