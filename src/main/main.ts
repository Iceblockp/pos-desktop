import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { PosDatabase } from './database';
import { CloudService } from './cloud';
import { getPrinterSettings, listPrinters, printReceipt, savePrinterSettings } from './printer';

let mainWindow: BrowserWindow | null = null;
let database: PosDatabase;
let cloud: CloudService;

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url;
  if (!url) throw new Error('Rejected IPC request without a sender frame');
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if ((devUrl && url.startsWith(devUrl)) || (!devUrl && url.startsWith('file://'))) return;
  throw new Error('Rejected IPC request from an untrusted renderer');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#f6f5f1',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDev = process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    if (!isDev && !url.startsWith('file://')) event.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL) void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void mainWindow.loadFile(join(__dirname, '../../renderer/index.html'));
}

function registerIpc(): void {
  ipcMain.handle('app:version', (event) => { assertTrustedSender(event); return app.getVersion(); });
  ipcMain.handle('pos:dashboard', (event) => { assertTrustedSender(event); return database.dashboard(); });
  ipcMain.handle('pos:report', (event, from, to) => { assertTrustedSender(event); return database.report(String(from), String(to)); });
  ipcMain.handle('pos:cash-sessions', (event) => { assertTrustedSender(event); return database.listCashSessions(); });
  ipcMain.handle('pos:payment-methods', (event) => { assertTrustedSender(event); return database.listPaymentMethods(); });
  ipcMain.handle('pos:save-payment-method', (event, input: unknown) => { assertTrustedSender(event); const result = database.savePaymentMethod(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:price-levels', (event) => { assertTrustedSender(event); return database.listPriceLevels(); });
  ipcMain.handle('pos:save-price-level', (event, input: unknown) => { assertTrustedSender(event); const result = database.savePriceLevel(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:remove-price-level', (event, id: unknown) => { assertTrustedSender(event); database.removePriceLevel(String(id)); void cloud.syncNow(); });
  ipcMain.handle('pos:product-tiers', (event, productId: unknown) => { assertTrustedSender(event); return database.listProductTiers(String(productId)); });
  ipcMain.handle('pos:save-product-tier', (event, input: unknown) => { assertTrustedSender(event); const result = database.saveProductTier(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:remove-product-tier', (event, id: unknown) => { assertTrustedSender(event); database.removeProductTier(String(id)); void cloud.syncNow(); });
  ipcMain.handle('pos:price-for', (event, productId, priceLevelId, quantity) => { assertTrustedSender(event); return database.priceFor(String(productId), typeof priceLevelId === 'string' ? priceLevelId : null, Number(quantity)); });
  ipcMain.handle('pos:products', (event, search?: unknown) => { assertTrustedSender(event); return database.listProducts(typeof search === 'string' ? search.slice(0, 120) : ''); });
  ipcMain.handle('pos:find-barcode', (event, code: unknown) => { assertTrustedSender(event); return database.findBarcode(typeof code === 'string' ? code.slice(0, 160) : ''); });
  ipcMain.handle('pos:save-product', (event, input: unknown) => { assertTrustedSender(event); const result = database.saveProduct(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:categories', (event) => { assertTrustedSender(event); return database.listCategories(); });
  ipcMain.handle('pos:save-category', (event, input: unknown) => { assertTrustedSender(event); const result = database.saveCategory(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:suppliers', (event) => { assertTrustedSender(event); return database.listSuppliers(); });
  ipcMain.handle('pos:save-supplier', (event, input: unknown) => { assertTrustedSender(event); const result = database.saveSupplier(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:stock-history', (event, productId: unknown) => { assertTrustedSender(event); return database.listStockHistory(String(productId)); });
  ipcMain.handle('pos:adjust-stock', (event, productId, quantityDelta, type, reason) => { assertTrustedSender(event); const result = database.adjustStock(String(productId), Number(quantityDelta), type as any, typeof reason === 'string' ? reason : undefined); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:customers', (event) => { assertTrustedSender(event); return database.listCustomers(); });
  ipcMain.handle('pos:save-customer', (event, input: unknown) => { assertTrustedSender(event); const result = database.saveCustomer(input as any); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:checkout', async (event, draft: unknown) => { assertTrustedSender(event); const receipt = database.checkout(draft as any); void cloud.syncNow(); if (getPrinterSettings(database).autoPrint) { try { await printReceipt(database, receipt); } catch (error) { console.error('Automatic receipt printing failed:', error); } } return receipt; });
  ipcMain.handle('pos:sales', (event, search?: unknown) => { assertTrustedSender(event); return database.listSales(typeof search === 'string' ? search.slice(0, 120) : ''); });
  ipcMain.handle('pos:receipt', (event, voucherId: unknown) => { assertTrustedSender(event); return database.receiptForSale(typeof voucherId === 'string' ? voucherId.slice(0, 120) : ''); });
  ipcMain.handle('pos:returnable-sale', (event, voucherId: unknown) => { assertTrustedSender(event); return database.returnableSale(typeof voucherId === 'string' ? voucherId.slice(0, 120) : ''); });
  ipcMain.handle('pos:return-sale', async (event, voucherId, lines, refundMethod, note) => { assertTrustedSender(event); const receipt = database.returnSale(String(voucherId), Array.isArray(lines) ? lines as any : [], String(refundMethod), typeof note === 'string' ? note : undefined); void cloud.syncNow(); if (getPrinterSettings(database).autoPrint) { try { await printReceipt(database, receipt); } catch (error) { console.error('Automatic return receipt printing failed:', error); } } return receipt; });
  ipcMain.handle('pos:debtors', (event) => { assertTrustedSender(event); return database.listDebtors(); });
  ipcMain.handle('pos:collect-debt', (event, customerId, amount, methodCode, note) => { assertTrustedSender(event); database.collectDebt(String(customerId), Number(amount), String(methodCode), typeof note === 'string' ? note : undefined); void cloud.syncNow(); });
  ipcMain.handle('pos:cash-session', (event) => { assertTrustedSender(event); return database.cashSession(); });
  ipcMain.handle('pos:open-cash-session', (event, openingFloat) => { assertTrustedSender(event); const result = database.openCashSession(Number(openingFloat)); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:close-cash-session', (event, countedCash) => { assertTrustedSender(event); const result = database.closeCashSession(Number(countedCash)); void cloud.syncNow(); return result; });
  ipcMain.handle('pos:expenses', (event) => { assertTrustedSender(event); return database.listExpenses(); });
  ipcMain.handle('pos:save-expense', (event, name, amount, note) => { assertTrustedSender(event); database.saveExpense(String(name), Number(amount), typeof note === 'string' ? note : undefined); void cloud.syncNow(); });
  ipcMain.handle('cloud:state', (event) => { assertTrustedSender(event); return cloud.state(); });
  ipcMain.handle('cloud:set-api-url', (event, url: unknown) => { assertTrustedSender(event); if (typeof url !== 'string') throw new Error('API URL must be text'); cloud.setApiUrl(url); });
  ipcMain.handle('cloud:register', async (event, input: unknown) => { assertTrustedSender(event); return cloud.register(input as any); });
  ipcMain.handle('cloud:login', async (event, input: unknown) => { assertTrustedSender(event); return cloud.login(input as any); });
  ipcMain.handle('cloud:sync-now', async (event) => { assertTrustedSender(event); return cloud.syncNow(); });
  ipcMain.handle('cloud:sign-out', (event) => { assertTrustedSender(event); return cloud.signOut(); });
  ipcMain.handle('printer:list', async (event) => { assertTrustedSender(event); return listPrinters(); });
  ipcMain.handle('printer:settings', (event) => { assertTrustedSender(event); return getPrinterSettings(database); });
  ipcMain.handle('printer:save-settings', (event, settings: unknown) => { assertTrustedSender(event); return savePrinterSettings(database, settings as any); });
  ipcMain.handle('printer:print-receipt', async (event, receipt: unknown) => { assertTrustedSender(event); return printReceipt(database, receipt as any); });
}

app.whenReady().then(() => {
  database = new PosDatabase(join(app.getPath('userData'), 'store-pos.sqlite3'));
  cloud = new CloudService(database);
  registerIpc();
  createWindow();
  if (cloud.state().status !== 'signed_out') void cloud.syncNow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
