import { reconcileIdentities } from './identities';
import { randomUUID } from "node:crypto";
import { resolveUnitPrice } from "../shared/pricing";
import type { CartDraft, Capabilities, SalePayment, Expense } from "../shared/models";
import { DatabaseSync } from "node:sqlite";
import type {
  CartLine,
  Customer,
  Dashboard,
  Product,
  PaymentMethod,
  ReportSummary,
  Receipt,
  ReturnableLine,
  SaleDraft,
  SaleSummary,
  CashSessionSummary,
  StockMovement,
} from "../shared/models";

type SyncTable = {
  name: string;
  strategy: "append_only" | "last_write_wins";
  columns: readonly string[];
};

/** Same wire contract as the mobile app and Store POS API. */
export const SYNC_TABLES: SyncTable[] = [
  {
    name: "shop_settings",
    strategy: "last_write_wins",
    columns: ["key", "value"],
  },
  {
    name: "payment_methods",
    strategy: "last_write_wins",
    columns: ["name", "code", "icon", "color", "sortOrder", "isActive"],
  },
  {
    name: "categories",
    strategy: "last_write_wins",
    columns: ["name", "sortOrder"],
  },
  {
    name: "suppliers",
    strategy: "last_write_wins",
    columns: ["name", "contactName", "phone", "email", "address"],
  },
  {
    name: "expense_categories",
    strategy: "last_write_wins",
    columns: ["name", "description"],
  },
  {
    name: "customers",
    strategy: "last_write_wins",
    columns: ["name", "phone", "email", "address", "note"],
  },
  {
    name: "products",
    strategy: "last_write_wins",
    columns: [
      "name",
      "barcode",
      "categoryId",
      "supplierId",
      "price",
      "cost",
      "minStock",
      "unit",
      "imageUrl",
      "isActive",
    ],
  },
  {
    name: "price_levels",
    strategy: "last_write_wins",
    columns: ["name", "isDefault", "sortOrder"],
  },
  {
    name: "bulk_pricing",
    strategy: "last_write_wins",
    columns: ["productId", "minQuantity", "bulkPrice", "priceLevelId"],
  },
  {
    name: "cash_sessions",
    strategy: "last_write_wins",
    columns: [
      "status",
      "openedByName",
      "closedByName",
      "openingFloat",
      "expectedCash",
      "countedCash",
      "difference",
      "note",
      "openedAt",
      "closedAt",
    ],
  },
  {
    name: "sales",
    strategy: "append_only",
    columns: [
      "voucherId",
      "type",
      "originalSaleId",
      "subtotal",
      "discount",
      "total",
      "customerId",
      "cashSessionId",
      "staffName",
      "note",
      "soldAt",
      "priceLevelId",
    ],
  },
  {
    name: "sale_items",
    strategy: "append_only",
    columns: [
      "saleId",
      "productId",
      "productName",
      "unit",
      "quantity",
      "unitPrice",
      "unitCost",
      "discount",
      "subtotal",
    ],
  },
  {
    name: "stock_movements",
    strategy: "append_only",
    columns: [
      "productId",
      "type",
      "quantityDelta",
      "unitCost",
      "referenceId",
      "supplierId",
      "referenceNumber",
      "reason",
      "occurredAt",
    ],
  },
  {
    name: "payments",
    strategy: "append_only",
    columns: [
      "saleId",
      "customerId",
      "amount",
      "methodCode",
      "methodName",
      "tendered",
      "cashSessionId",
      "note",
      "paidAt",
    ],
  },
  {
    name: "expenses",
    strategy: "last_write_wins",
    columns: [
      "categoryId",
      "name",
      "amount",
      "note",
      "attachmentUrl",
      "cashSessionId",
      "spentAt",
    ],
  },
  {
    name: "activity_log",
    strategy: "append_only",
    columns: [
      "actor",
      "action",
      "detail",
      "amount",
      "referenceId",
      "occurredAt",
    ],
  },
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
  private lastMovementAt = "";

  constructor(filename: string) {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;");
    this.migrate();
    this.transaction(() => reconcileIdentities(this.sqlite));
    this.lastMovementAt =
      (
        this.sqlite
          .prepare("SELECT MAX(occurredAt) AS occurredAt FROM stock_movements")
          .get() as any
      )?.occurredAt ?? "";
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
      CREATE TABLE IF NOT EXISTS crash_logs (id TEXT PRIMARY KEY, message TEXT NOT NULL, source TEXT NOT NULL, appVersion TEXT, occurredAt TEXT NOT NULL);
    `);
    for (const table of SYNC_TABLES) {
      this.sqlite.exec(
        `CREATE INDEX IF NOT EXISTS idx_${table.name}_dirty ON ${table.name}(dirty) WHERE dirty = 1`,
      );
    }
    // Repair only unsynced legacy enum values; no stock quantities are rewritten.
    this.sqlite.exec("UPDATE stock_movements SET type = CASE type WHEN 'sale' THEN 'sale_out' WHEN 'return' THEN 'return_in' WHEN 'opening' THEN 'stock_in' END WHERE dirty = 1 AND type IN ('sale', 'return', 'opening')");
    this.setState("voucher.sequence", this.getState("voucher.sequence") ?? "0");
    if (!this.getState('schema.parity-seeds')) {
      for (const [id,name,isDefault,sortOrder] of [['level-retail','Retail',1,0],['level-wholesale','Wholesale',0,1]])
        this.sqlite.prepare('INSERT OR IGNORE INTO price_levels (id,updatedAt,name,isDefault,sortOrder) VALUES (?,?,?,?,?)').run(id,now(),name,isDefault,sortOrder);
      this.setState('schema.parity-seeds','1');
    }
  }

  getState(key: string): string | null {
    return (
      (
        this.sqlite
          .prepare("SELECT value FROM sync_state WHERE key = ?")
          .get(key) as { value?: string } | undefined
      )?.value ?? null
    );
  }

  setState(key: string, value: string | null): void {
    this.sqlite
      .prepare(
        "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  cartProducts(ids:string[]):Product[] {
    return [...new Set(ids)].map(id=>this.findProduct(id)).filter((p):p is Product=>!!p).map(p=>({...p,tiers:this.pricingTiers(p.id)}));
  }
  listProducts(search = ""): Product[] {
    const pattern = `%${search.trim()}%`;
    return this.sqlite
      .prepare(
        `SELECT id, name, barcode, categoryId, supplierId, price, cost, quantity, minStock, unit, isActive FROM products WHERE deletedAt IS NULL AND isActive = 1 AND (name LIKE ? OR barcode LIKE ?) ORDER BY name`,
      )
      .all(pattern, pattern)
      .map((row) => ({ ...toProduct(row), tiers: this.pricingTiers(String(row.id)) }));
  }

  findBarcode(code: string): Product | null {
    const row = this.sqlite
      .prepare(
        "SELECT id, name, barcode, categoryId, supplierId, price, cost, quantity, minStock, unit, isActive FROM products WHERE barcode = ? AND deletedAt IS NULL AND isActive = 1",
      )
      .get(code);
    return row ? { ...toProduct(row), tiers: this.pricingTiers(String(row.id)) } : null;
  }

  saveProduct(
    input: Partial<Product> & Pick<Product, "name" | "price">,
  ): Product {
    const id = input.id || randomUUID();
    const old = input.id
      ? (this.sqlite
          .prepare("SELECT * FROM products WHERE id = ?")
          .get(input.id) as Record<string, unknown> | undefined)
      : undefined;
    const row = {
      id,
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      categoryId: input.categoryId ?? null,
      supplierId: input.supplierId ?? old?.supplierId ?? null,
      price: Number(input.price),
      cost: Number(input.cost ?? old?.cost ?? 0),
      quantity: Number(old?.quantity ?? 0),
      minStock: Number(input.minStock ?? old?.minStock ?? 0),
      unit: input.unit?.trim() || String(old?.unit ?? "pcs"),
      isActive: input.isActive === false ? 0 : 1,
    };
    if (!row.name || !Number.isFinite(row.price) || row.price < 0)
      throw new Error("Product name and a non-negative price are required");
    if (input.id && !old) throw new Error('Product not found');
    if (row.barcode && this.sqlite.prepare('SELECT id FROM products WHERE barcode = ? AND id != ? AND deletedAt IS NULL').get(row.barcode,id)) throw new Error('That barcode already belongs to a product');
    if (![row.cost,row.minStock,Number(input.quantity ?? 0)].every(Number.isFinite) || row.cost < 0 || row.minStock < 0) throw new Error('Enter valid cost, minimum stock and quantity');
    return this.transaction(() => {
    this.writeLocal("products", row);
    // Quantity is derived from the stock ledger, never replicated as an
    // absolute value. An opening amount is therefore an explicit movement.
    const openingQuantity = old ? 0 : Number(input.quantity ?? 0);
    if (openingQuantity) {
      this.writeLocal("stock_movements", {
        id: randomUUID(),
        productId: id,
        type: "stock_in",
        quantityDelta: openingQuantity,
        unitCost: row.cost,
        referenceId: null,
        supplierId: null,
        referenceNumber: null,
        reason: "Initial desktop inventory",
        occurredAt: this.nextMovementAt(),
      });
      this.recomputeStock(id);
    } else if (old && Number(old.cost) !== row.cost) {
      const nonInitial = this.sqlite
        .prepare(
          "SELECT COUNT(*) as count FROM stock_movements WHERE productId = ? AND deletedAt IS NULL AND reason NOT IN ('Initial stock', 'Initial desktop inventory')",
        )
        .get(id) as { count: number };
      if (nonInitial.count === 0) {
        const initialMovement = this.sqlite
          .prepare(
            "SELECT * FROM stock_movements WHERE productId = ? AND (reason = 'Initial stock' OR reason = 'Initial desktop inventory') AND deletedAt IS NULL ORDER BY occurredAt ASC LIMIT 1",
          )
          .get(id) as Record<string, unknown> | undefined;
        if (initialMovement) {
          this.writeLocal("stock_movements", {
            ...initialMovement,
            unitCost: row.cost > 0 ? row.cost : null,
          });
        }
        this.recomputeStock(id);
        this.writeLocal("activity_log", {
          id: randomUUID(),
          actor: "Desktop",
          action: "adjustment",
          detail: `${row.name}: ဝယ်ဈေး ${Number(old.cost)} ကျပ် မှ ${row.cost} ကျပ် သို့ ပြင်ဆင်ခြင်း`,
          amount: row.cost,
          referenceId: id,
          occurredAt: new Date().toISOString(),
        });
      } else {
        this.recomputeStock(id);
      }
    }
    return this.findProduct(id)!;
    });
  }

  removeProduct(id: string): void {
    const product = this.sqlite
      .prepare("SELECT id FROM products WHERE id = ? AND deletedAt IS NULL")
      .get(id);
    if (!product) throw new Error("Product not found");
    const deletedAt = now();
    this.sqlite
      .prepare(
        "UPDATE products SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
      )
      .run(deletedAt, deletedAt, id);
  }

  private findProduct(id: string): Product | null {
    const row = this.sqlite
      .prepare(
        "SELECT id, name, barcode, categoryId, supplierId, price, cost, quantity, minStock, unit, isActive FROM products WHERE id = ?",
      )
      .get(id);
    return row ? toProduct(row) : null;
  }

  listCategories(): Array<{ id: string; name: string; sortOrder: number }> {
    return this.sqlite
      .prepare(
        "SELECT id, name, sortOrder FROM categories WHERE deletedAt IS NULL ORDER BY sortOrder, name",
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        sortOrder: Number(row.sortOrder),
      }));
  }

  saveCategory(input: { id?: string; name: string; sortOrder?: number }): {
    id: string;
    name: string;
    sortOrder: number;
  } {
    const id = input.id || randomUUID();
    const existing = input.id
      ? (this.sqlite
          .prepare("SELECT sortOrder FROM categories WHERE id = ?")
          .get(input.id) as any)
      : null;
    if (!input.name.trim()) throw new Error("Category name is required");
    this.writeLocal("categories", {
      id,
      name: input.name.trim(),
      sortOrder: Number(input.sortOrder ?? existing?.sortOrder ?? 0),
    });
    return this.listCategories().find((category) => category.id === id)!;
  }

  removeCategory(id: string): void {
    const category = this.sqlite
      .prepare("SELECT id FROM categories WHERE id = ? AND deletedAt IS NULL")
      .get(id);
    if (!category) throw new Error("Category not found");
    const deletedAt = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          "UPDATE products SET categoryId = NULL, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE categoryId = ? AND deletedAt IS NULL",
        )
        .run(deletedAt, id);
      this.sqlite
        .prepare(
          "UPDATE categories SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
        )
        .run(deletedAt, deletedAt, id);
    });
  }

  listSuppliers(search = ""): Array<{
    id: string;
    name: string;
    contactName: string | null;
    phone: string | null;
    address: string | null;
  }> {
    const pattern = `%${search.trim()}%`;
    return this.sqlite
      .prepare(
        "SELECT id, name, contactName, phone, address FROM suppliers WHERE deletedAt IS NULL AND (name LIKE ? OR phone LIKE ?) ORDER BY name",
      )
      .all(pattern, pattern)
      .map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        contactName: row.contactName ?? null,
        phone: row.phone ?? null,
        address: row.address ?? null,
      }));
  }

  saveSupplier(input: {
    id?: string;
    name: string;
    contactName?: string | null;
    phone?: string | null;
    address?: string | null;
  }): {
    id: string;
    name: string;
    contactName: string | null;
    phone: string | null;
    address: string | null;
  } {
    const id = input.id || randomUUID();
    const existing = input.id
      ? (this.sqlite
          .prepare("SELECT * FROM suppliers WHERE id = ?")
          .get(input.id) as any)
      : null;
    if (!input.name.trim()) throw new Error("Supplier name is required");
    this.writeLocal("suppliers", {
      id,
      name: input.name.trim(),
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: existing?.email ?? null,
      address: input.address?.trim() || null,
    });
    return this.listSuppliers().find((supplier) => supplier.id === id)!;
  }

  removeSupplier(id: string): void {
    const existing = this.sqlite
      .prepare("SELECT id FROM suppliers WHERE id = ? AND deletedAt IS NULL")
      .get(id);
    if (!existing) throw new Error("Supplier not found");
    const deletedAt = now();
    this.sqlite
      .prepare(
        "UPDATE suppliers SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
      )
      .run(deletedAt, deletedAt, id);
  }

  supplierPurchases(
    supplierId: string,
    from?: string,
    to?: string,
  ): Array<{
    id: string;
    productName: string;
    quantity: number;
    unitCost: number | null;
    referenceNumber: string | null;
    occurredAt: string;
  }> {
    const clauses = ["m.supplierId = ?", "m.deletedAt IS NULL"];
    const params: string[] = [supplierId];
    if (from && to) {
      clauses.push("m.occurredAt >= ?", "m.occurredAt <= ?");
      params.push(from, to);
    }
    return this.sqlite
      .prepare(
        `SELECT m.id, COALESCE(p.name, 'Deleted product') AS productName, m.quantityDelta AS quantity, m.unitCost, m.referenceNumber, m.occurredAt FROM stock_movements m LEFT JOIN products p ON p.id = m.productId WHERE ${clauses.join(" AND ")} ORDER BY m.occurredAt DESC, m.id DESC LIMIT 50`,
      )
      .all(...params)
      .map((row: any) => ({
        id: String(row.id),
        productName: String(row.productName),
        quantity: Number(row.quantity),
        unitCost: row.unitCost == null ? null : Number(row.unitCost),
        referenceNumber: row.referenceNumber ?? null,
        occurredAt: String(row.occurredAt),
      }));
  }

  supplierSpend(supplierId: string, from?: string, to?: string): number {
    const clauses = [
      "supplierId = ?",
      "deletedAt IS NULL",
      "unitCost IS NOT NULL",
    ];
    const params: string[] = [supplierId];
    if (from && to) {
      clauses.push("occurredAt >= ?", "occurredAt <= ?");
      params.push(from, to);
    }
    const row = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(quantityDelta * unitCost), 0) AS total FROM stock_movements WHERE ${clauses.join(" AND ")}`,
      )
      .get(...params) as { total: number };
    return round(Number(row.total));
  }

  listPaymentMethods(): PaymentMethod[] {
    return this.sqlite
      .prepare(
        "SELECT id, name, code, sortOrder, isActive FROM payment_methods WHERE deletedAt IS NULL ORDER BY sortOrder, name",
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        code: String(row.code),
        sortOrder: Number(row.sortOrder),
        isActive: Boolean(row.isActive),
      }));
  }

  listPriceLevels(): Array<{
    id: string;
    name: string;
    isDefault: boolean;
    sortOrder: number;
    productCount: number;
    saleCount: number;
  }> {
    return this.sqlite
      .prepare(
        "SELECT price_levels.id, price_levels.name, price_levels.isDefault, price_levels.sortOrder, (SELECT COUNT(*) FROM bulk_pricing WHERE bulk_pricing.priceLevelId = price_levels.id AND bulk_pricing.deletedAt IS NULL) AS productCount, (SELECT COUNT(*) FROM sales WHERE sales.priceLevelId = price_levels.id AND sales.deletedAt IS NULL) AS saleCount FROM price_levels WHERE price_levels.deletedAt IS NULL ORDER BY price_levels.isDefault DESC, price_levels.sortOrder, price_levels.name",
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        isDefault: Boolean(row.isDefault),
        sortOrder: Number(row.sortOrder),
        productCount: Number(row.productCount),
        saleCount: Number(row.saleCount),
      }));
  }

  savePriceLevel(input: {
    id?: string;
    name: string;
    isDefault?: boolean;
    sortOrder?: number;
  }): { id: string; name: string; isDefault: boolean; sortOrder: number } {
    const id = input.id || randomUUID();
    if (!input.name.trim()) throw new Error("Price level name is required");
    const current = input.id
      ? (this.sqlite
          .prepare("SELECT * FROM price_levels WHERE id = ?")
          .get(input.id) as any)
      : null;
    this.writeLocal("price_levels", {
      id,
      name: input.name.trim(),
      isDefault:
        input.isDefault == null
          ? Number(current?.isDefault ?? this.listPriceLevels().length === 0)
          : Number(input.isDefault),
      sortOrder: Number(
        input.sortOrder ?? current?.sortOrder ?? this.listPriceLevels().length,
      ),
    });
    return this.listPriceLevels().find((level) => level.id === id)!;
  }

  removePriceLevel(id: string): void {
    const level = this.sqlite
      .prepare(
        "SELECT id, isDefault FROM price_levels WHERE id = ? AND deletedAt IS NULL",
      )
      .get(id) as { id?: string; isDefault?: number } | undefined;
    if (!level) throw new Error("Price level not found");
    if (level.isDefault)
      throw new Error("The default retail level cannot be removed");
    this.transaction(() => {
      const deletedAt = now();
      this.sqlite
        .prepare(
          "UPDATE bulk_pricing SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE priceLevelId = ? AND deletedAt IS NULL",
        )
        .run(deletedAt, deletedAt, id);
      this.sqlite
        .prepare(
          "UPDATE price_levels SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
        )
        .run(deletedAt, deletedAt, id);
    });
  }

  listProductTiers(productId: string): Array<{
    id: string;
    productId: string;
    priceLevelId: string;
    minQuantity: number;
    bulkPrice: number;
  }> {
    return this.sqlite
      .prepare(
        "SELECT bulk_pricing.id, bulk_pricing.productId, bulk_pricing.priceLevelId, bulk_pricing.minQuantity, bulk_pricing.bulkPrice FROM bulk_pricing JOIN price_levels ON price_levels.id = bulk_pricing.priceLevelId WHERE bulk_pricing.productId = ? AND bulk_pricing.priceLevelId IS NOT NULL AND bulk_pricing.deletedAt IS NULL AND price_levels.deletedAt IS NULL AND price_levels.isDefault = 0 ORDER BY bulk_pricing.priceLevelId, bulk_pricing.minQuantity",
      )
      .all(productId)
      .map((row: any) => ({
        id: String(row.id),
        productId: String(row.productId),
        priceLevelId: String(row.priceLevelId),
        minQuantity: Number(row.minQuantity),
        bulkPrice: Number(row.bulkPrice),
      }));
  }

  saveProductTier(input: {
    id?: string;
    productId: string;
    priceLevelId: string;
    minQuantity: number;
    bulkPrice: number;
  }): {
    id: string;
    productId: string;
    priceLevelId: string;
    minQuantity: number;
    bulkPrice: number;
  } {
    if (!(input.minQuantity > 0) || !(input.bulkPrice > 0))
      throw new Error("Quantity and price must be positive");
    const id = input.id || randomUUID();
    this.writeLocal("bulk_pricing", {
      id,
      productId: input.productId,
      priceLevelId: input.priceLevelId,
      minQuantity: input.minQuantity,
      bulkPrice: input.bulkPrice,
    });
    return this.listProductTiers(input.productId).find(
      (tier) => tier.id === id,
    )!;
  }

  removeProductTier(id: string): void {
    const tier = this.sqlite
      .prepare("SELECT id FROM bulk_pricing WHERE id = ? AND deletedAt IS NULL")
      .get(id) as { id?: string } | undefined;
    if (!tier) throw new Error("Price tier not found");
    this.sqlite
      .prepare(
        "UPDATE bulk_pricing SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
      )
      .run(now(), now(), id);
  }

  private pricingTiers(productId: string): any[] {
    return this.sqlite.prepare("SELECT b.* FROM bulk_pricing b LEFT JOIN price_levels l ON l.id = COALESCE(b.priceLevelId, 'level-retail') WHERE b.productId = ? AND b.deletedAt IS NULL AND (l.deletedAt IS NULL) ORDER BY b.minQuantity").all(productId);
  }

  priceFor(productId: string, priceLevelId: string | null, quantity: number): number {
    const product = this.findProduct(productId);
    if (!product) throw new Error('Product not found');
    return resolveUnitPrice(product.price, quantity, this.pricingTiers(productId), priceLevelId ?? 'level-retail').unitPrice;
  }

  savePaymentMethod(
    input: Partial<PaymentMethod> & Pick<PaymentMethod, "name">,
  ): PaymentMethod {
    const id = input.id || randomUUID();
    const existing = input.id
      ? (this.sqlite
          .prepare("SELECT * FROM payment_methods WHERE id = ?")
          .get(input.id) as any)
      : null;
    const name = input.name.trim();
    if (!name) throw new Error("Payment method name is required");
    const code =
      existing?.code ||
      input.code?.trim().toLowerCase() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") ||
      `method-${id.slice(0, 8)}`;
    if (code === 'debt') throw new Error('Credit is an unpaid balance, not a payment method');
    if (this.sqlite.prepare('SELECT id FROM payment_methods WHERE code = ? AND id != ? AND deletedAt IS NULL').get(code, id)) throw new Error('That payment method already exists');
    this.writeLocal("payment_methods", {
      id,
      name,
      code,
      icon: existing?.icon ?? null,
      color: existing?.color ?? null,
      sortOrder: Number(
        input.sortOrder ??
          existing?.sortOrder ??
          this.listPaymentMethods().length,
      ),
      isActive:
        input.isActive == null
          ? Number(existing?.isActive ?? 1)
          : Number(input.isActive),
    });
    return this.listPaymentMethods().find((method) => method.id === id)!;
  }

  removePaymentMethod(id: string): "deleted" | "deactivated" {
    const method = this.sqlite
      .prepare(
        "SELECT id, name, code, sortOrder FROM payment_methods WHERE id = ? AND deletedAt IS NULL",
      )
      .get(id) as
      | { id: string; name: string; code: string; sortOrder: number }
      | undefined;
    if (!method) throw new Error("Payment method not found");
    const used = Number(
      (
        this.sqlite
          .prepare(
            "SELECT COUNT(*) AS total FROM payments WHERE methodCode = ? AND deletedAt IS NULL",
          )
          .get(method.code) as { total: number }
      ).total,
    );
    if (used > 0) {
      this.writeLocal("payment_methods", {
        ...method,
        icon: null,
        color: null,
        isActive: 0,
      });
      return "deactivated";
    }
    const deletedAt = now();
    this.sqlite
      .prepare(
        "UPDATE payment_methods SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
      )
      .run(deletedAt, deletedAt, id);
    return "deleted";
  }

  listStockHistory(productId: string): StockMovement[] {
    const product = this.findProduct(productId);
    if (!product) throw new Error("Product not found");
    const rows = this.sqlite
      .prepare(
        "SELECT m.id, m.productId, m.type, m.quantityDelta, m.unitCost, m.supplierId, s.name AS supplierName, m.referenceNumber, m.reason, m.occurredAt FROM stock_movements m LEFT JOIN suppliers s ON s.id = m.supplierId WHERE m.productId = ? AND m.deletedAt IS NULL ORDER BY m.occurredAt DESC, m.id DESC LIMIT 200",
      )
      .all(productId) as any[];
    let balance = product.quantity;
    return rows.map((row) => {
      const quantityDelta = Number(row.quantityDelta);
      const movement = {
        id: String(row.id),
        productId: String(row.productId),
        type: String(row.type) as StockMovement["type"],
        quantityDelta,
        unitCost: row.unitCost == null ? null : Number(row.unitCost),
        supplierId: row.supplierId ?? null,
        supplierName: row.supplierName ?? null,
        referenceNumber: row.referenceNumber ?? null,
        reason: row.reason ?? null,
        occurredAt: String(row.occurredAt),
        balance: round(balance),
      };
      balance -= quantityDelta;
      return movement;
    });
  }

  setStockTo(productId: string, counted: number, reason?: string): Product {
    if (!Number.isFinite(counted) || counted < 0) throw new Error('Counted stock cannot be negative');
    const product = this.findProduct(productId);
    if (!product) throw new Error('Product not found');
    const delta = round(counted - product.quantity);
    return delta === 0 ? product : this.adjustStock(productId, delta, 'adjustment', reason || 'Stock count');
  }

  adjustStock(
    productId: string,
    quantityDelta: number,
    type: "stock_in" | "waste" | "adjustment",
    reason?: string,
    details?: {
      supplierId?: string | null;
      referenceNumber?: string | null;
      unitCost?: number | null;
    },
  ): Product {
    const product = this.findProduct(productId);
    if (!product) throw new Error("Product not found");
    if (!["stock_in", "waste", "adjustment"].includes(type))
      throw new Error("Invalid stock action");
    if (!Number.isFinite(quantityDelta) || quantityDelta === 0)
      throw new Error("Enter a non-zero stock quantity");
    if (type === "stock_in" && quantityDelta < 0)
      throw new Error("Received stock must be positive");
    if (type === "waste" && quantityDelta > 0)
      throw new Error("Waste stock must be negative");
    const occurredAt = this.nextMovementAt();
    this.transaction(() => {
      const suppliedCost = Number(details?.unitCost);
      const unitCost =
        type === "stock_in" && details?.unitCost != null && Number.isFinite(suppliedCost) && suppliedCost >= 0
          ? suppliedCost
          : null;
      const supplierId =
        type === "stock_in" ? details?.supplierId?.trim() || null : null;
      if (
        supplierId &&
        !this.sqlite
          .prepare(
            "SELECT id FROM suppliers WHERE id = ? AND deletedAt IS NULL",
          )
          .get(supplierId)
      )
        throw new Error("Selected supplier was not found");
      this.writeLocal("stock_movements", {
        id: randomUUID(),
        productId,
        type,
        quantityDelta,
        unitCost,
        referenceId: null,
        supplierId,
        referenceNumber:
          type === "stock_in" ? details?.referenceNumber?.trim() || null : null,
        reason: reason?.trim() || (type === "stock_in" ? "Delivery" : null),
        occurredAt,
      });
      this.recomputeStock(productId);
      if (type !== "stock_in")
        this.writeLocal("activity_log", {
          id: randomUUID(),
          actor: "Desktop",
          action: type,
          detail: reason?.trim() || product.name,
          amount: quantityDelta,
          referenceId: productId,
          occurredAt,
        });
    });
    return this.findProduct(productId)!;
  }

  listCustomers(): Customer[] {
    return this.sqlite
      .prepare(
        "SELECT id, name, phone, note FROM customers WHERE deletedAt IS NULL ORDER BY name",
      )
      .all()
      .map((row: any) => ({
        ...row,
        phone: row.phone ?? null,
        note: row.note ?? null,
      }));
  }

  saveCustomer(input: Partial<Customer> & Pick<Customer, "name">): Customer {
    const id = input.id || randomUUID();
    if (!input.name.trim()) throw new Error("Customer name is required");
    const existing = input.id
      ? (this.sqlite
          .prepare("SELECT email, address FROM customers WHERE id = ?")
          .get(input.id) as
          | { email?: string | null; address?: string | null }
          | undefined)
      : undefined;
    this.writeLocal("customers", {
      id,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      note: input.note?.trim() || null,
      email: existing?.email ?? null,
      address: existing?.address ?? null,
    });
    const customer = this.sqlite
      .prepare("SELECT id, name, phone, note FROM customers WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!customer) throw new Error("Customer could not be saved");
    return {
      id: String(customer.id),
      name: String(customer.name),
      phone: customer.phone == null ? null : String(customer.phone),
      note: customer.note == null ? null : String(customer.note),
    };
  }

  removeCustomer(id: string): void {
    const customer = this.sqlite
      .prepare("SELECT id FROM customers WHERE id = ? AND deletedAt IS NULL")
      .get(id);
    if (!customer) throw new Error("Customer not found");
    const debt = Number(
      (
        this.sqlite
          .prepare(
            `SELECT COALESCE(SUM(total), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE customerId = ? AND deletedAt IS NULL), 0) AS debt FROM sales WHERE customerId = ? AND deletedAt IS NULL`,
          )
          .get(id, id) as { debt: number }
      ).debt,
    );
    if (debt > 0.0001) throw new Error("This customer still owes money");
    const deletedAt = now();
    this.sqlite
      .prepare(
        "UPDATE customers SET deletedAt = ?, updatedAt = ?, dirty = 1, serverSeq = 0 WHERE id = ?",
      )
      .run(deletedAt, deletedAt, id);
  }

  checkout(draft: SaleDraft): Receipt {
    if (!draft.lines.length)
      throw new Error("Add at least one product to the sale");
    return this.transaction(() => {
      const soldAt = draft.soldAt ? new Date(draft.soldAt).toISOString() : now();
      const voucherId = this.nextVoucher();
      const saleId = randomUUID();
      const movementAt = soldAt;
      const lines = draft.lines.map((line) => {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.discount)) throw new Error("Enter valid quantities, prices and discounts");
        const gross = Math.max(
          0,
          Number(line.quantity) * Number(line.unitPrice),
        );
        return {
          ...line,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          unitCost: Number(line.unitCost),
          discount: Math.min(gross, Math.max(0, Number(line.discount) || 0)),
        };
      });
      const subtotal = round(lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      ));
      const lineDiscounts = round(lines.reduce((sum, line) => sum + line.discount, 0));
      const orderDiscount = Math.min(
        Math.max(0, Number(draft.discount) || 0),
        Math.max(0, subtotal - lineDiscounts),
      );
      const discount = round(lineDiscounts + orderDiscount);
      const total = round(Math.max(0, subtotal - discount));
      const payments: SalePayment[] = draft.payments ?? (draft.paymentMethod === 'debt' || total === 0 ? [] : [{amount: total, methodCode: draft.paymentMethod, tendered: draft.amountTendered}]);
      for (const payment of payments) {
        if (!Number.isFinite(payment.amount) || payment.amount < 0) throw new Error('Payment amounts must be non-negative');
        const method = this.paymentMethod(payment.methodCode);
        payment.methodName = method.name;
        if (payment.tendered != null && (!Number.isFinite(payment.tendered) || payment.tendered < payment.amount)) throw new Error('Cash received is less than the payment');
      }
      const paid = round(payments.reduce((sum,p) => sum+p.amount,0));
      const outstanding = round(total-paid);
      if (outstanding < 0) throw new Error('Payments exceed the sale total');
      if (outstanding > 0 && !draft.customerId) throw new Error('Choose a customer for the unpaid balance');
      if (draft.customerId && !this.sqlite.prepare('SELECT id FROM customers WHERE id = ? AND deletedAt IS NULL').get(draft.customerId)) throw new Error('Customer not found');
      const openSession = this.sqlite
        .prepare(
          "SELECT id FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1",
        )
        .get() as any;
      const cashSessionId = openSession?.id ?? null;
      this.writeLocal("sales", {
        id: saleId,
        voucherId,
        type: "sale",
        originalSaleId: null,
        subtotal,
        discount,
        total,
        customerId: draft.customerId ?? null,
        cashSessionId,
        staffName: draft.staffName ?? null,
        note: draft.note?.trim() || null,
        soldAt,
        priceLevelId: draft.priceLevelId ?? null,
      });
      for (const line of lines) {
        const product = this.findProduct(line.productId);
        if (!product) throw new Error(`Product no longer exists: ${line.name}`);
        const itemSubtotal = line.quantity * line.unitPrice - line.discount;
        this.writeLocal("sale_items", {
          id: randomUUID(),
          saleId,
          productId: product.id,
          productName: product.name,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: product.cost,
          discount: line.discount,
          subtotal: round(itemSubtotal),
        });
        this.writeLocal("stock_movements", {
          id: randomUUID(),
          productId: product.id,
          type: "sale_out",
          quantityDelta: -line.quantity,
          unitCost: product.cost,
          referenceId: saleId,
          supplierId: null,
          referenceNumber: voucherId,
          reason: null,
          occurredAt: movementAt,
        });
        this.recomputeStock(product.id);
      }
      for (const payment of payments.filter(p => p.amount > 0)) this.writeLocal('payments', {
        id: randomUUID(), saleId, customerId: draft.customerId ?? null, amount: round(payment.amount),
        methodCode: payment.methodCode, methodName: payment.methodName, tendered: payment.tendered ?? null,
        cashSessionId, note: null, paidAt: soldAt,
      });
      if (discount > 0)
        this.writeLocal("activity_log", {
          id: randomUUID(),
          actor: draft.staffName ?? "Desktop",
          action: "discount",
          detail: voucherId,
          amount: discount,
          referenceId: saleId,
          occurredAt: soldAt,
        });
      this.setState("cart.draft", null);
      return this.receiptForSale(voucherId)!;
    });
  }

  listSales(search = "", from?: string, to?: string): SaleSummary[] {
    const term = `%${search.trim()}%`;
    const clauses = [
      "s.deletedAt IS NULL",
      "(s.voucherId LIKE ? OR COALESCE(c.name, '') LIKE ?)",
    ];
    const params: any[] = [term, term];

    if (from && to) {
      clauses.push("s.soldAt >= ?", "s.soldAt <= ?");
      params.push(from, to);


    }

    const query = `SELECT s.id, s.voucherId, s.type, s.total, s.soldAt, c.name AS customerName,
      COALESCE((SELECT GROUP_CONCAT(DISTINCT p.methodCode) FROM payments p WHERE p.saleId = s.id AND p.deletedAt IS NULL), 'debt') AS paymentMethod
      FROM sales s LEFT JOIN customers c ON c.id = s.customerId
      WHERE ${clauses.join(" AND ")}
      ORDER BY s.soldAt DESC, s.id DESC`;



    const results = this.sqlite
      .prepare(query)
      .all(...params)
      .map((row: any) => ({
        id: String(row.id),
        voucherId: String(row.voucherId),
        type: (row.type === "return" ? "return" : "sale") as "sale" | "return",
        total: Number(row.total),
        soldAt: String(row.soldAt),
        customerName: row.customerName ?? null,
        paymentMethod: String(row.paymentMethod),
      }));

    return results;
  }

  receiptForSale(voucherId: string): Receipt | null {
    const sale = this.sqlite
      .prepare(
        `SELECT id, customerId, voucherId, subtotal, discount, total, soldAt FROM sales WHERE voucherId = ? AND deletedAt IS NULL`,
      )
      .get(voucherId) as any;
    if (!sale) return null;
    const payments = this.sqlite.prepare('SELECT amount, methodCode, methodName, tendered, paidAt FROM payments WHERE saleId = ? AND deletedAt IS NULL ORDER BY paidAt, id').all(sale.id) as unknown as SalePayment[];
    const paid = round(payments.reduce((sum,p) => sum + Number(p.amount),0));
    const cash = payments.filter(p => p.methodCode === 'cash');
    const tendered = cash.filter(p => p.tendered != null);
    const lines = this.sqlite
      .prepare(
        `SELECT productId, productName AS name, unit, quantity, unitPrice, unitCost, discount, subtotal FROM sale_items WHERE saleId = (SELECT id FROM sales WHERE voucherId = ? AND deletedAt IS NULL) AND deletedAt IS NULL ORDER BY id`,
      )
      .all(voucherId)
      .map((row: any) => ({
        productId: String(row.productId),
        name: String(row.name),
        unit: String(row.unit),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        unitCost: Number(row.unitCost),
        discount: Number(row.discount),
        subtotal: Number(row.subtotal),
      }));
    const amountTendered =
      tendered.length ? round(tendered.reduce((sum,p) => sum + Number(p.tendered),0)) : null;
    return {
      voucherId: String(sale.voucherId),
      shopName: this.getShopSetting("shop.name") ?? "Store POS",
      shopPhone: this.getShopSetting("shop.phone"),
      soldAt: String(sale.soldAt),
      paymentMethod: [...new Set(payments.map(p => p.methodCode))].join(' + ') || 'debt',
      customerId: sale.customerId, payments, outstanding: sale.customerId ? this.customerLedger(String(sale.customerId)).sales.find(row=>row.id===String(sale.id))?.remaining ?? 0 : Math.max(0, round(Number(sale.total) - paid)),
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      total: Number(sale.total),
      amountTendered,
      change:
        amountTendered == null
          ? null
          : round(tendered.reduce((sum,p) => sum + Math.max(0, Number(p.tendered)-Number(p.amount)),0)),
      lines,
    };
  }

  returnableSale(voucherId: string): ReturnableLine[] | null {
    const sale = this.sqlite
      .prepare(
        "SELECT id, type, total FROM sales WHERE voucherId = ? AND deletedAt IS NULL",
      )
      .get(voucherId) as any;
    if (!sale || sale.type !== "sale") return null;
    const items = this.sqlite
      .prepare(
        "SELECT productId, productName AS name, unit, quantity, unitPrice, unitCost, discount, subtotal FROM sale_items WHERE saleId = ? AND deletedAt IS NULL ORDER BY id",
      )
      .all(sale.id) as any[];
    const returnedRows = this.sqlite
      .prepare(
        `SELECT i.productId, ABS(SUM(i.quantity)) AS quantity FROM sale_items i JOIN sales r ON r.id = i.saleId WHERE r.originalSaleId = ? AND r.deletedAt IS NULL AND i.deletedAt IS NULL GROUP BY i.productId`,
      )
      .all(sale.id) as any[];
    const returned = new Map(
      returnedRows.map((row) => [String(row.productId), Number(row.quantity)]),
    );
    const netBeforeOrderDiscount = items.reduce((sum,item)=>sum+Number(item.subtotal),0);
    return items
      .map((item) => {
        const quantity = Number(item.quantity);
        const prior = returned.get(String(item.productId)) ?? 0;
        const value = round(netBeforeOrderDiscount > 0 ? Number(sale.total)*Number(item.subtotal)/netBeforeOrderDiscount : 0);
        return {
          productId: String(item.productId),
          name: String(item.name),
          unit: String(item.unit),
          quantity,
          returned: prior,
          returnable: round(Math.max(0, quantity - prior)),
          refundPerUnit: quantity ? round(value / quantity) : 0,
          unitPrice: Number(item.unitPrice),
          unitCost: Number(item.unitCost),
        };
      })
      .filter((line) => line.returnable > 0);
  }

  returnSale(
    voucherId: string,
    wanted: Array<{ productId: string; quantity: number }>,
    refundMethod: string,
    note?: string,
    refundAmount?: number,
  ): Receipt {
    const source = this.sqlite
      .prepare(
        "SELECT id, customerId, type FROM sales WHERE voucherId = ? AND deletedAt IS NULL",
      )
      .get(voucherId) as any;
    const available = this.returnableSale(voucherId);
    if (!source || !available || source.type !== "sale")
      throw new Error("That transaction cannot be returned");
    const byProduct = new Map(available.map((line) => [line.productId, line]));
    if (new Set(wanted.map(line => line.productId)).size !== wanted.length) throw new Error('Choose each return product once');
    const lines = wanted
      .filter((line) => line.quantity > 0)
      .map((line) => {
        const original = byProduct.get(line.productId);
        if (!original) throw new Error("That product is no longer returnable");
        const quantity = Number(line.quantity);
        if (
          !Number.isFinite(quantity) ||
          quantity > original.returnable + 0.0001
        )
          throw new Error(
            `Only ${original.returnable} ${original.unit} can be returned for ${original.name}`,
          );
        return { ...original, quantity };
      });
    if (!lines.length) throw new Error("Choose at least one item to return");
    const refundName = refundMethod === 'debt' ? null : this.paymentMethod(refundMethod).name;
    if (refundMethod === "debt" && !source.customerId)
      throw new Error(
        "Customer credit requires a customer on the original sale",
      );
    const value = round(
      lines.reduce((sum, line) => sum + line.refundPerUnit * line.quantity, 0),
    );
    const refunded = refundMethod === 'debt' ? 0 : refundAmount ?? value;
    if (!Number.isFinite(refunded) || refunded < 0 || refunded > value) throw new Error('Refund must be between zero and the return value');
    if (refunded < value && !source.customerId) throw new Error('A partial refund needs a customer to credit');
    const soldAt = now();
    const movementAt = this.nextMovementAt();
    const returnId = randomUUID();
    const returnVoucher = this.nextVoucher();
    const session = this.sqlite
      .prepare(
        "SELECT id FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1",
      )
      .get() as any;
    this.transaction(() => {
      this.writeLocal("sales", {
        id: returnId,
        voucherId: returnVoucher,
        type: "return",
        originalSaleId: source.id,
        subtotal: -value,
        discount: 0,
        total: -value,
        customerId: source.customerId ?? null,
        cashSessionId: session?.id ?? null,
        staffName: "Desktop",
        note: note?.trim() || `Return for ${voucherId}`,
        soldAt,
        priceLevelId: null,
      });
      for (const line of lines) {
        const subtotal = -round(line.refundPerUnit * line.quantity);
        this.writeLocal("sale_items", {
          id: randomUUID(),
          saleId: returnId,
          productId: line.productId,
          productName: line.name,
          unit: line.unit,
          quantity: -line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          discount: 0,
          subtotal,
        });
        this.writeLocal("stock_movements", {
          id: randomUUID(),
          productId: line.productId,
          type: "return_in",
          quantityDelta: line.quantity,
          unitCost: line.unitCost,
          referenceId: returnId,
          supplierId: null,
          referenceNumber: returnVoucher,
          reason: note?.trim() || `Return for ${voucherId}`,
          occurredAt: movementAt,
        });
        this.recomputeStock(line.productId);
      }
      if (refunded > 0)
        this.writeLocal("payments", {
          id: randomUUID(),
          saleId: returnId,
          customerId: source.customerId ?? null,
          amount: -refunded,
          methodCode: refundMethod,
          methodName: refundName,
          tendered: null,
          cashSessionId: session?.id ?? null,
          note: note?.trim() || `Refund for ${voucherId}`,
          paidAt: soldAt,
        });
      this.writeLocal("activity_log", {
        id: randomUUID(),
        actor: "Desktop",
        action: "return",
        detail: `${returnVoucher} for ${voucherId}`,
        amount: value,
        referenceId: returnId,
        occurredAt: soldAt,
      });
    });
    return this.receiptForSale(returnVoucher)!;
  }

  dashboard(): Dashboard {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const day = since.toISOString();
    const total = this.sqlite
      .prepare(
        "SELECT COUNT(*) AS salesToday, COALESCE(SUM(total), 0) AS revenueToday FROM sales WHERE deletedAt IS NULL AND soldAt >= ? AND soldAt <= ?",
      )
      .get(day, new Date(new Date(since).setHours(23,59,59,999)).toISOString()) as any;
    const low = this.sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM products WHERE deletedAt IS NULL AND isActive = 1 AND quantity <= minStock",
      )
      .get() as any;
    return {
      salesToday: Number(total.salesToday),
      revenueToday: Number(total.revenueToday),
      lowStock: Number(low.count),
      pendingSync: this.countDirty(),
    };
  }

  report(from: string, to: string): ReportSummary {
    const start = new Date(from);
    const end = new Date(to);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start > end
    )
      throw new Error("Choose a valid report period");
    const sales = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type = 'sale' THEN total ELSE 0 END), 0) AS grossSales, COALESCE(SUM(CASE WHEN type = 'return' THEN -total ELSE 0 END), 0) AS refunds, COALESCE(SUM(total), 0) AS netSales, COALESCE(SUM(discount), 0) AS discounts, COUNT(*) AS saleCount FROM sales WHERE deletedAt IS NULL AND soldAt >= ? AND soldAt <= ?`,
      )
      .get(from, to) as any;
    const cost = Number(
      (
        this.sqlite
          .prepare(
            `SELECT COALESCE(SUM(i.unitCost * i.quantity), 0) AS total FROM sale_items i JOIN sales s ON s.id = i.saleId WHERE i.deletedAt IS NULL AND s.deletedAt IS NULL AND s.soldAt >= ? AND s.soldAt <= ?`,
          )
          .get(from, to) as any
      ).total,
    );
    const expenses = Number(
      (
        this.sqlite
          .prepare(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE deletedAt IS NULL AND spentAt >= ? AND spentAt <= ?",
          )
          .get(from, to) as any
      ).total,
    );
    const payments = this.sqlite
      .prepare(
        "SELECT methodCode, COALESCE(SUM(amount), 0) AS total FROM payments WHERE deletedAt IS NULL AND paidAt >= ? AND paidAt <= ? GROUP BY methodCode ORDER BY methodCode",
      )
      .all(from, to)
      .map((row: any) => ({
        methodCode: String(row.methodCode),
        total: Number(row.total),
      }));
    const debtRows = this.sqlite
      .prepare(
        `SELECT c.id, COALESCE((SELECT SUM(total) FROM sales WHERE customerId = c.id AND deletedAt IS NULL), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE customerId = c.id AND deletedAt IS NULL), 0) AS debt FROM customers c WHERE c.deletedAt IS NULL`,
      )
      .all() as any[];
    const outstandingDebt = debtRows.reduce(
      (total, row) => total + Math.max(0, Number(row.debt)),
      0,
    );
    const netSales = Number(sales.netSales);
    const grossProfit = round(netSales - cost);
    return {
      grossSales: Number(sales.grossSales),
      refunds: Number(sales.refunds),
      netSales,
      cost,
      grossProfit,
      expenses,
      netProfit: round(grossProfit - expenses),
      discounts: Number(sales.discounts),
      saleCount: Number(sales.saleCount),
      outstandingDebt: round(outstandingDebt),
      payments,
    };
  }

  reportAnalytics(
    from: string,
    to: string,
  ): {
    topProducts: Array<{
      productName: string;
      quantity: number;
      revenue: number;
    }>;
    slowMoving: Array<{ productName: string; quantity: number }>;
    categories: Array<{ categoryName: string; revenue: number }>;
  } {
    const topProducts = this.sqlite
      .prepare(
        `SELECT i.productName, SUM(i.quantity) AS quantity, SUM(i.subtotal) AS revenue FROM sale_items i JOIN sales s ON s.id = i.saleId WHERE i.deletedAt IS NULL AND s.deletedAt IS NULL AND s.soldAt >= ? AND s.soldAt <= ? GROUP BY i.productId ORDER BY revenue DESC LIMIT 10`,
      )
      .all(from, to)
      .map((row: any) => ({
        productName: String(row.productName),
        quantity: Number(row.quantity),
        revenue: Number(row.revenue),
      }));
    const slowMoving = this.sqlite
      .prepare(
        `SELECT p.name AS productName, COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN i.quantity ELSE 0 END), 0) AS quantity FROM products p LEFT JOIN sale_items i ON i.productId = p.id AND i.deletedAt IS NULL LEFT JOIN sales s ON s.id = i.saleId AND s.deletedAt IS NULL AND s.soldAt >= ? AND s.soldAt <= ? WHERE p.deletedAt IS NULL GROUP BY p.id, p.name ORDER BY quantity, p.name LIMIT 10`,
      )
      .all(from, to)
      .map((row: any) => ({
        productName: String(row.productName),
        quantity: Number(row.quantity),
      }));
    const categories = this.sqlite
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorized') AS categoryName, SUM(i.subtotal) AS revenue FROM sale_items i JOIN sales s ON s.id = i.saleId LEFT JOIN products p ON p.id = i.productId LEFT JOIN categories c ON c.id = p.categoryId WHERE i.deletedAt IS NULL AND s.deletedAt IS NULL AND s.soldAt >= ? AND s.soldAt <= ? GROUP BY COALESCE(c.name, 'Uncategorized') ORDER BY revenue DESC`,
      )
      .all(from, to)
      .map((row: any) => ({
        categoryName: String(row.categoryName),
        revenue: Number(row.revenue),
      }));
    return { topProducts, slowMoving, categories };
  }

  listActivity(): Array<{
    id: string;
    actor: string | null;
    action: "discount" | "return" | "adjustment" | "waste";
    detail: string | null;
    amount: number | null;
    occurredAt: string;
  }> {
    return this.sqlite
      .prepare(
        `SELECT id, actor, action, detail, amount, occurredAt FROM activity_log WHERE deletedAt IS NULL AND action IN ('discount', 'return', 'adjustment', 'waste') ORDER BY occurredAt DESC LIMIT 200`,
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        actor: row.actor ?? null,
        action: row.action,
        detail: row.detail ?? null,
        amount: row.amount == null ? null : Number(row.amount),
        occurredAt: String(row.occurredAt),
      }));
  }

  stockDiscrepancies(): Array<{ id: string; name: string; quantity: number }> {
    return this.sqlite
      .prepare(
        "SELECT id, name, quantity FROM products WHERE deletedAt IS NULL AND quantity < 0 ORDER BY quantity, name",
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        quantity: Number(row.quantity),
      }));
  }
  crashes(): Array<{
    id: string;
    message: string;
    source: string;
    appVersion: string | null;
    occurredAt: string;
  }> {
    return this.sqlite
      .prepare(
        "SELECT id, message, source, appVersion, occurredAt FROM crash_logs ORDER BY occurredAt DESC LIMIT 100",
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        message: String(row.message),
        source: String(row.source),
        appVersion: row.appVersion ?? null,
        occurredAt: String(row.occurredAt),
      }));
  }
  logCrash(message: string, source: string, appVersion?: string): void {
    this.sqlite
      .prepare(
        "INSERT INTO crash_logs (id, message, source, appVersion, occurredAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        message.slice(0, 2000),
        source.slice(0, 200),
        appVersion ?? null,
        now(),
      );
  }
  clearCrashes(): void {
    this.sqlite.exec("DELETE FROM crash_logs");
  }

  listCashSessions(): CashSessionSummary[] {
    return this.sqlite
      .prepare(
        "SELECT id, openingFloat, expectedCash, countedCash, difference, openedAt, closedAt, status FROM cash_sessions WHERE deletedAt IS NULL ORDER BY openedAt DESC LIMIT 30",
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        openingFloat: Number(row.openingFloat),
        expectedCash:
          row.expectedCash == null ? null : Number(row.expectedCash),
        countedCash: row.countedCash == null ? null : Number(row.countedCash),
        difference: row.difference == null ? null : Number(row.difference),
        openedAt: String(row.openedAt),
        closedAt: row.closedAt ?? null,
        status: String(row.status),
      }));
  }

  listDebtors(): Array<{
    id: string;
    name: string;
    phone: string | null;
    debt: number;
  }> {
    return this.sqlite
      .prepare(
        `SELECT * FROM (SELECT c.id, c.name, c.phone, MAX(0, COALESCE((SELECT SUM(total) FROM sales WHERE customerId = c.id AND deletedAt IS NULL), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE customerId = c.id AND deletedAt IS NULL), 0)) AS debt FROM customers c WHERE c.deletedAt IS NULL) WHERE debt > 0 ORDER BY debt DESC`,
      )
      .all()
      .map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        phone: row.phone ?? null,
        debt: Number(row.debt),
      }));
  }

  collectDebt(
    customerId: string,
    amount: number,
    methodCode: string,
    note?: string,
    saleId?: string,
    date?: string,
  ): Receipt {
    if (!Number.isFinite(amount) || !(amount > 0))
      throw new Error("Collection amount must be more than zero");
    const customer = this.sqlite
      .prepare("SELECT id FROM customers WHERE id = ? AND deletedAt IS NULL")
      .get(customerId);
    if (!customer) throw new Error("Customer not found");
    const session = this.sqlite
      .prepare(
        "SELECT id FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1",
      )
      .get() as any;
    const method = this.paymentMethod(methodCode);
    if (saleId && !this.sqlite.prepare('SELECT id FROM sales WHERE id = ? AND customerId = ? AND deletedAt IS NULL').get(saleId,customerId)) throw new Error('Sale not found for this customer');
    const paymentId = randomUUID();
    const paidAt = date ? new Date(date).toISOString() : now();
    this.transaction(() => {
      this.writeLocal("payments", {
        id: paymentId,
        saleId: saleId ?? null,
        customerId,
        amount,
        methodCode,
        methodName: method.name,
        tendered: null,
        cashSessionId: session?.id ?? null,
        note: note?.trim() || null,
        paidAt,
      });

    });
    return {
      voucherId: `PAY-${paymentId.slice(0,8)}`,
      shopName: this.getShopSetting("shop.name") ?? "Store POS",
      shopPhone: this.getShopSetting("shop.phone"),
      soldAt: paidAt,
      paymentMethod: methodCode,
      subtotal: amount,
      discount: 0,
      total: amount,
      amountTendered: null,
      change: null,
      lines: [
        {
          productId: "debt-payment",
          name: "Debt payment",
          unit: "payment",
          quantity: 1,
          unitPrice: amount,
          unitCost: 0,
          discount: 0,
        },
      ],
    };
  }

  customerLedger(customerId: string): {
    balance: number;
    sales: Array<{
      id: string;
      voucherId: string;
      total: number;
      soldAt: string;
      remaining: number;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      methodCode: string;
      methodName: string;
      saleId: string | null;
      paidAt: string;
      note: string | null;
    }>;
  } {
    const customer = this.sqlite
      .prepare("SELECT id FROM customers WHERE id = ? AND deletedAt IS NULL")
      .get(customerId);
    if (!customer) throw new Error("Customer not found");
    const sales = this.sqlite
      .prepare(
        "SELECT id, voucherId, total, soldAt FROM sales WHERE customerId = ? AND deletedAt IS NULL ORDER BY soldAt, id",
      )
      .all(customerId) as any[];
    const payments = this.sqlite
      .prepare(
        "SELECT id, amount, methodCode, methodName, saleId, paidAt, note FROM payments WHERE customerId = ? AND deletedAt IS NULL ORDER BY paidAt, id",
      )
      .all(customerId) as any[];
    const direct = new Map<string, number>();
    let unallocated = 0;
    for (const payment of payments) {
      if (payment.saleId) direct.set(String(payment.saleId),(direct.get(String(payment.saleId))??0)+Number(payment.amount));
      else unallocated += Number(payment.amount);
    }
    const remaining = new Map<string,number>();
    for (const sale of sales) {
      let due = round(Number(sale.total)-(direct.get(String(sale.id))??0));
      if(due>0 && unallocated>0){const applied=Math.min(due,unallocated);due=round(due-applied);unallocated=round(unallocated-applied);}
      remaining.set(String(sale.id),Math.max(0,due));
    }
    const ledgerSales = sales.map((sale) => ({
      id: String(sale.id),
      voucherId: String(sale.voucherId),
      total: Number(sale.total),
      soldAt: String(sale.soldAt),
      remaining: round(remaining.get(String(sale.id)) ?? 0),
    }));
    return {
      balance: round(
        sales.reduce((sum, sale) => sum + Number(sale.total), 0) - payments.reduce((sum,p) => sum+Number(p.amount),0),
      ),
      sales: ledgerSales,
      payments: payments.map((row) => ({
        id: String(row.id),
        amount: Number(row.amount),
        methodCode: String(row.methodCode),
        methodName: row.methodName ?? row.methodCode,
        saleId: row.saleId ?? null,
        paidAt: String(row.paidAt),
        note: row.note ?? null,
      })),
    };
  }

  cashSession(): any {
    const session = this.sqlite
      .prepare(
        "SELECT id, status, openingFloat, expectedCash, countedCash, difference, openedAt, closedAt FROM cash_sessions WHERE status = 'open' AND deletedAt IS NULL ORDER BY openedAt DESC LIMIT 1",
      )
      .get() as any;
    if (!session) return null;
    const cashIn = Number(
      (
        this.sqlite
          .prepare(
            "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE cashSessionId = ? AND methodCode = 'cash' AND deletedAt IS NULL",
          )
          .get(session.id) as any
      ).total,
    );
    const cashOut = Number(
      (
        this.sqlite
          .prepare(
            "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE cashSessionId = ? AND deletedAt IS NULL",
          )
          .get(session.id) as any
      ).total,
    );
    return {
      ...session,
      openingFloat: Number(session.openingFloat),
      expectedCash: Number(session.openingFloat) + cashIn - cashOut,
    };
  }

  openCashSession(openingFloat: number): any {
    if (!Number.isFinite(openingFloat) || openingFloat < 0) throw new Error("Enter a non-negative opening float");
    if (this.cashSession()) throw new Error("A till session is already open");
    const openedAt = now();
    const date = new Date(openedAt);
    const id = 'cash-' + date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    this.writeLocal("cash_sessions", {
      id,
      status: "open",
      openedByName: "Desktop",
      closedByName: null,
      openingFloat: Number(openingFloat) || 0,
      expectedCash: null,
      countedCash: null,
      difference: null,
      note: null,
      openedAt,
      closedAt: null,
    });
    return this.cashSession();
  }

  closeCashSession(countedCash: number): any {
    const session = this.cashSession();
    if (!session) throw new Error("No open till session");
    const cashIn = Number(
      (
        this.sqlite
          .prepare(
            "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE cashSessionId = ? AND methodCode = 'cash' AND deletedAt IS NULL",
          )
          .get(session.id) as any
      ).total,
    );
    const cashOut = Number(
      (
        this.sqlite
          .prepare(
            "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE cashSessionId = ? AND deletedAt IS NULL",
          )
          .get(session.id) as any
      ).total,
    );
    const expected = Number(session.openingFloat) + cashIn - cashOut;
    const counted = Number(countedCash);
    if (!Number.isFinite(counted)) throw new Error("Counted cash is required");
    this.writeLocal("cash_sessions", {
      ...session,
      status: "closed",
      expectedCash: expected,
      countedCash: counted,
      difference: counted - expected,
      closedByName: "Desktop",
      closedAt: now(),
    });
    return { expected, counted, difference: counted - expected };
  }

  listExpenses(from?: string, to?: string): Expense[] {
    const range = from && to ? ' AND spentAt >= ? AND spentAt <= ?' : '';
    return this.sqlite.prepare('SELECT id,name,amount,note,spentAt,categoryId FROM expenses WHERE deletedAt IS NULL'+range+' ORDER BY spentAt DESC').all(...(from && to ? [from,to] : [])) as unknown as Expense[];
  }
  expenseCategories(): Array<{id:string;name:string}> {
    return this.sqlite.prepare('SELECT id,name FROM expense_categories WHERE deletedAt IS NULL ORDER BY name').all() as unknown as Array<{id:string;name:string}>;
  }
  saveExpense(name:string, amount:number, note?:string, details?:{id?:string;categoryId?:string|null;spentAt?:string}):void {
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0) throw new Error('Expense name and positive amount are required');
    const existing = details?.id ? this.sqlite.prepare('SELECT * FROM expenses WHERE id = ? AND deletedAt IS NULL').get(details.id) : null;
    if (details?.id && !existing) throw new Error('Expense not found');
    this.writeLocal('expenses', {
      id:details?.id ?? randomUUID(), categoryId:details?.categoryId !== undefined ? details.categoryId : existing?.categoryId ?? null,
      name:name.trim(),amount,note:note?.trim() || null,attachmentUrl:existing?.attachmentUrl ?? null,
      cashSessionId:existing ? existing.cashSessionId : this.cashSession()?.id ?? null,
      spentAt:details?.spentAt ? new Date(details.spentAt).toISOString() : existing?.spentAt ?? now(),
    });
  }
  removeExpense(id:string):void {
    const date=now(); this.sqlite.prepare('UPDATE expenses SET deletedAt = ?, updatedAt = ?, dirty = 1 WHERE id = ?').run(date,date,id);
  }

  getShopSetting(key: string): string | null {
    return (
      (
        this.sqlite
          .prepare(
            "SELECT value FROM shop_settings WHERE key = ? AND deletedAt IS NULL",
          )
          .get(key) as any
      )?.value ?? null
    );
  }

  shopProfile(): {
    name: string;
    address: string;
    phone: string;
    receiptFooter: string;
  } {
    return {
      name: this.getShopSetting("shop.name") ?? "",
      address: this.getShopSetting("shop.address") ?? "",
      phone: this.getShopSetting("shop.phone") ?? "",
      receiptFooter: this.getShopSetting("shop.receiptFooter") ?? "",
    };
  }
  saveShopProfile(profile: {
    name: string;
    address: string;
    phone: string;
    receiptFooter: string;
  }): { name: string; address: string; phone: string; receiptFooter: string } {
    const next = {
      name: profile.name.trim(),
      address: profile.address.trim(),
      phone: profile.phone.trim(),
      receiptFooter: profile.receiptFooter.trim(),
    };
    this.transaction(() => {
      for (const [key, value] of Object.entries({
        "shop.name": next.name,
        "shop.address": next.address,
        "shop.phone": next.phone,
        "shop.receiptFooter": next.receiptFooter,
      }))
        this.writeLocal("shop_settings", { id: key, key, value });
    });
    return next;
  }

  nextVoucher(): string {
    const code = this.getState('device.code') ?? 'D';
    let sequence = Number(this.getState('voucher.sequence') ?? 0);
    let voucher: string;
    do { voucher = code + '-' + String(++sequence).padStart(6,'0'); }
    while (this.sqlite.prepare('SELECT id FROM sales WHERE voucherId = ?').get(voucher));
    this.setState('voucher.sequence',String(sequence));
    return voucher;
  }

  private paymentMethod(code: string): PaymentMethod {
    const method = this.listPaymentMethods().find(m => m.code === code && m.isActive && code !== 'debt');
    if (!method) throw new Error('Choose an active payment method');
    return method;
  }

  capabilities(): Capabilities {
    const rawTier = this.getState('entitlement.tier') ?? 'free';
    const tier = rawTier === 'premium' ? 'cloud_pro' : ['cloud_pro','offline_plus'].includes(rawTier) ? rawTier : 'free';
    const premiumUntil = this.getState('entitlement.premiumUntil');
    const effectivePlan = premiumUntil && Date.parse(premiumUntil) > Date.now() ? tier : 'free';
    const advanced = ['offline_plus', 'cloud_pro'].includes(effectivePlan);
    const flags = {debt: this.getShopSetting('feature.debt') !== '0', expenses: this.getShopSetting('feature.expenses') !== '0', dayEnd: this.getShopSetting('feature.dayEnd') !== '0'};
    return {owner: this.getState('device.role') !== 'cashier', tier, premiumUntil, effectivePlan, cloud: effectivePlan === 'cloud_pro', debt: advanced && flags.debt, expenses: advanced && flags.expenses, dayEnd: advanced && flags.dayEnd, flags};
  }

  setFeature(name: 'debt' | 'expenses' | 'dayEnd', enabled: boolean): void {
    if (!this.capabilities().owner) throw new Error('Only the owner can change shop features');
    if (!['debt','expenses','dayEnd'].includes(name)) throw new Error('Unknown feature');
    const key = 'feature.' + name;
    this.writeLocal('shop_settings', {id:key,key,value:enabled?'1':'0'});
  }

  cartDraft(): CartDraft {
    const empty: CartDraft = {lines:[],orderDiscount:0,customerId:'',note:'',soldAt:'',priceLevelId:'level-retail'};
    try {
      const value = JSON.parse(this.getState('cart.draft') ?? 'null');
      if (!value || !Array.isArray(value.entries)) return empty;
      const priceLevelId = typeof value.priceLevelId === 'string' ? value.priceLevelId : empty.priceLevelId;
      const lines: CartLine[] = [];
      for (const entry of value.entries) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
        const [id, amounts] = entry;
        if (!amounts || !Number.isFinite(amounts.quantity) || amounts.quantity <= 0) continue;
        const product = this.findProduct(id);
        if (!product || !product.isActive) continue;
        lines.push({productId:id,name:product.name,unit:product.unit,quantity:amounts.quantity,discount:Number.isFinite(amounts.discount)?Math.max(0,amounts.discount):0,unitPrice:this.priceFor(id,priceLevelId,amounts.quantity),unitCost:product.cost});
      }
      return {lines,priceLevelId,orderDiscount:Number.isFinite(value.orderDiscount)?Math.max(0,value.orderDiscount):0,customerId:typeof value.customerId==='string'?value.customerId:'',note:typeof value.note==='string'?value.note:'',soldAt:typeof value.soldAt==='string'?value.soldAt:''};
    } catch { return empty; }
  }

  saveCartDraft(draft: CartDraft): void {
    if (!draft || !Array.isArray(draft.lines) || !Number.isFinite(draft.orderDiscount)) throw new Error('Invalid cart draft');
    const entries = draft.lines.map(line => {
      if (typeof line.productId !== 'string' || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.discount)) throw new Error('Invalid cart line');
      return [line.productId,{quantity:round(line.quantity),discount:Math.max(0,line.discount)}];
    });
    this.setState('cart.draft', JSON.stringify({entries,orderDiscount:Math.max(0,draft.orderDiscount),customerId:draft.customerId||null,note:draft.note||'',soldAt:draft.soldAt||null,priceLevelId:draft.priceLevelId||'level-retail'}));
  }

  wipeShopData(): void {
    this.transaction(() => {
      for (const table of SYNC_TABLES) this.sqlite.exec('DELETE FROM '+table.name);
      this.sqlite.exec('DELETE FROM sync_conflicts');
      this.sqlite.exec("DELETE FROM sync_state WHERE key LIKE 'identity.%'");
      for (const key of ['data.shopId','cart.draft','cloud.lastSyncedAt']) this.setState(key,null);
      this.setState('cloud.cursor','0'); this.setState('voucher.sequence','0');
      for (const [id,name,isDefault,sortOrder] of [['level-retail','Retail',1,0],['level-wholesale','Wholesale',0,1]])
        this.sqlite.prepare('INSERT INTO price_levels (id,updatedAt,name,isDefault,sortOrder) VALUES (?,?,?,?,?)').run(id,now(),name,isDefault,sortOrder);
    });
  }

  countDirty(): number {
    return SYNC_TABLES.reduce(
      (total, table) =>
        total +
        Number(
          (
            this.sqlite
              .prepare(
                `SELECT COUNT(*) AS count FROM ${table.name} WHERE dirty = 1`,
              )
              .get() as any
          ).count,
        ),
      0,
    );
  }

  dirtyChanges(limit = 500): any[] {
    const changes: any[] = [];
    for (const table of SYNC_TABLES) {
      for (const row of this.sqlite
        .prepare(
          `SELECT * FROM ${table.name} WHERE dirty = 1 ORDER BY id LIMIT ?`,
        )
        .all(limit - changes.length) as Record<string, unknown>[]) {
        changes.push({
          table: table.name,
          id: row.id,
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt ?? null,
          data: Object.fromEntries(
            table.columns
              .filter((column) => column in row)
              .map((column) => [column, row[column]]),
          ),
        });
        if (changes.length >= limit) return changes;
      }
    }
    return changes;
  }

  reconcilePush(
    sent: any[],
    response: { accepted: any[]; skipped: any[] },
  ): void {
    const sentByKey = new Map(
      sent.map((item) => [`${item.table}:${item.id}`, item]),
    );
    for (const accepted of response.accepted ?? []) {
      const change = sentByKey.get(`${accepted.table}:${accepted.id}`);
      if (!change || !SYNC_BY_NAME.has(accepted.table)) continue;
      this.sqlite
        .prepare(
          `UPDATE ${accepted.table} SET dirty = 0, serverSeq = ? WHERE id = ? AND updatedAt = ?`,
        )
        .run(accepted.serverSeq, accepted.id, change.updatedAt);
    }
    for (const skipped of response.skipped ?? []) {
      const change = sentByKey.get(`${skipped.table}:${skipped.id}`);
      if (!change || !SYNC_BY_NAME.has(skipped.table)) continue;
      if (skipped.reason === "duplicate")
        this.sqlite
          .prepare(
            `UPDATE ${skipped.table} SET dirty = 0 WHERE id = ? AND updatedAt = ?`,
          )
          .run(skipped.id, change.updatedAt);
      if (skipped.reason === 'voucher_taken' && skipped.table === 'sales') {
        const sequence = this.nextVoucher();
        this.sqlite.prepare('UPDATE sales SET voucherId = ?, updatedAt = ?, dirty = 1 WHERE id = ? AND updatedAt = ?').run(sequence, now(), skipped.id, change.updatedAt);
      }
      if (skipped.reason === "stale") {
        this.recordConflict(skipped.table, skipped.id, change.data);
        this.sqlite
          .prepare(
            `UPDATE ${skipped.table} SET dirty = 0 WHERE id = ? AND updatedAt = ?`,
          )
          .run(skipped.id, change.updatedAt);
      }
    }
  }

  applyPulled(rows: any[], nextSince?: number): void {
    this.transaction(() => {
      const touched = new Set<string>();
      for (const row of rows) {
        const table = SYNC_BY_NAME.get(row.table);
        if (!table) continue;
        const local = this.sqlite
          .prepare(`SELECT * FROM ${table.name} WHERE id = ?`)
          .get(row.id) as any;
        if (
          local?.dirty &&
          table.strategy === "last_write_wins" &&
          new Date(local.updatedAt) > new Date(row.updatedAt)
        )
          continue;
        if (local?.dirty && table.strategy === "last_write_wins")
          this.recordConflict(table.name, row.id, local);
        const fields = [
          "id",
          "updatedAt",
          "deletedAt",
          "serverSeq",
          "dirty",
          ...table.columns.filter((column) => column in row),
        ];
        const values = [
          row.id,
          row.updatedAt,
          row.deletedAt ?? null,
          row.serverSeq,
          0,
          ...fields.slice(5).map((column) => normalize(row[column])),
        ];
        const update = fields
          .filter((field) => field !== "id")
          .map((field) => `${field}=excluded.${field}`)
          .join(",");
        this.sqlite
          .prepare(
            `INSERT INTO ${table.name} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${update}`,
          )
          .run(...values);
        if (table.name === 'products') touched.add(String(row.id));
        if (
          table.name === "stock_movements" &&
          typeof row.productId === "string"
        )
          touched.add(row.productId);
      }
      reconcileIdentities(this.sqlite);
      for (const id of touched) this.recomputeStock(id);
      if (nextSince != null) this.setState('cloud.cursor', String(nextSince));
    });
  }

  private writeLocal(tableName: string, row: Record<string, unknown>): void {
    const table = SYNC_BY_NAME.get(tableName);
    if (!table) throw new Error(`Unknown sync table: ${tableName}`);
    const fields = [
      "id",
      "updatedAt",
      "deletedAt",
      "serverSeq",
      "dirty",
      ...table.columns.filter((column) => column in row),
    ];
    const previous = row.id ? this.sqlite.prepare('SELECT updatedAt FROM '+tableName+' WHERE id = ?').get(String(row.id)) : null;
    const timestamp = new Date(Math.max(Date.now(), previous ? Date.parse(String(previous.updatedAt)) + 1 : 0)).toISOString();
    const values = [
      row.id ?? randomUUID(),
      timestamp,
      null,
      0,
      1,
      ...fields.slice(5).map((column) => normalize(row[column])),
    ];
    const update = fields
      .filter((field) => field !== "id" && field !== "serverSeq")
      .map((field) => `${field}=excluded.${field}`)
      .join(",");
    this.sqlite
      .prepare(
        `INSERT INTO ${tableName} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${update}, dirty=1, updatedAt=excluded.updatedAt`,
      )
      .run(...(values as [any, ...any[]]));
  }

  private recomputeStock(productId: string): void {
    const product = this.sqlite
      .prepare("SELECT cost FROM products WHERE id = ?")
      .get(productId) as { cost?: number } | undefined;
    if (!product) return;
    const rows = this.sqlite
      .prepare(
        "SELECT quantityDelta, unitCost FROM stock_movements WHERE productId = ? AND deletedAt IS NULL ORDER BY occurredAt, id",
      )
      .all(productId) as Array<{
      quantityDelta: number;
      unitCost: number | null;
    }>;
    let quantity = 0;
    let value = 0;
    let lastKnown = Number(product.cost) || 0;
    for (const row of rows) {
      const delta = Number(row.quantityDelta);
      if (!delta) continue;
      const average = quantity > 0 ? value / quantity : lastKnown;
      if (delta > 0) {
        const cost = row.unitCost == null ? average : Number(row.unitCost);
        value += delta * cost;
        quantity += delta;
      } else {
        value += delta * average;
        quantity += delta;
      }
      if (quantity > 0) lastKnown = value / quantity;
      else value = 0;
    }
    this.sqlite
      .prepare("UPDATE products SET quantity = ?, cost = ? WHERE id = ?")
      .run(round(quantity), quantity > 0 ? lastKnown : lastKnown, productId);
  }

  private recordConflict(
    tableName: string,
    rowId: string,
    discarded: unknown,
  ): void {
    this.sqlite
      .prepare(
        "INSERT INTO sync_conflicts (id, tableName, rowId, discarded, detectedAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), tableName, rowId, JSON.stringify(discarded), now());
  }

  private nextMovementAt(): string {
    const candidate = Date.now();
    const prior = Date.parse(this.lastMovementAt);
    const timestamp =
      Number.isFinite(prior) && candidate <= prior ? prior + 1 : candidate;
    this.lastMovementAt = new Date(timestamp).toISOString();
    return this.lastMovementAt;
  }

  private transaction<T>(operation: () => T): T {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function toProduct(row: any): Product {
  return {
    ...row,
    barcode: row.barcode ?? null,
    categoryId: row.categoryId ?? null,
    supplierId: row.supplierId ?? null,
    price: Number(row.price),
    cost: Number(row.cost),
    quantity: Number(row.quantity),
    minStock: Number(row.minStock),
    isActive: Boolean(row.isActive),
  };
}

function normalize(value: unknown): unknown {
  return typeof value === "boolean" ? Number(value) : (value ?? null);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
