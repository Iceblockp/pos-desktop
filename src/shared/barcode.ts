export type BarcodeLabelFormat =
  | 'thermal-40x30' // 40mm x 30mm thermal label roll
  | 'thermal-50x30' // 50mm x 30mm thermal label roll
  | 'thermal-30x20' // 30mm x 20mm thermal label roll
  | 'receipt-58'   // 58mm thermal receipt paper roll
  | 'receipt-80'   // 80mm thermal receipt paper roll
  | 'a4-24'        // A4 sheet (3 cols x 8 rows = 24 labels)
  | 'a4-30'        // A4 sheet (3 cols x 10 rows = 30 labels)
  | 'a4-40';       // A4 sheet (4 cols x 10 rows = 40 labels)

export interface BarcodeLabelConfig {
  printerName?: string;
  format: BarcodeLabelFormat;
  includeShopName: boolean;
  includeProductName: boolean;
  includePrice: boolean;
  customWidthMm?: number;
  customHeightMm?: number;
}

export interface BarcodePrintItem {
  name: string;
  barcode: string;
  price: number;
  quantity: number;
}

/** EAN-13 Modulo-10 checksum calculation */
export function calculateEan13CheckDigit(first12Digits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12Digits[i] || '0', 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate a collision-free internal 13-digit EAN-13 barcode starting with '20'
 * (GS1 standard reserved prefix for in-store retail products)
 */
export function generateInternalBarcode(existingBarcodes?: Set<string> | string[]): string {
  const existing = existingBarcodes instanceof Set ? existingBarcodes : new Set(existingBarcodes ?? []);

  for (let attempt = 0; attempt < 500; attempt++) {
    const randPart = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const first12 = '20' + randPart;
    const check = calculateEan13CheckDigit(first12);
    const candidate = first12 + check;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  // Fallback timestamp
  const ts = String(Date.now()).slice(-10);
  const first12 = '20' + ts;
  return first12 + calculateEan13CheckDigit(first12);
}

// Code 128 Pattern Table (Patterns 0 to 106)
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
];

/** Encode any string to Code 128 (Subset B) pattern */
export function encodeCode128(text: string): string {
  const clean = text.trim() || '000000';
  let checksum = 104; // Start Code B
  const indices = [104];

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    const validCode = code >= 0 && code <= 95 ? code : 0;
    indices.push(validCode);
    checksum += validCode * (i + 1);
  }

  indices.push(checksum % 103);
  indices.push(106); // Stop Code

  let patternStr = '';
  for (const idx of indices) {
    patternStr += CODE128_PATTERNS[idx] ?? '212222';
  }
  return patternStr;
}

/** Render pure vector SVG barcode */
export function generateBarcodeSvg(
  barcode: string,
  options?: {
    height?: number;
    moduleWidth?: number;
    quietZone?: number;
    showText?: boolean;
    fontSize?: number;
  }
): string {
  const text = barcode.trim() || '000000';
  const height = options?.height ?? 50;
  const moduleWidth = options?.moduleWidth ?? 1.5;
  const quietZone = options?.quietZone ?? 10;
  const showText = options?.showText ?? true;
  const fontSize = options?.fontSize ?? 11;

  const pattern = encodeCode128(text);
  let x = quietZone;
  let isBar = true;
  const rects: string[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const w = parseInt(pattern[i] || '1', 10) * moduleWidth;
    if (isBar) {
      rects.push(`<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="#000" />`);
    }
    x += w;
    isBar = !isBar;
  }

  const totalWidth = x + quietZone;
  const totalHeight = showText ? height + fontSize + 4 : height;

  const textElement = showText
    ? `<text x="${(totalWidth / 2).toFixed(1)}" y="${(height + fontSize + 1).toFixed(1)}" font-family="ui-monospace, monospace" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="#000" letter-spacing="1">${text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(1)} ${totalHeight.toFixed(1)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="100%" height="100%" fill="#fff" />
    ${rects.join('\n')}
    ${textElement}
  </svg>`;
}
