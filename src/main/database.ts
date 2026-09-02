import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  CartLine,
  Customer,
  Dashboard,
  Product,
  Receipt,
  ReturnableLine,
  SaleDraft,
  SaleSummary,
} from '../shared/models';

type SyncTable = {
  name: string;
  strategy: 'append_only' | 'last_write_wins';
  columns: readonly string[];
};

/** Same wire contract as the mobile app and Store POS API. */
export const SYNC_TABLES: SyncTable[] = [
  { name: 'shop_settings', strategy: 'last_write_wins', columns: ['key', 'value'] },
  { name: 'payment_methods', strategy: 'last_write_wins', columns: ['name', 'code', 'icon', 'color', 'sortOrder', 'isActive'] },
  { name: 'categories', strategy: 'last_write_wins', columns: ['name', 'sortOrder'] },
  { name: 'suppliers', strategy: 'last_write_wins', columns: ['name', 'contactName', 'phone', 'email', 'address'] },
  { name: 'expense_categories', strategy: 'last_write_wins', columns: ['name', 'description'] },
  { name: 'customers', strategy: 'last_write_wins', columns: ['name', 'phone', 'email', 'address', 'note'] },
  { name: 'products', strategy: 'last_write_wins', columns: ['name', 'barcode', 'categoryId', 'supplierId', 'price', 'cost', 'minStock', 'unit', 'imageUrl', 'isActive'] },
  { name: 'price_levels', strategy: 'last_write_wins', columns: ['name', 'isDefault', 'sortOrder'] },
  { name: 'bulk_pricing', strategy: 'last_write_wins', columns: ['productId', 'minQuantity', 'bulkPrice', 'priceLevelId'] },
  { name: 'cash_sessions', strategy: 'last_write_wins', columns: ['status', 'openedByName', 'closedByName', 'openingFloat', 'expectedCash', 'countedCash', 'difference', 'note', 'openedAt', 'closedAt'] },
  { name: 'sales', strategy: 'append_only', columns: ['voucherId', 'type', 'originalSaleId', 'subtotal', 'discount', 'total', 'customerId', 'cashSessionId', 'staffName', 'note', 'soldAt', 'priceLevelId'] },
  { name: 'sale_items', strategy: 'append_only', columns: ['saleId', 'productId', 'productName', 'unit', 'quantity', 'unitPrice', 'unitCost', 'discount', 'subtotal'] },
  { name: 'stock_movements', strategy: 'append_only', columns: ['productId', 'type', 'quantityDelta', 'unitCost', 'referenceId', 'supplierId', 'referenceNumber', 'reason', 'occurredAt'] },
  { name: 'payments', strategy: 'append_only', columns: ['saleId', 'customerId', 'amount', 'methodCode', 'methodName', 'tendered', 'cashSessionId', 'note', 'paidAt'] },
  { name: 'expenses', strategy: 'last_write_wins', columns: ['categoryId', 'name', 'amount', 'note', 'attachmentUrl', 'cashSessionId', 'spentAt'] },
  { name: 'activity_log', strategy: 'append_only', columns: ['actor', 'action', 'detail', 'amount', 'referenceId', 'occurredAt'] },
];

const SYNC_BY_NAME = new Map(SYNC_TABLES.map((table) => [table.name, table]));
const now = () => new Date().toISOString();

/**
 * SQLite is kept exclusively in Electron's main process. Every row uses the
 * same envelope as mobile: dirty means not yet accepted by the API; serverSeq
 * is the server's monotonic pull cursor.
 */
export class PosDatabase {
  readonly sqlite: DatabaseSync;

