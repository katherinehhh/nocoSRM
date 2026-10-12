export function parseAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimal = ''] = value.split('.'),
    n = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(n) ? n : null;
}
