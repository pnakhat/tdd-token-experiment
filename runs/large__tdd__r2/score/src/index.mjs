export function splitEven(totalCents, parts) {
  if (!Number.isInteger(totalCents)) throw new TypeError('totalCents must be an integer');
  if (!Number.isInteger(parts)) throw new TypeError('parts must be an integer');
  if (parts < 1) throw new RangeError('parts must be at least 1');
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  const result = [];
  for (let i = 0; i < parts; i++) {
    result.push(i < remainder ? base + 1 : base);
  }
  return result;
}

export function splitByWeight(totalCents, weights) {
  if (!Number.isInteger(totalCents)) throw new TypeError('totalCents must be an integer');
  if (!Array.isArray(weights)) throw new TypeError('weights must be an array');
  if (!weights.every((w) => Number.isInteger(w))) throw new TypeError('weights must be integers');
  if (weights.length === 0) throw new RangeError('weights must not be empty');
  if (weights.some((w) => w < 0)) throw new RangeError('weights must not be negative');
  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) throw new RangeError('sum of weights must not be zero');
  const sign = totalCents < 0 ? -1 : 1;
  const T = Math.abs(totalCents);

  const base = weights.map((w) => Math.floor((T * w) / W));
  const rem = weights.map((w, i) => T * w - base[i] * W);
  const leftover = T - base.reduce((a, b) => a + b, 0);

  const order = weights.map((_, i) => i).sort((a, b) => {
    if (rem[b] !== rem[a]) return rem[b] - rem[a];
    return a - b;
  });

  const result = [...base];
  for (let k = 0; k < leftover; k++) {
    result[order[k]] += 1;
  }

  return result.map((v) => v * sign);
}

export function computeBalances(members, expenses) {
  if (!Array.isArray(members)) throw new TypeError('members must be an array');
  if (!members.every((m) => typeof m === 'string' && m.length > 0)) {
    throw new TypeError('every member must be a non-empty string');
  }
  if (members.length === 0) throw new RangeError('members must not be empty');
  if (new Set(members).size !== members.length) {
    throw new RangeError('members must be unique');
  }
  const balances = {};
  for (const member of members) balances[member] = 0;

  for (const expense of expenses) {
    if (typeof expense !== 'object' || expense === null) {
      throw new TypeError('expense must be a non-null object');
    }
    const { payer, amountCents, participants, weights } = expense;
    if (!Number.isInteger(amountCents)) throw new TypeError('amountCents must be an integer');
    if (!(payer in balances)) throw new RangeError('payer must be one of members');
    if (participants !== undefined) {
      if (!Array.isArray(participants)) throw new TypeError('participants must be an array');
      if (participants.length === 0) throw new RangeError('participants must not be empty');
      if (new Set(participants).size !== participants.length) {
        throw new RangeError('participants must be unique');
      }
      if (!participants.every((p) => p in balances)) {
        throw new RangeError('participants must be members');
      }
    }
    const effectiveParticipants = participants ?? members;
    if (weights !== undefined) {
      if (!Array.isArray(weights)) throw new TypeError('weights must be an array');
      if (weights.length !== effectiveParticipants.length) {
        throw new RangeError('weights length must match participants length');
      }
    }
    balances[payer] += amountCents;
    const shares = weights
      ? splitByWeight(amountCents, weights)
      : splitEven(amountCents, effectiveParticipants.length);
    effectiveParticipants.forEach((p, i) => {
      balances[p] -= shares[i];
    });
  }

  return balances;
}

export function settle(balances) {
  if (typeof balances !== 'object' || balances === null || Array.isArray(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  const entries = Object.entries(balances);
  if (!entries.every(([, v]) => Number.isInteger(v))) {
    throw new TypeError('every balance must be an integer');
  }
  if (entries.reduce((sum, [, v]) => sum + v, 0) !== 0) {
    throw new RangeError('balances must sum to zero');
  }

  const debtors = entries
    .filter(([, v]) => v < 0)
    .sort(([idA, a], [idB, b]) => (a !== b ? a - b : idA < idB ? -1 : idA > idB ? 1 : 0))
    .map(([id, v]) => ({ id, remaining: v }));

  const creditors = entries
    .filter(([, v]) => v > 0)
    .sort(([idA, a], [idB, b]) => (a !== b ? b - a : idA < idB ? -1 : idA > idB ? 1 : 0))
    .map(([id, v]) => ({ id, remaining: v }));

  const transfers = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di];
    const creditor = creditors[ci];
    const amount = Math.min(creditor.remaining, -debtor.remaining);
    transfers.push({ from: debtor.id, to: creditor.id, amountCents: amount });
    debtor.remaining += amount;
    creditor.remaining -= amount;
    if (debtor.remaining === 0) di++;
    if (creditor.remaining === 0) ci++;
  }

  return transfers;
}

export function applyTransfers(balances, transfers) {
  if (typeof balances !== 'object' || balances === null || Array.isArray(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  if (!Object.values(balances).every((v) => Number.isInteger(v))) {
    throw new TypeError('every balance must be an integer');
  }
  if (!Array.isArray(transfers)) throw new TypeError('transfers must be an array');
  const result = { ...balances };
  for (const transfer of transfers) {
    if (typeof transfer !== 'object' || transfer === null) {
      throw new TypeError('transfer must be a non-null object');
    }
    const { from, to, amountCents } = transfer;
    if (!Number.isInteger(amountCents)) throw new TypeError('amountCents must be an integer');
    if (amountCents <= 0) throw new RangeError('amountCents must be positive');
    if (!(from in balances) || !(to in balances)) {
      throw new RangeError('from and to must be keys of balances');
    }
    if (from === to) throw new RangeError('from must not equal to');
    result[from] += amountCents;
    result[to] -= amountCents;
  }
  return result;
}

export function summarize(members, expenses) {
  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const balances = computeBalances(members, expenses);
  const transfers = settle(balances);
  return { totalCents, balances, transfers };
}