  constructor(filename: string) {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
    this.migrate();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS shop_settings (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, key TEXT NOT NULL UNIQUE, value TEXT);
      CREATE TABLE IF NOT EXISTS payment_methods (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, code TEXT NOT NULL, icon TEXT, color TEXT, sortOrder INTEGER NOT NULL DEFAULT 0, isActive INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, contactName TEXT, phone TEXT, email TEXT, address TEXT);
      CREATE TABLE IF NOT EXISTS expense_categories (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, description TEXT);
      CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, note TEXT);
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, barcode TEXT, categoryId TEXT, supplierId TEXT, price REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, quantity REAL NOT NULL DEFAULT 0, minStock REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'pcs', imageUrl TEXT, isActive INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE TABLE IF NOT EXISTS price_levels (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, isDefault INTEGER NOT NULL DEFAULT 0, sortOrder INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS bulk_pricing (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, productId TEXT NOT NULL, minQuantity REAL NOT NULL DEFAULT 0, bulkPrice REAL NOT NULL DEFAULT 0, priceLevelId TEXT);
      CREATE TABLE IF NOT EXISTS cash_sessions (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', openedByName TEXT, closedByName TEXT, openingFloat REAL NOT NULL DEFAULT 0, expectedCash REAL, countedCash REAL, difference REAL, note TEXT, openedAt TEXT NOT NULL, closedAt TEXT);
      CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, voucherId TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'sale', originalSaleId TEXT, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, customerId TEXT, cashSessionId TEXT, staffName TEXT, note TEXT, soldAt TEXT NOT NULL, priceLevelId TEXT);
      CREATE TABLE IF NOT EXISTS sale_items (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, saleId TEXT NOT NULL, productId TEXT NOT NULL, productName TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'pcs', quantity REAL NOT NULL DEFAULT 0, unitPrice REAL NOT NULL DEFAULT 0, unitCost REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, productId TEXT NOT NULL, type TEXT NOT NULL, quantityDelta REAL NOT NULL DEFAULT 0, unitCost REAL, referenceId TEXT, supplierId TEXT, referenceNumber TEXT, reason TEXT, occurredAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, saleId TEXT, customerId TEXT, amount REAL NOT NULL DEFAULT 0, methodCode TEXT NOT NULL, methodName TEXT NOT NULL, tendered REAL, cashSessionId TEXT, note TEXT, paidAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, categoryId TEXT, name TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, note TEXT, attachmentUrl TEXT, cashSessionId TEXT, spentAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, deletedAt TEXT, serverSeq INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, actor TEXT, action TEXT NOT NULL, detail TEXT, amount REAL, referenceId TEXT, occurredAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS sync_conflicts (id TEXT PRIMARY KEY, tableName TEXT NOT NULL, rowId TEXT NOT NULL, discarded TEXT NOT NULL, detectedAt TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);
    `);
    for (const table of SYNC_TABLES) {
      this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_${table.name}_dirty ON ${table.name}(dirty) WHERE dirty = 1`);
    }
    this.setState('voucher.sequence', this.getState('voucher.sequence') ?? '0');
  }

  getState(key: string): string | null {
    return (this.sqlite.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value?: string } | undefined)?.value ?? null;
  }

  setState(key: string, value: string | null): void {
    this.sqlite.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  listProducts(search = ''): Product[] {
    const pattern = `%${search.trim()}%`;
    return this.sqlite.prepare(`SELECT id, name, barcode, categoryId, price, cost, quantity, minStock, unit, isActive FROM products WHERE deletedAt IS NULL AND isActive = 1 AND (name LIKE ? OR barcode LIKE ?) ORDER BY name LIMIT 300`).all(pattern, pattern).map(toProduct);
  }

  findBarcode(code: string): Product | null {
    const row = this.sqlite.prepare('SELECT id, name, barcode, categoryId, price, cost, quantity, minStock, unit, isActive FROM products WHERE barcode = ? AND deletedAt IS NULL AND isActive = 1').get(code);
    return row ? toProduct(row) : null;
  }

  saveProduct(input: Partial<Product> & Pick<Product, 'name' | 'price'>): Product {
    const id = input.id || randomUUID();
    const old = input.id ? this.sqlite.prepare('SELECT * FROM products WHERE id = ?').get(input.id) as Record<string, unknown> | undefined : undefined;
    const row = {
      id,
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      categoryId: input.categoryId ?? null,
      price: Number(input.price), cost: Number(input.cost ?? old?.cost ?? 0),
      quantity: Number(old?.quantity ?? 0), minStock: Number(input.minStock ?? old?.minStock ?? 0),
      unit: input.unit?.trim() || String(old?.unit ?? 'pcs'), isActive: input.isActive === false ? 0 : 1,
    };
    if (!row.name || !Number.isFinite(row.price) || row.price < 0) throw new Error('Product name and a non-negative price are required');
    this.writeLocal('products', row);
    // Quantity is derived from the stock ledger, never replicated as an
    // absolute value. An opening amount is therefore an explicit movement.
    const openingQuantity = old ? 0 : Number(input.quantity ?? 0);
    if (openingQuantity) {
      this.writeLocal('stock_movements', { id: randomUUID(), productId: id, type: 'opening', quantityDelta: openingQuantity, unitCost: row.cost, referenceId: null, supplierId: null, referenceNumber: null, reason: 'Initial desktop inventory', occurredAt: now() });
      this.sqlite.prepare('UPDATE products SET quantity = ? WHERE id = ?').run(openingQuantity, id);
    }
    return this.findProduct(id)!;
  }

  private findProduct(id: string): Product | null {
    const row = this.sqlite.prepare('SELECT id, name, barcode, categoryId, price, cost, quantity, minStock, unit, isActive FROM products WHERE id = ?').get(id);
    return row ? toProduct(row) : null;
  }

  listCustomers(): Customer[] {
    return this.sqlite.prepare('SELECT id, name, phone, note FROM customers WHERE deletedAt IS NULL ORDER BY name LIMIT 300').all().map((row: any) => ({ ...row, phone: row.phone ?? null, note: row.note ?? null }));
  }

  saveCustomer(input: Partial<Customer> & Pick<Customer, 'name'>): Customer {
    const id = input.id || randomUUID();
    if (!input.name.trim()) throw new Error('Customer name is required');
    this.writeLocal('customers', { id, name: input.name.trim(), phone: input.phone?.trim() || null, note: input.note?.trim() || null, email: null, address: null });
    const customer = this.sqlite.prepare('SELECT id, name, phone, note FROM customers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!customer) throw new Error('Customer could not be saved');
    return { id: String(customer.id), name: String(customer.name), phone: customer.phone == null ? null : String(customer.phone), note: customer.note == null ? null : String(customer.note) };
  }

  checkout(draft: SaleDraft): Receipt {
    if (!draft.lines.length) throw new Error('Add at least one product to the sale');
    return this.transaction(() => {
      const soldAt = now();
      const sequence = Number(this.getState('voucher.sequence') ?? '0') + 1;
      this.setState('voucher.sequence', String(sequence));
      const deviceCode = this.getState('device.code') ?? 'D';
      const voucherId = `${deviceCode}-${String(sequence).padStart(6, '0')}`;
      const saleId = randomUUID();
      const subtotal = draft.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discount, 0);
      const discount = Number(draft.discount ?? 0);
      const total = Math.max(0, subtotal - discount);
      const amountTendered = draft.amountTendered == null ? null : Number(draft.amountTendered);
      if (draft.paymentMethod === 'debt' && !draft.customerId) throw new Error('Choose a customer before recording a debt sale');
      const openSession = this.sqlite.prepare("SELECT id FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1").get() as any;
      const cashSessionId = openSession?.id ?? null;
      this.writeLocal('sales', { id: saleId, voucherId, type: 'sale', originalSaleId: null, subtotal, discount, total, customerId: draft.customerId ?? null, cashSessionId, staffName: draft.staffName ?? null, note: draft.note?.trim() || null, soldAt, priceLevelId: null });
      for (const line of draft.lines) {
        const product = this.findProduct(line.productId);
        if (!product) throw new Error(`Product no longer exists: ${line.name}`);
        const itemSubtotal = line.quantity * line.unitPrice - line.discount;
        this.writeLocal('sale_items', { id: randomUUID(), saleId, productId: product.id, productName: product.name, unit: line.unit, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, discount: line.discount, subtotal: itemSubtotal });
        this.writeLocal('stock_movements', { id: randomUUID(), productId: product.id, type: 'sale', quantityDelta: -line.quantity, unitCost: line.unitCost, referenceId: saleId, supplierId: null, referenceNumber: voucherId, reason: null, occurredAt: soldAt });
        this.sqlite.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?').run(line.quantity, product.id);
      }
      if (draft.paymentMethod !== 'debt') this.writeLocal('payments', { id: randomUUID(), saleId, customerId: draft.customerId ?? null, amount: total, methodCode: draft.paymentMethod, methodName: draft.paymentMethod, tendered: amountTendered, cashSessionId, note: null, paidAt: soldAt });
      this.writeLocal('activity_log', { id: randomUUID(), actor: draft.staffName ?? 'Desktop', action: 'sale.create', detail: voucherId, amount: total, referenceId: saleId, occurredAt: soldAt });
      const shopName = this.getShopSetting('shop.name') ?? 'Store POS';
      return { voucherId, shopName, shopPhone: this.getShopSetting('shop.phone'), soldAt, paymentMethod: draft.paymentMethod, subtotal, discount, total, amountTendered, change: amountTendered == null ? null : Math.max(0, amountTendered - total), lines: draft.lines };
    });
  }

  listSales(search = ''): SaleSummary[] {
    const term = `%${search.trim()}%`;
    return this.sqlite.prepare(`SELECT s.id, s.voucherId, s.type, s.total, s.soldAt, c.name AS customerName,
      COALESCE((SELECT p.methodCode FROM payments p WHERE p.saleId = s.id AND p.deletedAt IS NULL ORDER BY p.paidAt LIMIT 1), 'debt') AS paymentMethod
      FROM sales s LEFT JOIN customers c ON c.id = s.customerId
      WHERE s.deletedAt IS NULL AND (s.voucherId LIKE ? OR COALESCE(c.name, '') LIKE ?)
      ORDER BY s.soldAt DESC, s.id DESC LIMIT 200`).all(term, term).map((row: any) => ({
      id: String(row.id), voucherId: String(row.voucherId), type: row.type === 'return' ? 'return' : 'sale', total: Number(row.total), soldAt: String(row.soldAt), customerName: row.customerName ?? null, paymentMethod: String(row.paymentMethod),
    }));
  }

  receiptForSale(voucherId: string): Receipt | null {
    const sale = this.sqlite.prepare(`SELECT voucherId, subtotal, discount, total, soldAt FROM sales WHERE voucherId = ? AND deletedAt IS NULL`).get(voucherId) as any;
    if (!sale) return null;
    const payment = this.sqlite.prepare(`SELECT methodCode, tendered FROM payments WHERE saleId = (SELECT id FROM sales WHERE voucherId = ? AND deletedAt IS NULL) AND deletedAt IS NULL ORDER BY paidAt LIMIT 1`).get(voucherId) as any;
    const lines = this.sqlite.prepare(`SELECT productId, productName AS name, unit, quantity, unitPrice, unitCost, discount FROM sale_items WHERE saleId = (SELECT id FROM sales WHERE voucherId = ? AND deletedAt IS NULL) AND deletedAt IS NULL ORDER BY id`).all(voucherId).map((row: any) => ({ productId: String(row.productId), name: String(row.name), unit: String(row.unit), quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), unitCost: Number(row.unitCost), discount: Number(row.discount) }));
    const amountTendered = payment?.tendered == null ? null : Number(payment.tendered);
    return { voucherId: String(sale.voucherId), shopName: this.getShopSetting('shop.name') ?? 'Store POS', shopPhone: this.getShopSetting('shop.phone'), soldAt: String(sale.soldAt), paymentMethod: payment?.methodCode ?? 'debt', subtotal: Number(sale.subtotal), discount: Number(sale.discount), total: Number(sale.total), amountTendered, change: amountTendered == null ? null : Math.max(0, amountTendered - Number(sale.total)), lines };
  }

  returnableSale(voucherId: string): ReturnableLine[] | null {
    const sale = this.sqlite.prepare("SELECT id, type, discount FROM sales WHERE voucherId = ? AND deletedAt IS NULL").get(voucherId) as any;
    if (!sale || sale.type !== 'sale') return null;
    const items = this.sqlite.prepare('SELECT productId, productName AS name, unit, quantity, unitPrice, unitCost, discount, subtotal FROM sale_items WHERE saleId = ? AND deletedAt IS NULL ORDER BY id').all(sale.id) as any[];
    const returnedRows = this.sqlite.prepare(`SELECT i.productId, ABS(SUM(i.quantity)) AS quantity FROM sale_items i JOIN sales r ON r.id = i.saleId WHERE r.originalSaleId = ? AND r.deletedAt IS NULL AND i.deletedAt IS NULL GROUP BY i.productId`).all(sale.id) as any[];
    const returned = new Map(returnedRows.map((row) => [String(row.productId), Number(row.quantity)]));
    const gross = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
    return items.map((item) => {
      const quantity = Number(item.quantity); const prior = returned.get(String(item.productId)) ?? 0;
      const value = Number(item.subtotal) - (gross > 0 ? Number(sale.discount) * Number(item.subtotal) / gross : 0);
      return { productId: String(item.productId), name: String(item.name), unit: String(item.unit), quantity, returned: prior, returnable: round(Math.max(0, quantity - prior)), refundPerUnit: quantity ? round(value / quantity) : 0, unitCost: Number(item.unitCost) };
    }).filter((line) => line.returnable > 0);
  }

  returnSale(voucherId: string, wanted: Array<{ productId: string; quantity: number }>, refundMethod: string, note?: string): Receipt {
    const source = this.sqlite.prepare("SELECT id, customerId, type FROM sales WHERE voucherId = ? AND deletedAt IS NULL").get(voucherId) as any;
    const available = this.returnableSale(voucherId); if (!source || !available || source.type !== 'sale') throw new Error('That transaction cannot be returned');
    const byProduct = new Map(available.map((line) => [line.productId, line]));
    const lines = wanted.filter((line) => line.quantity > 0).map((line) => {
      const original = byProduct.get(line.productId); if (!original) throw new Error('That product is no longer returnable');
      const quantity = Number(line.quantity); if (!Number.isFinite(quantity) || quantity > original.returnable + 0.0001) throw new Error(`Only ${original.returnable} ${original.unit} can be returned for ${original.name}`);
      return { ...original, quantity };
    });
    if (!lines.length) throw new Error('Choose at least one item to return');
    if (!['cash', 'card', 'transfer', 'debt'].includes(refundMethod)) throw new Error('Choose a valid refund method');
    if (refundMethod === 'debt' && !source.customerId) throw new Error('Customer credit requires a customer on the original sale');
    const value = round(lines.reduce((sum, line) => sum + line.refundPerUnit * line.quantity, 0));
    const soldAt = now(); const sequence = Number(this.getState('voucher.sequence') ?? '0') + 1; this.setState('voucher.sequence', String(sequence));
    const returnId = randomUUID(); const returnVoucher = `${this.getState('device.code') ?? 'D'}-${String(sequence).padStart(6, '0')}`;
    const session = this.sqlite.prepare("SELECT id FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1").get() as any;
    this.transaction(() => {
      this.writeLocal('sales', { id: returnId, voucherId: returnVoucher, type: 'return', originalSaleId: source.id, subtotal: -value, discount: 0, total: -value, customerId: source.customerId ?? null, cashSessionId: session?.id ?? null, staffName: 'Desktop', note: note?.trim() || `Return for ${voucherId}`, soldAt, priceLevelId: null });
      for (const line of lines) {
        const subtotal = -round(line.refundPerUnit * line.quantity);
        this.writeLocal('sale_items', { id: randomUUID(), saleId: returnId, productId: line.productId, productName: line.name, unit: line.unit, quantity: -line.quantity, unitPrice: line.refundPerUnit, unitCost: line.unitCost, discount: 0, subtotal });
        this.writeLocal('stock_movements', { id: randomUUID(), productId: line.productId, type: 'return', quantityDelta: line.quantity, unitCost: line.unitCost, referenceId: returnId, supplierId: null, referenceNumber: returnVoucher, reason: note?.trim() || `Return for ${voucherId}`, occurredAt: soldAt });
        this.sqlite.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(line.quantity, line.productId);
      }
      if (refundMethod !== 'debt') this.writeLocal('payments', { id: randomUUID(), saleId: returnId, customerId: source.customerId ?? null, amount: -value, methodCode: refundMethod, methodName: refundMethod, tendered: null, cashSessionId: session?.id ?? null, note: note?.trim() || `Refund for ${voucherId}`, paidAt: soldAt });
      this.writeLocal('activity_log', { id: randomUUID(), actor: 'Desktop', action: 'sale.return', detail: `${returnVoucher} for ${voucherId}`, amount: -value, referenceId: returnId, occurredAt: soldAt });
    });
    return this.receiptForSale(returnVoucher)!;
  }

  dashboard(): Dashboard {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const day = since.toISOString();
    const total = this.sqlite.prepare("SELECT COUNT(*) AS salesToday, COALESCE(SUM(total), 0) AS revenueToday FROM sales WHERE type = 'sale' AND deletedAt IS NULL AND soldAt >= ?").get(day) as any;
    const low = this.sqlite.prepare('SELECT COUNT(*) AS count FROM products WHERE deletedAt IS NULL AND isActive = 1 AND quantity <= minStock').get() as any;
    return { salesToday: Number(total.salesToday), revenueToday: Number(total.revenueToday), lowStock: Number(low.count), pendingSync: this.countDirty() };
  }

  listDebtors(): Array<{ id: string; name: string; phone: string | null; debt: number }> {
    return this.sqlite.prepare(`SELECT * FROM (SELECT c.id, c.name, c.phone, MAX(0, COALESCE((SELECT SUM(total) FROM sales WHERE customerId = c.id AND deletedAt IS NULL), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE customerId = c.id AND deletedAt IS NULL), 0)) AS debt FROM customers c WHERE c.deletedAt IS NULL) WHERE debt > 0 ORDER BY debt DESC`).all().map((row: any) => ({ id: String(row.id), name: String(row.name), phone: row.phone ?? null, debt: Number(row.debt) }));
  }

  collectDebt(customerId: string, amount: number, methodCode: string, note?: string): void {
    if (!(amount > 0)) throw new Error('Collection amount must be more than zero');
    const customer = this.sqlite.prepare('SELECT id FROM customers WHERE id = ? AND deletedAt IS NULL').get(customerId); if (!customer) throw new Error('Customer not found');
    const session = this.sqlite.prepare("SELECT id FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1").get() as any;
    const paidAt = now();
    this.transaction(() => {
      this.writeLocal('payments', { id: randomUUID(), saleId: null, customerId, amount, methodCode, methodName: methodCode, tendered: null, cashSessionId: session?.id ?? null, note: note?.trim() || null, paidAt });
      this.writeLocal('activity_log', { id: randomUUID(), actor: 'Desktop', action: 'debt.collection', detail: note?.trim() || null, amount, referenceId: customerId, occurredAt: paidAt });
    });
  }

  cashSession(): any {
    const session = this.sqlite.prepare("SELECT id, status, openingFloat, expectedCash, countedCash, difference, openedAt, closedAt FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1").get() as any;
    if (!session) return null;
    const cashIn = Number((this.sqlite.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE cashSessionId = ? AND methodCode = 'cash' AND deletedAt IS NULL").get(session.id) as any).total);
    const cashOut = Number((this.sqlite.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE cashSessionId = ? AND deletedAt IS NULL').get(session.id) as any).total);
    return { ...session, openingFloat: Number(session.openingFloat), expectedCash: Number(session.openingFloat) + cashIn - cashOut };
  }

  openCashSession(openingFloat: number): any {
    if (this.cashSession()) throw new Error('A till session is already open');
    const openedAt = now(); const id = randomUUID();
    this.writeLocal('cash_sessions', { id, status: 'open', openedByName: 'Desktop', closedByName: null, openingFloat: Number(openingFloat) || 0, expectedCash: null, countedCash: null, difference: null, note: null, openedAt, closedAt: null });
    return this.cashSession();
  }

  closeCashSession(countedCash: number): any {
    const session = this.cashSession(); if (!session) throw new Error('No open till session');
    const cashIn = Number((this.sqlite.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE cashSessionId = ? AND methodCode = 'cash' AND deletedAt IS NULL").get(session.id) as any).total);
    const cashOut = Number((this.sqlite.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE cashSessionId = ? AND deletedAt IS NULL').get(session.id) as any).total);
    const expected = Number(session.openingFloat) + cashIn - cashOut; const counted = Number(countedCash); if (!Number.isFinite(counted)) throw new Error('Counted cash is required');
    this.writeLocal('cash_sessions', { ...session, status: 'closed', expectedCash: expected, countedCash: counted, difference: counted - expected, closedByName: 'Desktop', closedAt: now() });
    return { expected, counted, difference: counted - expected };
  }

  listExpenses(): any[] { return this.sqlite.prepare('SELECT id, name, amount, note, spentAt FROM expenses WHERE deletedAt IS NULL ORDER BY spentAt DESC LIMIT 100').all().map((row: any) => ({ ...row, amount: Number(row.amount) })); }

  saveExpense(name: string, amount: number, note?: string): void {
    if (!name.trim() || !(amount > 0)) throw new Error('Expense name and amount are required'); const session = this.cashSession(); const spentAt = now();
    this.transaction(() => { this.writeLocal('expenses', { id: randomUUID(), categoryId: null, name: name.trim(), amount, note: note?.trim() || null, attachmentUrl: null, cashSessionId: session?.id ?? null, spentAt }); this.writeLocal('activity_log', { id: randomUUID(), actor: 'Desktop', action: 'expense.create', detail: name.trim(), amount, referenceId: null, occurredAt: spentAt }); });
  }

  getShopSetting(key: string): string | null {
    return (this.sqlite.prepare('SELECT value FROM shop_settings WHERE key = ? AND deletedAt IS NULL').get(key) as any)?.value ?? null;
  }

  countDirty(): number {
    return SYNC_TABLES.reduce((total, table) => total + Number((this.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table.name} WHERE dirty = 1`).get() as any).count), 0);
  }

  dirtyChanges(limit = 500): any[] {
    const changes: any[] = [];
    for (const table of SYNC_TABLES) {
      for (const row of this.sqlite.prepare(`SELECT * FROM ${table.name} WHERE dirty = 1 ORDER BY id LIMIT ?`).all(limit - changes.length) as Record<string, unknown>[]) {
        changes.push({ table: table.name, id: row.id, updatedAt: row.updatedAt, deletedAt: row.deletedAt ?? null, data: Object.fromEntries(table.columns.filter((column) => column in row).map((column) => [column, row[column]])) });
        if (changes.length >= limit) return changes;
      }
    }
    return changes;
  }

  reconcilePush(sent: any[], response: { accepted: any[]; skipped: any[] }): void {
    const sentByKey = new Map(sent.map((item) => [`${item.table}:${item.id}`, item]));
    for (const accepted of response.accepted ?? []) {
      const change = sentByKey.get(`${accepted.table}:${accepted.id}`); if (!change || !SYNC_BY_NAME.has(accepted.table)) continue;
      this.sqlite.prepare(`UPDATE ${accepted.table} SET dirty = 0, serverSeq = ? WHERE id = ? AND updatedAt = ?`).run(accepted.serverSeq, accepted.id, change.updatedAt);
    }
    for (const skipped of response.skipped ?? []) {
      const change = sentByKey.get(`${skipped.table}:${skipped.id}`); if (!change || !SYNC_BY_NAME.has(skipped.table)) continue;
      if (skipped.reason === 'duplicate') this.sqlite.prepare(`UPDATE ${skipped.table} SET dirty = 0 WHERE id = ? AND updatedAt = ?`).run(skipped.id, change.updatedAt);
      if (skipped.reason === 'stale') {
        this.recordConflict(skipped.table, skipped.id, change.data);
        this.sqlite.prepare(`UPDATE ${skipped.table} SET dirty = 0 WHERE id = ? AND updatedAt = ?`).run(skipped.id, change.updatedAt);
      }
    }
  }

  applyPulled(rows: any[]): void {
    this.transaction(() => {
      const touched = new Set<string>();
      for (const row of rows) {
        const table = SYNC_BY_NAME.get(row.table); if (!table) continue;
        const local = this.sqlite.prepare(`SELECT * FROM ${table.name} WHERE id = ?`).get(row.id) as any;
        if (local?.dirty && table.strategy === 'last_write_wins' && new Date(local.updatedAt) > new Date(row.updatedAt)) continue;
        if (local?.dirty && table.strategy === 'last_write_wins') this.recordConflict(table.name, row.id, local);
        const fields = ['id', 'updatedAt', 'deletedAt', 'serverSeq', 'dirty', ...table.columns.filter((column) => column in row)];
        const values = [row.id, row.updatedAt, row.deletedAt ?? null, row.serverSeq, 0, ...fields.slice(5).map((column) => normalize(row[column]))];
        const update = fields.filter((field) => field !== 'id').map((field) => `${field}=excluded.${field}`).join(',');
        this.sqlite.prepare(`INSERT INTO ${table.name} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${update}`).run(...values);
        if (table.name === 'stock_movements' && typeof row.productId === 'string') touched.add(row.productId);
      }
      for (const id of touched) this.sqlite.prepare('UPDATE products SET quantity = COALESCE((SELECT SUM(quantityDelta) FROM stock_movements WHERE productId = ? AND deletedAt IS NULL), 0) WHERE id = ?').run(id, id);
    });
  }

  private writeLocal(tableName: string, row: Record<string, unknown>): void {
    const table = SYNC_BY_NAME.get(tableName); if (!table) throw new Error(`Unknown sync table: ${tableName}`);
    const fields = ['id', 'updatedAt', 'deletedAt', 'serverSeq', 'dirty', ...table.columns.filter((column) => column in row)];
    const values = [row.id ?? randomUUID(), now(), null, 0, 1, ...fields.slice(5).map((column) => normalize(row[column]))];
    const update = fields.filter((field) => field !== 'id' && field !== 'serverSeq').map((field) => `${field}=excluded.${field}`).join(',');
    this.sqlite.prepare(`INSERT INTO ${tableName} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${update}, dirty=1, updatedAt=excluded.updatedAt`).run(...(values as [any, ...any[]]));
  }

  private recordConflict(tableName: string, rowId: string, discarded: unknown): void {
    this.sqlite.prepare('INSERT INTO sync_conflicts (id, tableName, rowId, discarded, detectedAt) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), tableName, rowId, JSON.stringify(discarded), now());
  }

  private transaction<T>(operation: () => T): T {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

function toProduct(row: any): Product {
  return { ...row, barcode: row.barcode ?? null, categoryId: row.categoryId ?? null, price: Number(row.price), cost: Number(row.cost), quantity: Number(row.quantity), minStock: Number(row.minStock), isActive: Boolean(row.isActive) };
}

function normalize(value: unknown): unknown { return typeof value === 'boolean' ? Number(value) : value ?? null; }

function round(value: number): number { return Math.round(value * 1000) / 1000; }
