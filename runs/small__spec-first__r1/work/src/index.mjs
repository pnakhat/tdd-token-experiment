export function splitEven(totalCents, parts) {
  if (typeof totalCents !== 'number' || !Number.isInteger(totalCents)) {
    throw new TypeError('totalCents must be an integer');
  }
  if (typeof parts !== 'number' || !Number.isInteger(parts)) {
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
