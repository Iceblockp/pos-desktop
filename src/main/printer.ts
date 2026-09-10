import { USB_PREFIX, usbQueueName, usbQueues, sendUsb } from './usb-printer';
import { SERIAL_PREFIX, serialPath, serialPrinters, rasterCommands, sendSerial } from './thermal';
import { BrowserWindow, webContents } from 'electron';
import type { PrinterInfo, PrinterSettings, Receipt } from '../shared/models';
import { PosDatabase } from './database';
import { formatCurrency, parseCurrency } from '../shared/currency';

export async function listPrinters(): Promise<PrinterInfo[]> {
  const contents = webContents.getFocusedWebContents() ?? BrowserWindow.getAllWindows()[0]?.webContents;
  const installed = (await contents?.getPrintersAsync() ?? []).map(printer => ({name:printer.name, displayName:printer.displayName, isDefault:false, status:0}));
  const serial = (await serialPrinters()).map(path => ({name:SERIAL_PREFIX + path, displayName:path.slice('/dev/cu.'.length) + ' — Bluetooth / serial', isDefault:false, status:0}));
  const usb = await usbQueues();
  const direct = usb.map(queue => ({name:USB_PREFIX+queue.name,displayName:queue.name.replaceAll('_',' ')+' — USB thermal (ESC/POS)',isDefault:false,status:0}));
  // Hide the known incompatible Xprinter driver entry; keep other OS printers.
  return [...direct, ...installed.filter(printer => !usb.some(queue => queue.name === printer.name && /xprinter/i.test(queue.uri))), ...serial];
}

export function getPrinterSettings(db: PosDatabase): PrinterSettings {
  return { deviceName: db.getState('printer.deviceName'), paperWidth: Number(db.getState('printer.paperWidth') ?? '80') as 58 | 80, autoPrint: db.getState('printer.autoPrint') === '1' };
}

export function savePrinterSettings(db: PosDatabase, settings: PrinterSettings): PrinterSettings {
  if (settings.paperWidth !== 58 && settings.paperWidth !== 80) throw new Error('Paper width must be 58mm or 80mm');
  if (settings.deviceName?.startsWith(SERIAL_PREFIX)) serialPath(settings.deviceName);
  if (settings.deviceName?.startsWith(USB_PREFIX)) usbQueueName(settings.deviceName);
  db.setState('printer.deviceName', settings.deviceName);
  db.setState('printer.paperWidth', String(settings.paperWidth));
  db.setState('printer.autoPrint', settings.autoPrint ? '1' : '0');
  return settings;
}

/** Serial jobs use raster ESC/POS; installed printers keep the OS driver route. */
let printQueue: Promise<void> = Promise.resolve();
export function printReceipt(db: PosDatabase, receipt: Receipt): Promise<void> {
  const job = printQueue.then(() => printReceiptNow(db, receipt));
  printQueue = job.catch(() => {});
  return job;
}

