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
  price: number;
  cost: number;
  quantity: number;
  minStock: number;
  unit: string;
  isActive: boolean;
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
}

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
    customers: () => Promise<Customer[]>;
    saveCustomer: (input: Partial<Customer> & Pick<Customer, 'name'>) => Promise<Customer>;
    checkout: (draft: SaleDraft) => Promise<Receipt>;
    sales: (search?: string) => Promise<SaleSummary[]>;
    receipt: (voucherId: string) => Promise<Receipt | null>;
    returnableSale: (voucherId: string) => Promise<ReturnableLine[] | null>;
    returnSale: (voucherId: string, lines: Array<{ productId: string; quantity: number }>, refundMethod: string, note?: string) => Promise<Receipt>;
    debtors: () => Promise<Array<{ id: string; name: string; phone: string | null; debt: number }>>;
    collectDebt: (customerId: string, amount: number, methodCode: string, note?: string) => Promise<void>;
    cashSession: () => Promise<any>;
    openCashSession: (openingFloat: number) => Promise<any>;
    closeCashSession: (countedCash: number) => Promise<any>;
    expenses: () => Promise<any[]>;
    saveExpense: (name: string, amount: number, note?: string) => Promise<void>;
  };
  cloud: {
    state: () => Promise<CloudState>;
    setApiUrl: (url: string) => Promise<void>;
    register: (input: RegisterInput) => Promise<CloudState>;
    login: (input: LoginInput) => Promise<CloudState>;
    syncNow: () => Promise<CloudState>;
    signOut: () => Promise<CloudState>;
  };
  printer: {
    list: () => Promise<PrinterInfo[]>;
    settings: () => Promise<PrinterSettings>;
    saveSettings: (settings: PrinterSettings) => Promise<PrinterSettings>;
    printReceipt: (receipt: Receipt) => Promise<void>;
  };
}
