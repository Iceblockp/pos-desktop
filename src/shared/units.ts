/** Units that can be sold in fractions. Everything else steps by whole numbers. */
const FRACTIONAL_UNITS = new Set([
  'kg', 'g', 'viss', 'ပိဿာ', 'litre', 'l', 'ml', 'lb',
]);

export function stepFor(unit: string): number {
  return FRACTIONAL_UNITS.has(unit) ? 0.5 : 1;
}
export function isFractional(unit: string): boolean {
  return FRACTIONAL_UNITS.has(unit);
}

