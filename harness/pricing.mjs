// Published Anthropic list prices, USD per 1M tokens, as of 2026-08-15.
// We recompute cost ourselves (rather than only trusting the CLI's number) so the
// report can price the *same* token counts under different models, and so the
// cache-weighted vs raw-token distinction is explicit and auditable.

export const PRICES = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-fable-5': { input: 10, output: 50 },
  // Sonnet 5 list is $3/$15. An introductory $2/$10 rate runs through 2026-08-31, which
  // would cut every absolute figure here by a third — but it scales all arms equally and
  // therefore changes no multiplier. We price at list because that is what the CLI's own
  // accounting reports, which lets the two be cross-checked against each other.
  'claude-sonnet-5': { input: 3, output: 15, note: 'list price; introductory $2/$10 through 2026-08-31' },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

// Cache multipliers are applied to the model's input rate.
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2.0;

function canonical(model) {
  if (PRICES[model]) return model;
  // Strip a trailing date snapshot, e.g. claude-haiku-4-5-20251001.
  const stripped = model.replace(/-\d{8}$/, '');
  return PRICES[stripped] ? stripped : null;
}

/**
 * Price one model's usage slice.
 * `usage` accepts the CLI's modelUsage shape or our normalised shape.
 */
export function priceUsage(model, usage) {
  const key = canonical(model);
  if (!key) return { model, priced: false, costUSD: 0 };
  const { input, output } = PRICES[key];

  const fresh = usage.inputTokens ?? 0;
  const out = usage.outputTokens ?? 0;
  const read = usage.cacheReadInputTokens ?? 0;
  const write5m = usage.cacheWrite5mTokens ?? 0;
  const write1h = usage.cacheWrite1hTokens ?? 0;

  const perToken = (rate) => rate / 1_000_000;

  const costUSD =
    fresh * perToken(input) +
    out * perToken(output) +
    read * perToken(input) * CACHE_READ_MULTIPLIER +
    write5m * perToken(input) * CACHE_WRITE_5M_MULTIPLIER +
    write1h * perToken(input) * CACHE_WRITE_1H_MULTIPLIER;

  return {
    model: key,
    priced: true,
    costUSD,
    rates: PRICES[key],
    tokens: { fresh, output: out, cacheRead: read, cacheWrite5m: write5m, cacheWrite1h: write1h },
  };
}

/**
 * The metric the original Thoughtworks experiment reported:
 * input + output + cacheRead + cacheWrite, all weighted equally.
 */
export function rawTokenTotal(t) {
  return (t.fresh ?? 0) + (t.output ?? 0) + (t.cacheRead ?? 0) + (t.cacheWrite5m ?? 0) + (t.cacheWrite1h ?? 0);
}
