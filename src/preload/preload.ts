import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/models';

/** One explicit method per IPC channel; raw ipcRenderer is never exposed. */
const api: DesktopApi = {
  app: { version: () => ipcRenderer.invoke('app:version') },
  pos: {
    dashboard: () => ipcRenderer.invoke('pos:dashboard'),
    products: (search) => ipcRenderer.invoke('pos:products', search),
    findByBarcode: (code) => ipcRenderer.invoke('pos:find-barcode', code),
    saveProduct: (input) => ipcRenderer.invoke('pos:save-product', input),
    customers: () => ipcRenderer.invoke('pos:customers'),
    saveCustomer: (input) => ipcRenderer.invoke('pos:save-customer', input),
    checkout: (draft) => ipcRenderer.invoke('pos:checkout', draft),
    sales: (search) => ipcRenderer.invoke('pos:sales', search),
    receipt: (voucherId) => ipcRenderer.invoke('pos:receipt', voucherId),
    returnableSale: (voucherId) => ipcRenderer.invoke('pos:returnable-sale', voucherId),
    returnSale: (voucherId, lines, refundMethod, note) => ipcRenderer.invoke('pos:return-sale', voucherId, lines, refundMethod, note),
    debtors: () => ipcRenderer.invoke('pos:debtors'),
    collectDebt: (customerId, amount, methodCode, note) => ipcRenderer.invoke('pos:collect-debt', customerId, amount, methodCode, note),
    cashSession: () => ipcRenderer.invoke('pos:cash-session'),
    openCashSession: (openingFloat) => ipcRenderer.invoke('pos:open-cash-session', openingFloat),
    closeCashSession: (countedCash) => ipcRenderer.invoke('pos:close-cash-session', countedCash),
    expenses: () => ipcRenderer.invoke('pos:expenses'),
    saveExpense: (name, amount, note) => ipcRenderer.invoke('pos:save-expense', name, amount, note),
  },
  cloud: {
    state: () => ipcRenderer.invoke('cloud:state'),
    setApiUrl: (url) => ipcRenderer.invoke('cloud:set-api-url', url),
    register: (input) => ipcRenderer.invoke('cloud:register', input),
    login: (input) => ipcRenderer.invoke('cloud:login', input),
    syncNow: () => ipcRenderer.invoke('cloud:sync-now'),
    signOut: () => ipcRenderer.invoke('cloud:sign-out'),
  },
  printer: {
    list: () => ipcRenderer.invoke('printer:list'),
    settings: () => ipcRenderer.invoke('printer:settings'),
    saveSettings: (settings) => ipcRenderer.invoke('printer:save-settings', settings),
    printReceipt: (receipt) => ipcRenderer.invoke('printer:print-receipt', receipt),
  },
};

contextBridge.exposeInMainWorld('storePos', api);
