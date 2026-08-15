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
    throw new TypeError('weights must be integers');
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

  const order = weights.map((_, i) => i).sort((a, b) => {
    if (rem[b] !== rem[a]) return rem[b] - rem[a];
    return a - b;
  });

  for (let i = 0; i < leftover; i++) {
    base[order[i]] += 1;
  }

  return base.map((b) => b * sign);
}

export function computeBalances(members, expenses) {
  if (!Array.isArray(members)) {
    throw new TypeError('members must be an array');
  }
  if (!members.every((m) => typeof m === 'string' && m.length > 0)) {
    throw new TypeError('members must be non-empty strings');
  }
  if (members.length === 0) {
    throw new RangeError('members must not be empty');
  }
  if (new Set(members).size !== members.length) {
    throw new RangeError('members must be unique');
  }
  const memberSet = new Set(members);
  const balances = {};
  for (const member of members) {
    balances[member] = 0;
  }

  if (!Array.isArray(expenses)) {
    throw new TypeError('expenses must be an array');
  }

  for (const expense of expenses) {
    if (typeof expense !== 'object' || expense === null) {
      throw new TypeError('expense must be a non-null object');
    }
    const { payer, amountCents } = expense;
    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (!memberSet.has(payer)) {
      throw new RangeError('payer must be a member');
    }

    const participants = expense.participants ?? members;
    if (expense.participants !== undefined) {
      if (!Array.isArray(expense.participants)) {
        throw new TypeError('participants must be an array');
      }
      if (participants.length === 0) {
        throw new RangeError('participants must not be empty');
      }
      if (new Set(participants).size !== participants.length) {
        throw new RangeError('participants must be unique');
      }
      if (!participants.every((p) => memberSet.has(p))) {
        throw new RangeError('participants must be members');
      }
    }

    if (expense.weights !== undefined && !Array.isArray(expense.weights)) {
      throw new TypeError('weights must be an array');
    }
    if (expense.weights !== undefined && expense.weights.length !== participants.length) {
      throw new RangeError('weights length must match participants length');
    }

    const shares = expense.weights
      ? splitByWeight(amountCents, expense.weights)
      : splitEven(amountCents, participants.length);

    balances[payer] += amountCents;
    participants.forEach((participant, i) => {
      balances[participant] -= shares[i];
    });
  }

  return balances;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function settle(balances) {
  if (!isPlainObject(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  if (!Object.values(balances).every((v) => Number.isInteger(v))) {
    throw new TypeError('balances values must be integers');
  }
  if (Object.values(balances).reduce((a, b) => a + b, 0) !== 0) {
    throw new RangeError('balances must sum to 0');
  }
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .sort(([idA, a], [idB, b]) => (a !== b ? a - b : idA < idB ? -1 : 1));
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .sort(([idA, a], [idB, b]) => (a !== b ? b - a : idA < idB ? -1 : 1));

  const transfers = [];
  let i = 0;
  let j = 0;
  let remainingDebt = debtors.length > 0 ? debtors[0][1] : 0;
  let remainingCredit = creditors.length > 0 ? creditors[0][1] : 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(remainingCredit, -remainingDebt);
    transfers.push({ from: debtors[i][0], to: creditors[j][0], amountCents: amount });
    remainingDebt += amount;
    remainingCredit -= amount;

    if (remainingDebt === 0) {
      i += 1;
      remainingDebt = i < debtors.length ? debtors[i][1] : 0;
    }
    if (remainingCredit === 0) {
      j += 1;
      remainingCredit = j < creditors.length ? creditors[j][1] : 0;
    }
  }

  return transfers;
}

export function applyTransfers(balances, transfers) {
  if (!isPlainObject(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  if (!Object.values(balances).every((v) => Number.isInteger(v))) {
    throw new TypeError('balances values must be integers');
  }
  if (!Array.isArray(transfers)) {
    throw new TypeError('transfers must be an array');
  }

  const result = { ...balances };
  for (const transfer of transfers) {
    if (typeof transfer !== 'object' || transfer === null) {
      throw new TypeError('transfer must be a non-null object');
    }
    const { from, to, amountCents } = transfer;
    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (amountCents <= 0) {
      throw new RangeError('amountCents must be positive');
    }
    if (!(from in balances)) {
      throw new RangeError('from must be a key of balances');
    }
    if (!(to in balances)) {
      throw new RangeError('to must be a key of balances');
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
  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const balances = computeBalances(members, expenses);
  const transfers = settle(balances);
  return { totalCents, balances, transfers };
}
