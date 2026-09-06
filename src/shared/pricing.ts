/**
 * The retail level's fixed id. A tier with no level, and a cart that has picked
 * no level, both mean retail — so this is the value `null` normalises to on
 * either side of the comparison. It matches the id seeded in migration v4.
 */
export const DEFAULT_PRICE_LEVEL_ID = 'level-retail';

export interface BulkTier {
  minQuantity: number;
  bulkPrice: number;
  /** null (or absent) is retail. See DEFAULT_PRICE_LEVEL_ID. */
  priceLevelId?: string | null;
}

export interface PricedLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  /** Catalog price before any bulk tier. */
  listPrice: number;
  /** Price actually charged per unit, after bulk tiers. */
  unitPrice: number;
  unitCost: number;
  /** Manual per-line discount, in kyat off the line. */
  discount: number;
  /** unitPrice × quantity − discount, floored at zero. */
  subtotal: number;
  bulkApplied: boolean;
}

export interface CartTotals {
  gross: number;
  lineDiscounts: number;
  orderDiscount: number;
  total: number;
  itemCount: number;
}

/**
 * Pick the tier that applies at this quantity, within the chosen price level.
 *
 * Only tiers for the selected level are considered — a wholesale tier never
 * fires on a retail sale and vice versa. A tier with no level counts as retail,
 * so an existing "cheaper by the dozen" row still applies to a retail cart.
 * When the level has no matching tier the base list price stands, which is how
 * a product with no wholesale price simply sells at retail rather than at zero.
 *
 * Highest qualifying threshold wins, not the cheapest price — a shop that
 * enters a worse price at a higher tier has made a data-entry mistake, and
 * silently ignoring their tier would hide it. Tiers above the quantity never
 * apply, however cheap.
 */
export function resolveUnitPrice(
  listPrice: number,
  quantity: number,
  tiers: BulkTier[] = [],
  priceLevelId: string = DEFAULT_PRICE_LEVEL_ID,
): { unitPrice: number; bulkApplied: boolean } {
  let best: BulkTier | null = null;

  for (const tier of tiers) {
    if ((tier.priceLevelId ?? DEFAULT_PRICE_LEVEL_ID) !== priceLevelId) continue;
    if (quantity < tier.minQuantity) continue;
    if (!best || tier.minQuantity > best.minQuantity) best = tier;
  }

  return best
    ? { unitPrice: best.bulkPrice, bulkApplied: true }
    : { unitPrice: listPrice, bulkApplied: false };
}

export function priceLine(input: {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  listPrice: number;
  unitCost: number;
  discount?: number;
  tiers?: BulkTier[];
  priceLevelId?: string;
}): PricedLine {
  const { unitPrice, bulkApplied } = resolveUnitPrice(
    input.listPrice,
    input.quantity,
    input.tiers,
    input.priceLevelId,
  );

  const discount = Math.max(0, input.discount ?? 0);
  // Floored at zero: a discount larger than the line must never make the sale
  // pay the customer.
  const subtotal = Math.max(0, unitPrice * input.quantity - discount);

  return {
    productId: input.productId,
    name: input.name,
    unit: input.unit,
    quantity: input.quantity,
    listPrice: input.listPrice,
    unitPrice,
    unitCost: input.unitCost,
    discount,
    subtotal: round(subtotal),
    bulkApplied,
  };
}

/**
 * Roll lines plus a whole-order discount into the numbers shown on screen.
 *
 * The order discount is capped at what is left after line discounts, so two
 * generous discounts cannot combine into a negative total.
 */
export function cartTotals(
  lines: PricedLine[],
  orderDiscount = 0,
): CartTotals {
  const gross = round(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  );
  const lineDiscounts = round(
    lines.reduce((sum, line) => sum + line.discount, 0),
  );
  const afterLines = Math.max(0, gross - lineDiscounts);
  const cappedOrder = Math.min(Math.max(0, orderDiscount), afterLines);

  return {
    gross,
    lineDiscounts,
    orderDiscount: round(cappedOrder),
    total: round(afterLines - cappedOrder),
    itemCount: lines.length,
  };
}

/** Discount from a percentage of the post-line-discount amount. */
export function percentOf(lines: PricedLine[], percent: number): number {
  const { gross, lineDiscounts } = cartTotals(lines);
  return round(Math.max(0, gross - lineDiscounts) * (percent / 100));
}

/**
 * Money is REAL in SQLite, so repeated arithmetic drifts. Rounding to three
 * decimals at every boundary keeps a total from becoming 12499.999999998 and
 * printing a kyat short.
 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
