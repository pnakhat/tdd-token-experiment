// Reference implementation, written by the experiment author (not by any arm).
// Its only jobs: prove the hold-out suites are self-consistent and solvable,
// and provide a "what does a clean solution cost" ceiling for the report.
// It is never shown to any arm.

const isInt = Number.isInteger;

function assertPlainObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

export function splitEven(totalCents, parts) {
  if (!isInt(totalCents)) throw new TypeError('totalCents must be an integer');
  if (!isInt(parts)) throw new TypeError('parts must be an integer');
  if (parts < 1) throw new RangeError('parts must be at least 1');

  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}

export function splitByWeight(totalCents, weights) {
  if (!isInt(totalCents)) throw new TypeError('totalCents must be an integer');
  if (!Array.isArray(weights)) throw new TypeError('weights must be an array');
  for (const w of weights) {
    if (!isInt(w)) throw new TypeError('every weight must be an integer');
  }
  if (weights.length === 0) throw new RangeError('weights must not be empty');
  for (const w of weights) {
    if (w < 0) throw new RangeError('weights must not be negative');
  }
  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) throw new RangeError('weights must not sum to zero');

  const sign = totalCents < 0 ? -1 : 1;
  const T = Math.abs(totalCents);

  const base = weights.map((w) => Math.floor((T * w) / W));
  const rem = weights.map((w, i) => T * w - base[i] * W);
  let leftover = T - base.reduce((a, b) => a + b, 0);

  const order = base.map((_, i) => i).sort((i, j) => rem[j] - rem[i] || i - j);
  const out = base.slice();
  for (let k = 0; k < leftover; k++) out[order[k]] += 1;

  return out.map((v) => v * sign);
}

export function computeBalances(members, expenses) {
  if (!Array.isArray(members)) throw new TypeError('members must be an array');
  for (const m of members) {
    if (typeof m !== 'string' || m.length === 0) {
      throw new TypeError('every member must be a non-empty string');
    }
  }
  if (members.length === 0) throw new RangeError('members must not be empty');
  if (new Set(members).size !== members.length) {
    throw new RangeError('members must be unique');
  }
  if (!Array.isArray(expenses)) throw new TypeError('expenses must be an array');

  const known = new Set(members);
  const balances = Object.fromEntries(members.map((m) => [m, 0]));

  for (const e of expenses) {
    if (typeof e !== 'object' || e === null) throw new TypeError('expense must be an object');
    if (!isInt(e.amountCents)) throw new TypeError('amountCents must be an integer');
    if (!known.has(e.payer)) throw new RangeError('payer must be a known member');

    let participants;
    if (e.participants === undefined) {
      participants = members;
    } else {
      if (!Array.isArray(e.participants)) throw new TypeError('participants must be an array');
      if (e.participants.length === 0) throw new RangeError('participants must not be empty');
      if (new Set(e.participants).size !== e.participants.length) {
        throw new RangeError('participants must be unique');
      }
      for (const p of e.participants) {
        if (!known.has(p)) throw new RangeError('participant must be a known member');
      }
      participants = e.participants;
    }

    let shares;
    if (e.weights === undefined) {
      shares = splitEven(e.amountCents, participants.length);
    } else {
      if (!Array.isArray(e.weights)) throw new TypeError('weights must be an array');
      if (e.weights.length !== participants.length) {
        throw new RangeError('weights must match participants length');
      }
      shares = splitByWeight(e.amountCents, e.weights);
    }

    balances[e.payer] += e.amountCents;
    participants.forEach((p, i) => {
      balances[p] -= shares[i];
    });
  }

  return balances;
}

function validateBalances(balances, { requireZeroSum }) {
  assertPlainObject(balances, 'balances');
  const entries = Object.entries(balances);
  for (const [, v] of entries) {
    if (!isInt(v)) throw new TypeError('every balance must be an integer');
  }
  if (requireZeroSum) {
    const total = entries.reduce((a, [, v]) => a + v, 0);
    if (total !== 0) throw new RangeError('balances must sum to zero');
  }
  return entries;
}

const byIdAsc = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

export function settle(balances) {
  const entries = validateBalances(balances, { requireZeroSum: true });

  const debtors = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1] || byIdAsc(a, b));
  const creditors = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || byIdAsc(a, b));

  const transfers = [];
  let di = 0;
  let ci = 0;
  let debt = debtors.length ? -debtors[0][1] : 0;
  let credit = creditors.length ? creditors[0][1] : 0;

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debt, credit);
    if (amount > 0) {
      transfers.push({ from: debtors[di][0], to: creditors[ci][0], amountCents: amount });
      debt -= amount;
      credit -= amount;
    }
    if (debt === 0) {
      di += 1;
      if (di < debtors.length) debt = -debtors[di][1];
    }
    if (credit === 0) {
      ci += 1;
      if (ci < creditors.length) credit = creditors[ci][1];
    }
  }

  return transfers;
}

export function applyTransfers(balances, transfers) {
  validateBalances(balances, { requireZeroSum: false });
  if (!Array.isArray(transfers)) throw new TypeError('transfers must be an array');

  const result = { ...balances };
  for (const t of transfers) {
    if (typeof t !== 'object' || t === null) throw new TypeError('transfer must be an object');
    if (!isInt(t.amountCents)) throw new TypeError('amountCents must be an integer');
    if (t.amountCents <= 0) throw new RangeError('amountCents must be positive');
    if (!Object.hasOwn(result, t.from)) throw new RangeError('unknown transfer source');
    if (!Object.hasOwn(result, t.to)) throw new RangeError('unknown transfer target');
    if (t.from === t.to) throw new RangeError('cannot transfer to self');
    result[t.from] += t.amountCents;
    result[t.to] -= t.amountCents;
  }
  return result;
}

export function summarize(members, expenses) {
  const balances = computeBalances(members, expenses);
  const totalCents = expenses.reduce((a, e) => a + e.amountCents, 0);
  return { totalCents, balances, transfers: settle(balances) };
}
