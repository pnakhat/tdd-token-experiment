// The single independent variable in this experiment is the *process* the agent is
// told to follow. Every arm receives an identical task prompt and an identical SPEC.md.
// Only the appended system prompt below differs.

export const TASK_PROMPT = `Implement the module described in SPEC.md, which is in this directory.

Rules that apply to every part of this task:
- The implementation goes in src/index.mjs. It must be ESM, target Node 20+, and use no dependencies.
- Any tests you write go in the tests/ directory as *.test.mjs files, and must run under the
  built-in Node test runner, invoked from this directory as: node --test
- Do not modify SPEC.md. Do not add dependencies or a package manager. Do not create files
  outside src/ and tests/.
- SPEC.md is the complete requirement. Implement all of it.

When the task is complete, stop.`;

export const ARMS = {
  tdd: {
    label: 'TDD (red-green-refactor)',
    blurb:
      'Strict test-first loop. One behaviour per cycle, tests must be run and observed failing before any implementation code is written.',
    systemPrompt: `You must follow strict Test-Driven Development for this task. This is not optional and it is not a suggestion: the process itself is what is being asked of you.

Work one single behaviour at a time. For each behaviour, complete a full cycle before starting the next:

1. RED — Write exactly ONE new test in tests/ that captures the next single behaviour from SPEC.md. Then actually run \`node --test\` and observe that the new test fails. Do not write or modify any implementation code during this step.
2. GREEN — Write the minimum implementation code in src/ that makes that failing test pass. Then actually run \`node --test\` and observe that it passes.
3. REFACTOR — Improve the implementation and the tests without changing behaviour. Then actually run \`node --test\` again and observe that everything still passes.

Hard rules:
- Never write implementation code that is not demanded by a test that is failing right now.
- Never batch several behaviours into one cycle. One behaviour, one cycle.
- You must genuinely run the test command in every RED, GREEN, and REFACTOR step. Never assume, predict, or fabricate a test result you did not observe.
- The RED step is real: if a test you expected to fail passes, stop and fix the test before continuing.
- Keep cycling until every behaviour described in SPEC.md is implemented and covered.`,
  },

  'spec-first': {
    label: 'Spec-first (design pass, then tests)',
    blurb:
      'Read the whole spec, design and implement the module in one pass, then write a test suite covering the spec and fix what it catches.',
    systemPrompt: `Work spec-first for this task, in that order and without interleaving.

1. DESIGN — Read all of SPEC.md first. Before writing any code, work out the whole design: the function contracts, the data shapes, the shared helpers, the validation order, and the edge cases. Hold the complete design in mind.
2. IMPLEMENT — Write the entire implementation in src/ in one pass, from that design.
3. TEST — Only after the implementation is complete, write a test suite in tests/ that covers the behaviours and edge cases described in SPEC.md.
4. VERIFY — Run \`node --test\`, and fix any defects it reveals.

Hard rules:
- Do not write tests before the implementation is complete.
- Do not implement behaviour incrementally one test at a time.
- Never assume, predict, or fabricate a test result you did not observe.`,
  },

  'no-tests': {
    label: 'No tests (implementation only)',
    blurb:
      'Implement straight from the spec and write no tests at all. The control arm: isolates the cost of writing tests from the cost of ordering them test-first.',
    systemPrompt: `Implement this task directly from SPEC.md.

1. Read all of SPEC.md first and work out the complete design before writing code.
2. Write the entire implementation in src/.

Hard rules:
- Do NOT write any tests. Do not create any files in tests/. Do not create any *.test.mjs file.
- You may run small one-off commands to sanity-check your code, but you must not build a test suite.
- Never assume, predict, or fabricate a result you did not observe.`,
  },

  reference: {
    label: 'Reference (human-written)',
    blurb:
      'The author\'s own implementation, scored through the identical hold-out suite. No agent runs; it exists to prove the tasks are solvable and to mark the quality ceiling.',
    systemPrompt: null, // never invoked
  },
};

export const ARM_ORDER = ['tdd', 'spec-first', 'no-tests', 'reference'];
export const TASK_ORDER = ['small', 'medium', 'large'];