async function printReceiptNow(db: PosDatabase, receipt: Receipt): Promise<void> {
  const settings = getPrinterSettings(db);
  if (!settings.deviceName) throw new Error('Install or pair the printer in Windows or macOS first, then choose it in Settings.');
  let device = settings.deviceName;
  // Existing Xprinter selections must also bypass the Generic PostScript driver.
  if (!device.startsWith(SERIAL_PREFIX) && !device.startsWith(USB_PREFIX)) {
    const queue = (await usbQueues()).find(item => item.name === device && /xprinter/i.test(item.uri));
    if (queue) device = USB_PREFIX + queue.name;
  }
  const direct = device.startsWith(SERIAL_PREFIX) || device.startsWith(USB_PREFIX);
  const dots = settings.paperWidth === 58 ? 384 : 576;
  const window = new BrowserWindow({ show: false, width:dots, height:600, useContentSize:true, webPreferences: { offscreen:direct, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling:false } });
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml(db, receipt, settings.paperWidth, direct))}`);
    if (direct) {
      const height = await window.webContents.executeJavaScript('document.fonts.ready.then(() => Math.ceil(document.body.getBoundingClientRect().height))') as number;
      if (!Number.isFinite(height) || height < 1 || height > 12000) throw new Error('Receipt is too long for thermal printing');
      window.setContentSize(dots, height);
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const image = await window.webContents.capturePage({x:0,y:0,width:dots,height}, {stayHidden:true,stayAwake:true});
      if (image.isEmpty()) throw new Error('Could not render the receipt');
      const bitmap = image.resize({width:dots,height}).toBitmap({scaleFactor:1});
      const commands = rasterCommands(bitmap, dots, height);
      if (device.startsWith(USB_PREFIX)) await sendUsb(device, commands);
      else await sendSerial(device, commands);
      return;
    }
    await new Promise<void>((resolve, reject) => window.webContents.print({ silent: true, deviceName: settings.deviceName!, printBackground: true, pageSize: { width: settings.paperWidth * 1000, height: 297000 }, margins: { marginType: 'none' } }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason || 'The printer rejected the receipt'))));
  } finally { window.destroy(); }
}

/** Sends a representative receipt to the selected OS-managed thermal printer. */
export async function printTestReceipt(db: PosDatabase): Promise<void> {
  const soldAt = new Date().toISOString();
  await printReceipt(db, {
    voucherId: 'TEST-0001',
    shopName: db.getShopSetting('shop.name') || 'Store POS',
    shopPhone: db.getShopSetting('shop.phone') || null,
    soldAt,
    paymentMethod: 'Cash',
    subtotal: 12250,
    discount: 500,
    total: 11750,
    amountTendered: 20000,
    change: 8250,
    lines: [
      { productId: 'test-water', name: 'ရေသန့် ၁ လီတာ', unit: 'ဘူး', quantity: 2, unitPrice: 500, unitCost: 0, discount: 0 },
      { productId: 'test-rice', name: 'ဆန် (ပေါ်ဆန်းမွှေး)', unit: 'ပိဿာ', quantity: 2.5, unitPrice: 4500, unitCost: 0, discount: 500 },
    ],
  });
}

function receiptHtml(db: PosDatabase, receipt: Receipt, width: 58 | 80, raster = false): string {
  const money = (value: number) => formatCurrency(value, parseCurrency(db.getShopSetting('shop.currency')));
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]!);
  const rows = receipt.lines.map((line) => `<tr><td>${esc(line.name)}<br><small>${line.quantity} ${esc(line.unit)} × ${money(line.unitPrice)}</small></td><td>${money(line.subtotal ?? (line.quantity * line.unitPrice - line.discount))}</td></tr>`).join('');
  const payments = receipt.payments?.map(p => '<p>'+esc(p.methodName || p.methodCode)+': '+money(p.amount)+'</p>').join('') ?? '<p>'+esc(receipt.paymentMethod)+'</p>';
  const balance = receipt.outstanding ? '<p>Balance: '+money(receipt.outstanding)+'</p>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}mm auto;margin:3mm}body{font-family:Arial,'Myanmar Text',sans-serif;font-size:11px;width:${width - 6}mm}h1,p{text-align:center;margin:3px 0}table{width:100%;border-collapse:collapse}td:last-child{text-align:right}tfoot td{border-top:1px dashed #000;padding-top:4px}.total{font-size:14px;font-weight:bold}small{color:#444}${raster ? `html{margin:0;padding:0;background:white}body{box-sizing:border-box;margin:0;padding:12px;width:${width === 58 ? 384 : 576}px;font-family:'Myanmar Sangam MN','Myanmar MN','Myanmar Text',Arial,sans-serif;font-size:22px;color:#000;background:#fff;overflow-wrap:anywhere}h1{font-size:30px}.total{font-size:28px}small{color:#000}table{table-layout:fixed}td{vertical-align:top}td:last-child{width:145px;white-space:nowrap}` : ''}</style></head><body><h1>${esc(receipt.shopName)}</h1>${db.getShopSetting('shop.address') ? `<p>${esc(db.getShopSetting('shop.address'))}</p>` : ''}${receipt.shopPhone ? `<p>${esc(receipt.shopPhone)}</p>` : ''}<p>${esc(receipt.voucherId)}<br>${esc(new Date(receipt.soldAt).toLocaleString())}</p><table><tbody>${rows}</tbody><tfoot><tr><td>Subtotal</td><td>${money(receipt.subtotal)}</td></tr><tr><td>Discount</td><td>${money(receipt.discount)}</td></tr><tr class="total"><td>Total</td><td>${money(receipt.total)}</td></tr>${receipt.change != null ? `<tr><td>Change</td><td>${money(receipt.change)}</td></tr>` : ''}</tfoot></table>${payments}${balance}<p>${esc(db.getShopSetting('shop.receiptFooter') || 'Thank you')}</p></body></html>`;
}
