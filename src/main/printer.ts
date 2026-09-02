import { BrowserWindow, webContents } from 'electron';
import type { PrinterInfo, PrinterSettings, Receipt } from '../shared/models';
import { PosDatabase } from './database';

export async function listPrinters(): Promise<PrinterInfo[]> {
  return (await webContents.getFocusedWebContents()?.getPrintersAsync() ?? []).map((printer) => ({ name: printer.name, displayName: printer.displayName, isDefault: false, status: 0 }));
}

export function getPrinterSettings(db: PosDatabase): PrinterSettings {
  return { deviceName: db.getState('printer.deviceName'), paperWidth: Number(db.getState('printer.paperWidth') ?? '80') as 58 | 80, autoPrint: db.getState('printer.autoPrint') === '1' };
}

export function savePrinterSettings(db: PosDatabase, settings: PrinterSettings): PrinterSettings {
  if (settings.paperWidth !== 58 && settings.paperWidth !== 80) throw new Error('Paper width must be 58mm or 80mm');
  db.setState('printer.deviceName', settings.deviceName);
  db.setState('printer.paperWidth', String(settings.paperWidth));
  db.setState('printer.autoPrint', settings.autoPrint ? '1' : '0');
  return settings;
}

/** Prints through the OS driver, covering USB, Bluetooth, and Wi-Fi printers. */
export async function printReceipt(db: PosDatabase, receipt: Receipt): Promise<void> {
  const settings = getPrinterSettings(db);
  if (!settings.deviceName) throw new Error('Choose a receipt printer in Settings first');
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml(receipt, settings.paperWidth))}`);
    await new Promise<void>((resolve, reject) => window.webContents.print({ silent: true, deviceName: settings.deviceName!, printBackground: true, pageSize: { width: settings.paperWidth * 1000, height: 297000 }, margins: { marginType: 'none' } }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason || 'The printer rejected the receipt'))));
  } finally { window.destroy(); }
}

function receiptHtml(receipt: Receipt, width: 58 | 80): string {
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]!);
  const rows = receipt.lines.map((line) => `<tr><td>${esc(line.name)}<br><small>${line.quantity} ${esc(line.unit)} × ${line.unitPrice.toFixed(2)}</small></td><td>${(line.quantity * line.unitPrice - line.discount).toFixed(2)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}mm auto;margin:3mm}body{font-family:Arial,'Myanmar Text',sans-serif;font-size:11px;width:${width - 6}mm}h1,p{text-align:center;margin:3px 0}table{width:100%;border-collapse:collapse}td:last-child{text-align:right}tfoot td{border-top:1px dashed #000;padding-top:4px}.total{font-size:14px;font-weight:bold}small{color:#444}</style></head><body><h1>${esc(receipt.shopName)}</h1>${receipt.shopPhone ? `<p>${esc(receipt.shopPhone)}</p>` : ''}<p>${esc(receipt.voucherId)}<br>${esc(new Date(receipt.soldAt).toLocaleString())}</p><table><tbody>${rows}</tbody><tfoot><tr><td>Subtotal</td><td>${receipt.subtotal.toFixed(2)}</td></tr><tr><td>Discount</td><td>${receipt.discount.toFixed(2)}</td></tr><tr class="total"><td>Total</td><td>${receipt.total.toFixed(2)}</td></tr>${receipt.change != null ? `<tr><td>Change</td><td>${receipt.change.toFixed(2)}</td></tr>` : ''}</tfoot></table><p>${esc(receipt.paymentMethod)}</p><p>Thank you</p></body></html>`;
}
