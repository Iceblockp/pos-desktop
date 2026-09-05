export type SyncStatus =
  | 'signed_out'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'paused'
  | 'suspended'
  | 'expired'
  | 'error';

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  categoryId: string | null;
  supplierId: string | null;
  price: number;
  cost: number;
  quantity: number;
  minStock: number;
  unit: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
}

export interface SupplierPurchase {
  id: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  referenceNumber: string | null;
  occurredAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
}

export interface CartLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
}

export interface SaleDraft {
  lines: CartLine[];
  customerId?: string | null;
  paymentMethod: string;
  priceLevelId?: string | null;
  amountTendered?: number | null;
  discount?: number;
  note?: string;
  staffName?: string;
}

export interface Receipt {
  voucherId: string;
  shopName: string;
  shopPhone: string | null;
  soldAt: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  total: number;
  amountTendered: number | null;
  change: number | null;
  lines: CartLine[];
}

export interface SaleSummary {
  id: string;
  voucherId: string;
  type: 'sale' | 'return';
  total: number;
  soldAt: string;
  customerName: string | null;
  paymentMethod: string;
}

export interface ReturnableLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  returned: number;
  returnable: number;
  refundPerUnit: number;
  unitCost: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'stock_in' | 'waste' | 'adjustment' | 'sale' | 'return' | 'opening';
  quantityDelta: number;
  unitCost: number | null;
  supplierId: string | null;
  supplierName: string | null;
  referenceNumber: string | null;
  reason: string | null;
  occurredAt: string;
  balance: number;
}

export interface ReportSummary {
  grossSales: number;
  refunds: number;
  netSales: number;
  cost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  discounts: number;
  saleCount: number;
  outstandingDebt: number;
  payments: Array<{ methodCode: string; total: number }>;
}
export interface CustomerLedger { balance: number; sales: Array<{ id: string; voucherId: string; total: number; soldAt: string; remaining: number }>; payments: Array<{ id: string; amount: number; methodCode: string; methodName: string; saleId: string | null; paidAt: string; note: string | null }>; }
export interface ReportAnalytics { topProducts: Array<{ productName: string; quantity: number; revenue: number }>; slowMoving: Array<{ productName: string; quantity: number }>; categories: Array<{ categoryName: string; revenue: number }>; }
export interface ActivityEntry { id: string; actor: string | null; action: 'discount' | 'return' | 'adjustment' | 'waste'; detail: string | null; amount: number | null; occurredAt: string; }
export interface CrashLog { id: string; message: string; source: string; appVersion: string | null; occurredAt: string; }

