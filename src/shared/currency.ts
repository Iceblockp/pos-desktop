export interface CurrencyConfig { code: string; name: string; symbol: string; decimalPlaces: 0 | 1 | 2 | 3; symbolPosition: 'before' | 'after'; }
export const DEFAULT_CURRENCY: CurrencyConfig = { code: 'MMK', name: 'Myanmar Kyat', symbol: 'MMK', decimalPlaces: 0, symbolPosition: 'after' };
export const CURRENCY_PRESETS: CurrencyConfig[] = [
  DEFAULT_CURRENCY,
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 0, symbolPosition: 'before' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0, symbolPosition: 'after' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, symbolPosition: 'before' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimalPlaces: 0, symbolPosition: 'before' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, symbolPosition: 'before' },
];
export function parseCurrency(value: string | null | undefined): CurrencyConfig {
  try { const c = JSON.parse(value || '') as Partial<CurrencyConfig>; if (!/^[A-Z0-9]{2,8}$/.test(c.code || '') || !c.name?.trim() || !c.symbol?.trim() || ![0,1,2,3].includes(c.decimalPlaces as number)) return DEFAULT_CURRENCY; return { code: c.code!, name: c.name.trim(), symbol: c.symbol.trim(), decimalPlaces: c.decimalPlaces as CurrencyConfig['decimalPlaces'], symbolPosition: c.symbolPosition === 'after' ? 'after' : 'before' }; } catch { return DEFAULT_CURRENCY; }
}
export function formatCurrency(value: number, currency: CurrencyConfig = currentCurrency()): string {
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: currency.decimalPlaces, maximumFractionDigits: currency.decimalPlaces }).format(Math.abs(Number.isFinite(value) ? value : 0));
  const sign = value < 0 ? '−' : '';
  return currency.symbolPosition === 'before' ? `${sign}${currency.symbol}${number}` : `${sign}${number} ${currency.symbol}`;
}
export function currentCurrency(): CurrencyConfig { return parseCurrency(typeof localStorage === 'undefined' ? null : localStorage.getItem('store-pos.currency')); }
export function cacheCurrency(currency: CurrencyConfig) { localStorage.setItem('store-pos.currency', JSON.stringify(currency)); }
