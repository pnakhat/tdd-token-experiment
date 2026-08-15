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
  const result = [];
  for (let i = 0; i < parts; i++) {
    result.push(i < remainder ? base + 1 : base);
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
  for (let k = 0; k < leftover; k++) {
    result[order[k]] += 1;
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
    throw new RangeError('members must not contain duplicates');
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
    if (!Number.isInteger(expense.amountCents)) {
      throw new TypeError('amountCents must be an integer');
    }
    if (!members.includes(expense.payer)) {
      throw new RangeError('payer must be one of members');
    }
    if (expense.participants !== undefined && !Array.isArray(expense.participants)) {
      throw new TypeError('participants must be an array');
    }
    const participants = expense.participants ?? members;
    if (participants.length === 0) {
      throw new RangeError('participants must not be empty');
    }
    if (new Set(participants).size !== participants.length) {
      throw new RangeError('participants must not contain duplicates');
    }
    if (!participants.every((p) => members.includes(p))) {
      throw new RangeError('every participant must be in members');
    }
    balances[expense.payer] += expense.amountCents;
    const shares = splitEven(expense.amountCents, participants.length);
    for (let i = 0; i < participants.length; i++) {
      balances[participants[i]] -= shares[i];
    }
  }

  return balances;
}