export interface CashSessionSummary {
  id: string;
  openingFloat: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  openedAt: string;
  closedAt: string | null;
  status: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PriceLevel { id: string; name: string; isDefault: boolean; sortOrder: number; productCount?: number; saleCount?: number; }
export interface ProductTier { id: string; productId: string; priceLevelId: string; minQuantity: number; bulkPrice: number; }

export interface Dashboard {
  salesToday: number;
  revenueToday: number;
  lowStock: number;
  pendingSync: number;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
}

export interface PrinterSettings {
  deviceName: string | null;
  paperWidth: 58 | 80;
  autoPrint: boolean;
}

export interface CloudState {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
  shopName: string | null;
  deviceName: string | null;
  deviceId?: string | null;
  deviceCode?: string | null;
  role?: string | null;
}
export interface ShopProfile { name: string; address: string; phone: string; receiptFooter: string; }
export interface PairedDevice { id: string; name: string; deviceCode: string; role: string; lastSyncedAt: string | null; isCurrent: boolean; }
export interface BillingStatus { tier: string; premiumUntil: string | null; entitlement?: string; daysAdded?: number; }

export interface LoginInput {
  phone: string;
  password: string;
  deviceName: string;
}

export interface RegisterInput extends LoginInput {
  shopName: string;
  currency?: string;
  timezone?: string;
}

export interface DesktopApi {
  app: { version: () => Promise<string> };
  pos: {
    dashboard: () => Promise<Dashboard>;
    products: (search?: string) => Promise<Product[]>;
    findByBarcode: (code: string) => Promise<Product | null>;
    saveProduct: (input: Partial<Product> & Pick<Product, 'name' | 'price'>) => Promise<Product>;
    removeProduct: (id: string) => Promise<void>;
    categories: () => Promise<Category[]>;
    saveCategory: (input: Partial<Category> & Pick<Category, 'name'>) => Promise<Category>;
    removeCategory: (id: string) => Promise<void>;
    suppliers: (search?: string) => Promise<Supplier[]>;
    saveSupplier: (input: Partial<Supplier> & Pick<Supplier, 'name'>) => Promise<Supplier>;
    removeSupplier: (id: string) => Promise<void>;
    supplierPurchases: (supplierId: string, from?: string, to?: string) => Promise<SupplierPurchase[]>;
    supplierSpend: (supplierId: string, from?: string, to?: string) => Promise<number>;
    customers: () => Promise<Customer[]>;
    saveCustomer: (input: Partial<Customer> & Pick<Customer, 'name'>) => Promise<Customer>;
    removeCustomer: (id: string) => Promise<void>;
    customerLedger: (id: string) => Promise<CustomerLedger>;
    checkout: (draft: SaleDraft) => Promise<Receipt>;
    sales: (search?: string, from?: string, to?: string) => Promise<SaleSummary[]>;
    receipt: (voucherId: string) => Promise<Receipt | null>;
    returnableSale: (voucherId: string) => Promise<ReturnableLine[] | null>;
    returnSale: (voucherId: string, lines: Array<{ productId: string; quantity: number }>, refundMethod: string, note?: string) => Promise<Receipt>;
    stockHistory: (productId: string) => Promise<StockMovement[]>;
    adjustStock: (productId: string, quantityDelta: number, type: 'stock_in' | 'waste' | 'adjustment', reason?: string, details?: { supplierId?: string | null; referenceNumber?: string | null; unitCost?: number | null }) => Promise<Product>;
    report: (from: string, to: string) => Promise<ReportSummary>;
    reportAnalytics: (from: string, to: string) => Promise<ReportAnalytics>;
    activity: () => Promise<ActivityEntry[]>;
    stockDiscrepancies: () => Promise<Array<{ id: string; name: string; quantity: number }>>;
    crashes: () => Promise<CrashLog[]>;
    logCrash: (message: string, source: string) => Promise<void>;
    clearCrashes: () => Promise<void>;
    cashSessions: () => Promise<CashSessionSummary[]>;
    paymentMethods: () => Promise<PaymentMethod[]>;
    savePaymentMethod: (input: Partial<PaymentMethod> & Pick<PaymentMethod, 'name'>) => Promise<PaymentMethod>;
    removePaymentMethod: (id: string) => Promise<'deleted' | 'deactivated'>;
    priceLevels: () => Promise<PriceLevel[]>;
    savePriceLevel: (input: Partial<PriceLevel> & Pick<PriceLevel, 'name'>) => Promise<PriceLevel>;
    removePriceLevel: (id: string) => Promise<void>;
    productTiers: (productId: string) => Promise<ProductTier[]>;
    saveProductTier: (input: Partial<ProductTier> & Pick<ProductTier, 'productId' | 'priceLevelId' | 'minQuantity' | 'bulkPrice'>) => Promise<ProductTier>;
    removeProductTier: (id: string) => Promise<void>;
    priceFor: (productId: string, priceLevelId: string | null, quantity: number) => Promise<number>;
    debtors: () => Promise<Array<{ id: string; name: string; phone: string | null; debt: number }>>;
    collectDebt: (customerId: string, amount: number, methodCode: string, note?: string) => Promise<Receipt>;
    cashSession: () => Promise<any>;
    openCashSession: (openingFloat: number) => Promise<any>;
    closeCashSession: (countedCash: number) => Promise<any>;
    expenses: () => Promise<any[]>;
    saveExpense: (name: string, amount: number, note?: string) => Promise<void>;
    shopProfile: () => Promise<ShopProfile>;
    saveShopProfile: (profile: ShopProfile) => Promise<ShopProfile>;
  };
  cloud: {
    state: () => Promise<CloudState>;
    setApiUrl: (url: string) => Promise<void>;
    register: (input: RegisterInput) => Promise<CloudState>;
    login: (input: LoginInput) => Promise<CloudState>;
    syncNow: () => Promise<CloudState>;
    signOut: () => Promise<CloudState>;
    devices: () => Promise<PairedDevice[]>;
    revokeDevice: (id: string) => Promise<void>;
    billingStatus: () => Promise<BillingStatus>;
    redeemCode: (code: string) => Promise<BillingStatus>;
  };
  printer: {
    list: () => Promise<PrinterInfo[]>;
    settings: () => Promise<PrinterSettings>;
    saveSettings: (settings: PrinterSettings) => Promise<PrinterSettings>;
    printReceipt: (receipt: Receipt) => Promise<void>;
    test: () => Promise<void>;
  };
}
