export function splitEven(totalCents, parts) {
  if (!Number.isInteger(totalCents)) {
    throw new TypeError('totalCents must be an integer');
  }
  if (!Number.isInteger(parts)) {
    throw new TypeError('parts must be an integer');
  }
  if (parts < 1) {
    throw new RangeError('parts must be at least 1');
  }
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  const result = new Array(parts).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i] += 1;
  }
  return result;
}

export function splitByWeight(totalCents, weights) {
  if (!Number.isInteger(totalCents)) {
    throw new TypeError('totalCents must be an integer');
  }
  if (!Array.isArray(weights)) {
    throw new TypeError('weights must be an array');
  }
  if (!weights.every((w) => Number.isInteger(w))) {
    throw new TypeError('every weight must be an integer');
  }
  if (weights.length === 0) {
    throw new RangeError('weights must not be empty');
  }
  if (weights.some((w) => w < 0)) {
    throw new RangeError('weights must not be negative');
  }
  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) {
    throw new RangeError('sum of weights must not be zero');
  }
  const sign = totalCents < 0 ? -1 : 1;
  const T = Math.abs(totalCents);
  const base = weights.map((w) => Math.floor((T * w) / W));
  const rem = weights.map((w, i) => T * w - base[i] * W);
  const leftover = T - base.reduce((a, b) => a + b, 0);
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => rem[b] - rem[a] || a - b);
  const result = [...base];
  for (let i = 0; i < leftover; i++) {
    result[order[i]] += 1;
  }
  return result.map((v) => v * sign);
}

export function computeBalances(members, expenses) {
  if (!Array.isArray(members)) {
    throw new TypeError('members must be an array');
  }
  if (!members.every((m) => typeof m === 'string' && m.length > 0)) {
    throw new TypeError('every member must be a non-empty string');
  }
  if (members.length === 0) {
    throw new RangeError('members must not be empty');
  }
  if (new Set(members).size !== members.length) {
    throw new RangeError('members must be unique');
  }
  if (!Array.isArray(expenses)) {
    throw new TypeError('expenses must be an array');
  }
  const balances = {};
  for (const member of members) {
    balances[member] = 0;
  }
  for (const expense of expenses) {
    if (typeof expense !== 'object' || expense === null) {
      throw new TypeError('every expense must be a non-null object');
    }
    const { payer, amountCents, participants, weights } = expense;
    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (!members.includes(payer)) {
      throw new RangeError('payer must be a member');
    }
    if (participants !== undefined) {
      if (!Array.isArray(participants)) {
        throw new TypeError('participants must be an array');
      }
      if (participants.length === 0) {
        throw new RangeError('participants must not be empty');
      }
      if (new Set(participants).size !== participants.length) {
        throw new RangeError('participants must be unique');
      }
      if (!participants.every((p) => members.includes(p))) {
        throw new RangeError('every participant must be a member');
      }
    }
    const effectiveParticipants = participants ?? members;
    if (weights !== undefined) {
      if (!Array.isArray(weights)) {
        throw new TypeError('weights must be an array');
      }
      if (weights.length !== effectiveParticipants.length) {
        throw new RangeError('weights.length must match participants length');
      }
    }
    balances[payer] += amountCents;
    const shares = weights
      ? splitByWeight(amountCents, weights)
      : splitEven(amountCents, effectiveParticipants.length);
    effectiveParticipants.forEach((participant, i) => {
      balances[participant] -= shares[i];
    });
  }
  return balances;
}

export function settle(balances) {
  if (typeof balances !== 'object' || balances === null || Array.isArray(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  const values = Object.values(balances);
  if (!values.every((v) => Number.isInteger(v))) {
    throw new TypeError('every balance value must be an integer');
  }
  if (values.reduce((a, b) => a + b, 0) !== 0) {
    throw new RangeError('balances must sum to zero');
  }
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .sort(([idA, a], [idB, b]) => a - b || (idA < idB ? -1 : idA > idB ? 1 : 0));
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .sort(([idA, a], [idB, b]) => b - a || (idA < idB ? -1 : idA > idB ? 1 : 0));

  const transfers = [];
  let di = 0;
  let ci = 0;
  let remainingDebt = debtors.length > 0 ? debtors[0][1] : 0;
  let remainingCredit = creditors.length > 0 ? creditors[0][1] : 0;

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(remainingCredit, -remainingDebt);
    transfers.push({ from: debtors[di][0], to: creditors[ci][0], amountCents: amount });
    remainingDebt += amount;
    remainingCredit -= amount;
    if (remainingDebt === 0) {
      di += 1;
      if (di < debtors.length) {
        remainingDebt = debtors[di][1];
      }
    }
    if (remainingCredit === 0) {
      ci += 1;
      if (ci < creditors.length) {
        remainingCredit = creditors[ci][1];
      }
    }
  }
  return transfers;
}

export function applyTransfers(balances, transfers) {
  if (typeof balances !== 'object' || balances === null || Array.isArray(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  if (!Object.values(balances).every((v) => Number.isInteger(v))) {
    throw new TypeError('every balance value must be an integer');
  }
  if (!Array.isArray(transfers)) {
    throw new TypeError('transfers must be an array');
  }
  const result = { ...balances };
  for (const transfer of transfers) {
    if (typeof transfer !== 'object' || transfer === null) {
      throw new TypeError('every transfer must be a non-null object');
    }
    const { from, to, amountCents } = transfer;
    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (amountCents <= 0) {
      throw new RangeError('amountCents must be positive');
    }
    if (!(from in balances) || !(to in balances)) {
      throw new RangeError('from and to must be keys of balances');
    }
    if (from === to) {
      throw new RangeError('from and to must differ');
    }
    result[from] += amountCents;
    result[to] -= amountCents;
  }
  return result;
}

export function summarize(members, expenses) {
  const balances = computeBalances(members, expenses);
  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const transfers = settle(balances);
  return { totalCents, balances, transfers };
}
