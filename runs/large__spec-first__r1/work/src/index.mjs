// ledger — integer-cents money splitting and settlement utilities.

export function splitEven(totalCents, parts) {
  if (!Number.isInteger(totalCents)) throw new TypeError('totalCents must be an integer');
  if (!Number.isInteger(parts)) throw new TypeError('parts must be an integer');
  if (parts < 1) throw new RangeError('parts must be >= 1');

  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;

  const result = new Array(parts).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i] += 1;
  }
  return result;
}

export function splitByWeight(totalCents, weights) {
  if (!Number.isInteger(totalCents)) throw new TypeError('totalCents must be an integer');
  if (!Array.isArray(weights)) throw new TypeError('weights must be an array');
  for (const w of weights) {
    if (!Number.isInteger(w)) throw new TypeError('every weight must be an integer');
  }
  if (weights.length === 0) throw new RangeError('weights must not be empty');
  for (const w of weights) {
    if (w < 0) throw new RangeError('weights must not be negative');
  }
  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) throw new RangeError('sum of weights must not be 0');

  const sign = totalCents < 0 ? -1 : 1;
  const T = Math.abs(totalCents);

  const base = weights.map((w) => Math.floor((T * w) / W));
  const rem = weights.map((w, i) => T * w - base[i] * W);
  const sumBase = base.reduce((a, b) => a + b, 0);
  const leftover = T - sumBase;

  const order = weights.map((_, i) => i).sort((a, b) => {
    if (rem[b] !== rem[a]) return rem[b] - rem[a];
    return a - b;
  });

  for (let k = 0; k < leftover; k++) {
    base[order[k]] += 1;
  }

  return base.map((v) => v * sign);
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
    throw new RangeError('members must not contain duplicates');
  }

  if (!Array.isArray(expenses)) throw new TypeError('expenses must be an array');

  const balances = Object.fromEntries(members.map((m) => [m, 0]));

  for (const expense of expenses) {
    if (typeof expense !== 'object' || expense === null) {
      throw new TypeError('expense must be a non-null object');
    }

    const { payer, amountCents } = expense;

    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (!members.includes(payer)) {
      throw new RangeError('payer must be a member');
    }

    let participants;
    if (expense.participants !== undefined) {
      participants = expense.participants;
      if (!Array.isArray(participants)) {
        throw new TypeError('participants must be an array');
      }
      if (participants.length === 0) {
        throw new RangeError('participants must not be empty');
      }
      if (new Set(participants).size !== participants.length) {
        throw new RangeError('participants must not contain duplicates');
      }
      for (const p of participants) {
        if (!members.includes(p)) {
          throw new RangeError('participant must be a member');
        }
      }
    } else {
      participants = members;
    }

    let shares;
    if (expense.weights !== undefined) {
      const weights = expense.weights;
      if (!Array.isArray(weights)) {
        throw new TypeError('weights must be an array');
      }
      if (weights.length !== participants.length) {
        throw new RangeError('weights.length must match participants length');
      }
      shares = splitByWeight(amountCents, weights);
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

function assertBalancesShape(balances) {
  if (typeof balances !== 'object' || balances === null || Array.isArray(balances)) {
    throw new TypeError('balances must be a non-null plain object');
  }
  for (const v of Object.values(balances)) {
    if (!Number.isInteger(v)) {
      throw new TypeError('every balance must be an integer');
    }
  }
}

export function settle(balances) {
  assertBalancesShape(balances);

  const entries = Object.entries(balances);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum !== 0) throw new RangeError('balances must sum to 0');

  const debtors = entries
    .filter(([, v]) => v < 0)
    .sort(([ka, va], [kb, vb]) => (va !== vb ? va - vb : ka < kb ? -1 : ka > kb ? 1 : 0));
  const creditors = entries
    .filter(([, v]) => v > 0)
    .sort(([ka, va], [kb, vb]) => (va !== vb ? vb - va : ka < kb ? -1 : ka > kb ? 1 : 0));

  const transfers = [];
  let i = 0;
  let j = 0;
  if (debtors.length === 0 || creditors.length === 0) return transfers;

  let remainingDebt = debtors[i][1];
  let remainingCredit = creditors[j][1];

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(remainingCredit, -remainingDebt);
    if (amount !== 0) {
      transfers.push({ from: debtors[i][0], to: creditors[j][0], amountCents: amount });
    }
    remainingDebt += amount;
    remainingCredit -= amount;

    if (remainingDebt === 0) {
      i++;
      if (i < debtors.length) remainingDebt = debtors[i][1];
    }
    if (remainingCredit === 0) {
      j++;
      if (j < creditors.length) remainingCredit = creditors[j][1];
    }
  }

  return transfers;
}

export function applyTransfers(balances, transfers) {
  assertBalancesShape(balances);

  if (!Array.isArray(transfers)) throw new TypeError('transfers must be an array');

  const result = { ...balances };

  for (const t of transfers) {
    if (typeof t !== 'object' || t === null) {
      throw new TypeError('transfer must be a non-null object');
    }
    const { from, to, amountCents } = t;
    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (amountCents <= 0) {
      throw new RangeError('amountCents must be > 0');
    }
    if (!Object.prototype.hasOwnProperty.call(balances, from)) {
      throw new RangeError('from must be a key of balances');
    }
    if (!Object.prototype.hasOwnProperty.call(balances, to)) {
      throw new RangeError('to must be a key of balances');
    }
    if (from === to) {
      throw new RangeError('from must not equal to');
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
