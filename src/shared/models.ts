export interface CartDraft { lines: CartLine[]; orderDiscount: number; customerId: string; note: string; soldAt: string; priceLevelId: string; }
export interface Capabilities { owner: boolean; tier: string; effectivePlan: string; premiumUntil: string | null; cloud: boolean; debt: boolean; expenses: boolean; dayEnd: boolean; flags: { debt: boolean; expenses: boolean; dayEnd: boolean }; }
export interface LoginDevice { id: string; name: string; deviceCode: string; lastSyncedAt: string | null; }
export interface DeviceLimit { status: 'device_limit'; limit: number; devices: LoginDevice[]; loginTicket: string; }
export interface InactiveDevices { status: 'inactive_devices'; devices: LoginDevice[]; canCreateNew: boolean; loginTicket: string; }
export interface ShopSwitch { status: 'shop_switch'; shopName: string; unsyncedCount: number; }
export type ConnectResult = CloudState | DeviceLimit | InactiveDevices | ShopSwitch;
export interface PaymentSlip { id: string; tier: string; method: string; amount: number; reference: string; status: string; reviewNote: string | null; createdAt: string; }
export interface NotificationPreferences { lowStock: boolean; dailyEnabled: boolean; hour: number; minute: number; supported: boolean; }
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
  tiers?: ProductTier[];
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
  subtotal?: number;
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
}

export interface SalePayment { amount: number; methodCode: string; methodName?: string | null; tendered?: number | null; paidAt?: string; }
export interface Expense { id: string; name: string; amount: number; note: string | null; spentAt: string; categoryId: string | null; }
export interface SaleDraft {
  payments?: SalePayment[];
  soldAt?: string | null;
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
  payments?: SalePayment[];
  outstanding?: number;
  customerId?: string | null;
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
export interface PageResult<T> { items: T[]; total: number; }
export interface ProductSummary { total: number; lowStock: number; outOfStock: number; inventoryValue: number; }
export interface CustomerWithDebt extends Customer { debt: number; }
export interface CustomerSummary { total: number; debtors: number; receivables: number; }
export interface SalesSummaryMetrics { total: number; sales: number; debt: number; returns: number; netVolume: number; }

export interface ReturnableLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  returned: number;
  returnable: number;
  refundPerUnit: number;
  unitPrice: number;
  unitCost: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'stock_in' | 'waste' | 'adjustment' | 'sale_out' | 'return_in';
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
export interface ProductTier { id: string; productId: string; priceLevelId: string | null; minQuantity: number; bulkPrice: number; }

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
  dataRevision?: number;
  apiUrl?: string;
  deviceName: string | null;
  deviceId?: string | null;
  deviceCode?: string | null;
  role?: string | null;
}
export interface ShopProfile { name: string; address: string; phone: string; receiptFooter: string; currency?: string; }
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
  app: { version: () => Promise<string>; onNavigate: (listener:(page:'inventory'|'reports')=>void)=>()=>void };
  pos: {
    capabilities: () => Promise<Capabilities>;
    setFeature: (name: 'debt' | 'expenses' | 'dayEnd', enabled: boolean) => Promise<void>;
    cartDraft: () => Promise<CartDraft>;
    saveCartDraft: (draft: CartDraft) => Promise<void>;
    notificationPreferences: () => Promise<NotificationPreferences>;
    saveNotificationPreferences: (prefs: NotificationPreferences) => Promise<NotificationPreferences>;
    dashboard: () => Promise<Dashboard>;
    cartProducts: (ids: string[]) => Promise<Product[]>;
    products: (search?: string) => Promise<Product[]>;
    productPage: (input?: { search?: string; categoryId?: string; stockFilter?: 'all' | 'low' | 'out'; sortBy?: 'name-asc' | 'stock-asc' | 'price-desc' | 'price-asc'; offset?: number; limit?: number }) => Promise<PageResult<Product>>;
    productSummary: () => Promise<ProductSummary>;
    categoryProductCounts: () => Promise<{ byCategory: Record<string, number>; uncategorized: number }>;
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
    customerPage: (input?: { search?: string; filter?: 'all' | 'debt' | 'clear'; offset?: number; limit?: number }) => Promise<PageResult<CustomerWithDebt>>;
    customerSummary: () => Promise<CustomerSummary>;
    saveCustomer: (input: Partial<Customer> & Pick<Customer, 'name'>) => Promise<Customer>;
    removeCustomer: (id: string) => Promise<void>;
    customerLedger: (id: string) => Promise<CustomerLedger>;
    checkout: (draft: SaleDraft) => Promise<Receipt>;
    sales: (search?: string, from?: string, to?: string) => Promise<SaleSummary[]>;
    salesPage: (input?: { search?: string; from?: string; to?: string; filter?: 'all' | 'sales' | 'debt' | 'returns'; offset?: number; limit?: number }) => Promise<PageResult<SaleSummary>>;
    salesSummary: (input?: { search?: string; from?: string; to?: string }) => Promise<SalesSummaryMetrics>;
    receipt: (voucherId: string) => Promise<Receipt | null>;
    returnableSale: (voucherId: string) => Promise<ReturnableLine[] | null>;
    returnSale: (voucherId: string, lines: Array<{ productId: string; quantity: number }>, refundMethod: string, note?: string, refundAmount?: number) => Promise<Receipt>;
    stockHistory: (productId: string) => Promise<StockMovement[]>;
    setStockTo: (productId: string, counted: number, reason?: string) => Promise<Product>;
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
    collectDebt: (customerId: string, amount: number, methodCode: string, note?: string, saleId?: string, paidAt?: string) => Promise<Receipt>;
    cashSession: () => Promise<any>;
    openCashSession: (openingFloat: number) => Promise<any>;
    closeCashSession: (countedCash: number) => Promise<any>;
    expenses: (from?: string, to?: string) => Promise<Expense[]>;
    expenseCategories: () => Promise<Array<{id: string; name: string}>>;
    removeExpense: (id: string) => Promise<void>;
    saveExpense: (name: string, amount: number, note?: string, details?: {id?: string; categoryId?: string | null; spentAt?: string}) => Promise<void>;
    shopProfile: () => Promise<ShopProfile>;
    saveShopProfile: (profile: ShopProfile) => Promise<ShopProfile>;
  };
  cloud: {
    completeLogin: (input: {loginTicket: string; revokeDeviceId?: string; reclaimDeviceId?: string; createNew?: boolean; deviceName: string}) => Promise<ConnectResult>;
    join: (input: {pairingCode: string; deviceName: string}) => Promise<ConnectResult>;
    createPairingCode: () => Promise<{code: string; expiresAt: string}>;
    confirmSwitch: () => Promise<CloudState>;
    cancelSwitch: () => Promise<void>;
    submitSlip: (input: {tier: 'offline_plus' | 'cloud_pro'; method: string; amount: number; reference: string; note?: string}) => Promise<PaymentSlip>;
    listSlips: () => Promise<PaymentSlip[]>;
    state: () => Promise<CloudState>;
    setApiUrl: (url: string) => Promise<void>;
    register: (input: RegisterInput) => Promise<ConnectResult>;
    login: (input: LoginInput) => Promise<ConnectResult>;
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
