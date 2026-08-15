#!/usr/bin/env node
// Sanity check: run every hold-out suite against the human-written reference
// implementation. If this fails, the grader is broken and no arm's score means
// anything — run it before trusting any experiment result.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASK_ORDER } from './prompts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holdout-verify-'));

let failed = false;

for (const task of TASK_ORDER) {
  const dir = path.join(tmp, task);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'reference', 'index.mjs'), path.join(dir, 'src', 'index.mjs'));
  fs.copyFileSync(
    path.join(ROOT, 'holdout', `${task}.test.mjs`),
    path.join(dir, 'tests', 'holdout.test.mjs'),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: `verify-${task}`, private: true, type: 'module' })}\n`,
  );

  const res = spawnSync('node', ['--test', '--test-reporter=tap'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const stdout = res.stdout ?? '';
  const pass = Number(/^# pass (\d+)$/m.exec(stdout)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)$/m.exec(stdout)?.[1] ?? 0);

  const ok = fail === 0 && pass > 0;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${task.padEnd(7)} ${pass} pass / ${fail} fail`);
  if (!ok) console.log(stdout);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error('\nHold-out suites do not pass against the reference implementation.');
  process.exit(1);
}
console.log('\nHold-out suites are self-consistent and solvable.');
