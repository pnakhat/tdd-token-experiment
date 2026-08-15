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
      throw new TypeError('weights must contain only integers');
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
  const n = weights.length;

  const base = new Array(n);
  const rem = new Array(n);
  let sumBase = 0;
  for (let i = 0; i < n; i++) {
    base[i] = Math.floor((T * weights[i]) / W);
    rem[i] = T * weights[i] - base[i] * W;
    sumBase += base[i];
  }
  const leftover = T - sumBase;

  const order = weights.map((_, i) => i).sort((a, b) => rem[b] - rem[a] || a - b);

  const result = base.slice();
  for (let k = 0; k < leftover; k++) {
    result[order[k]] += 1;
  }

  return result.map((x) => x * sign);
}

export function computeBalances(members, expenses) {
  if (!Array.isArray(members)) {
    throw new TypeError('members must be an array');
  }
  for (const m of members) {
    if (typeof m !== 'string' || m.length === 0) {
      throw new TypeError('members must contain only non-empty strings');
    }
  }
  if (members.length === 0) {
    throw new RangeError('members must not be empty');
  }
  const memberSet = new Set(members);
  if (memberSet.size !== members.length) {
    throw new RangeError('members must not contain duplicates');
  }

  if (!Array.isArray(expenses)) {
    throw new TypeError('expenses must be an array');
  }

  const balances = {};
  for (const m of members) {
    balances[m] = 0;
  }

  for (const expense of expenses) {
    if (typeof expense !== 'object' || expense === null) {
      throw new TypeError('each expense must be a non-null object');
    }
    const { payer, amountCents, participants } = expense;

    if (!Number.isInteger(amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (!memberSet.has(payer)) {
      throw new RangeError('payer must be in members');
    }

    let parts;
    if (participants !== undefined) {
      if (!Array.isArray(participants)) {
        throw new TypeError('participants must be an array');
      }
      if (participants.length === 0) {
        throw new RangeError('participants must not be empty');
      }
      const pSet = new Set(participants);
      if (pSet.size !== participants.length) {
        throw new RangeError('participants must not contain duplicates');
      }
      for (const p of participants) {
        if (!memberSet.has(p)) {
          throw new RangeError('participants must all be in members');
        }
      }
      parts = participants;
    } else {
      parts = members;
    }

    balances[payer] += amountCents;
    const shares = splitEven(amountCents, parts.length);
    for (let i = 0; i < parts.length; i++) {
      balances[parts[i]] -= shares[i];
    }
  }

  return balances;
}
