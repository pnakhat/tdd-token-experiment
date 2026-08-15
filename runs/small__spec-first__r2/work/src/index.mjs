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

  const result = new Array(parts);
  for (let i = 0; i < parts; i++) {
    result[i] = base + (i < remainder ? 1 : 0);
  }
  return result;
}
