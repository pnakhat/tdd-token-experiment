// Ledger: integer-cents money splitting and settlement utilities.
// All money is represented as integer cents. No floating point arithmetic is used for money.

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function splitEven(totalCents, parts) {
  if (!Number.isInteger(totalCents)) {
    throw new TypeError('totalCents must be an integer');
  }
  if (!Number.isInteger(parts)) {
    throw new TypeError('parts must be an integer');
  }
  if (parts < 1) {
    throw new RangeError('parts must be >= 1');
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
  for (const w of weights) {
    if (!Number.isInteger(w)) {
      throw new TypeError('every weight must be an integer');
    }
  }
  if (weights.length === 0) {
    throw new RangeError('weights must not be empty');
  }
  for (const w of weights) {
    if (w < 0) {
      throw new RangeError('weights must not be negative');
    }
  }
  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) {
    throw new RangeError('sum of weights must not be zero');
  }

  const sign = totalCents < 0 ? -1 : 1;
  const T = Math.abs(totalCents);

  const base = weights.map((w) => Math.floor((T * w) / W));
  const rem = weights.map((w, i) => T * w - base[i] * W);
  const sumBase = base.reduce((a, b) => a + b, 0);
  const leftover = T - sumBase;

  const order = weights.map((_, i) => i).sort((a, b) => rem[b] - rem[a] || a - b);

  const result = base.slice();
  for (let k = 0; k < leftover; k++) {
    result[order[k]] += 1;
  }

  return result.map((v) => v * sign);
}

export function computeBalances(members, expenses) {
  if (!Array.isArray(members)) {
    throw new TypeError('members must be an array');
  }
  for (const m of members) {
    if (typeof m !== 'string' || m.length === 0) {
      throw new TypeError('every member must be a non-empty string');
    }
  }
  if (members.length === 0) {
    throw new RangeError('members must not be empty');
  }
  if (new Set(members).size !== members.length) {
    throw new RangeError('members must not contain duplicates');
  }

  if (!Array.isArray(expenses)) {
    throw new TypeError('expenses must be an array');
  }

  const memberSet = new Set(members);
  const balances = {};
  for (const m of members) {
    balances[m] = 0;
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
      throw new RangeError('payer must be one of members');
    }

    let participants;
    if (expense.participants !== undefined) {
      if (!Array.isArray(expense.participants)) {
        throw new TypeError('participants must be an array');
      }
      participants = expense.participants;
      if (participants.length === 0) {
        throw new RangeError('participants must not be empty');
      }
      if (new Set(participants).size !== participants.length) {
        throw new RangeError('participants must not contain duplicates');
      }
      for (const p of participants) {
        if (!memberSet.has(p)) {
          throw new RangeError('participants must all be members');
        }
      }
    } else {
      participants = members.slice();
    }

    let shares;
    if (expense.weights !== undefined) {
      if (!Array.isArray(expense.weights)) {
        throw new TypeError('weights must be an array');
      }
      if (expense.weights.length !== participants.length) {
        throw new RangeError('weights length must match participants length');
      }
      shares = splitByWeight(amountCents, expense.weights);
    } else {
      shares = splitEven(amountCents, participants.length);
    }

    balances[payer] += amountCents;
    for (let i = 0; i < participants.length; i++) {
      balances[participants[i]] -= shares[i];
    }
  }

  return balances;
}

function validateBalancesShape(balances) {
  if (!isPlainObject(balances)) {
    throw new TypeError('balances must be a plain object');
  }
  for (const key of Object.keys(balances)) {
    if (!Number.isInteger(balances[key])) {
      throw new TypeError('every balance value must be an integer');
    }
  }
}

export function settle(balances) {
  validateBalancesShape(balances);

  const sum = Object.values(balances).reduce((a, b) => a + b, 0);
  if (sum !== 0) {
    throw new RangeError('balances must sum to zero');
  }

  const entries = Object.entries(balances);
  const debtors = entries
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const creditors = entries
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const transfers = [];
  if (debtors.length === 0 || creditors.length === 0) {
    return transfers;
  }

  let di = 0;
  let ci = 0;
  let remainingDebt = debtors[di][1];
  let remainingCredit = creditors[ci][1];

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(remainingCredit, -remainingDebt);

    if (amount > 0) {
      transfers.push({ from: debtors[di][0], to: creditors[ci][0], amountCents: amount });
    }

    remainingDebt += amount;
    remainingCredit -= amount;

    if (remainingDebt === 0) {
      di++;
      if (di < debtors.length) {
        remainingDebt = debtors[di][1];
      }
    }
    if (remainingCredit === 0) {
      ci++;
      if (ci < creditors.length) {
        remainingCredit = creditors[ci][1];
      }
    }
  }

  return transfers;
}

export function applyTransfers(balances, transfers) {
  validateBalancesShape(balances);

  if (!Array.isArray(transfers)) {
    throw new TypeError('transfers must be an array');
  }

  const result = { ...balances };

  for (const t of transfers) {
    if (typeof t !== 'object' || t === null) {
      throw new TypeError('transfer must be a non-null object');
    }

    const { amountCents, from, to } = t;

    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (amountCents <= 0) {
      throw new RangeError('amountCents must be positive');
    }
    if (
      !Object.prototype.hasOwnProperty.call(balances, from) ||
      !Object.prototype.hasOwnProperty.call(balances, to)
    ) {
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
