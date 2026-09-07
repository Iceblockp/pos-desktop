import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export const SERIAL_PREFIX = 'serial:';
export function serialPath(name: string): string {
  const path = name.slice(SERIAL_PREFIX.length);
  if (!name.startsWith(SERIAL_PREFIX) || !/^\/dev\/cu\.[^/\x00-\x1f]+$/.test(path)) {
    throw new Error('Invalid Bluetooth serial printer');
  }
  return path;
}

export async function serialPrinters(): Promise<string[]> {
  if (process.platform !== 'darwin') return [];
  return (await readdir('/dev')).filter(name => name.startsWith('cu.') &&
    !/Bluetooth-Incoming-Port|debug-console|wlan-debug|airpods|cozypods|headphones|headset/i.test(name)).sort().map(name => '/dev/' + name);
}

/** ESC/POS raster bands. Native bitmap channel order does not matter for grayscale. */
export function rasterCommands(bitmap: Buffer, width: number, height: number): Buffer {
  if (![384, 576].includes(width) || !Number.isInteger(height) || height < 1 || bitmap.length !== width * height * 4) {
    throw new Error('Invalid thermal receipt image');
  }
  const bytes = width / 8;
  const parts: Buffer[] = [Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0])];
  for (let y = 0; y < height; y += 128) {
    const rows = Math.min(128, height - y);
    const band = Buffer.alloc(bytes * rows);
    for (let row = 0; row < rows; row++) {
      for (let x = 0; x < width; x++) {
        const pixel = ((y + row) * width + x) * 4;
        const shade = (bitmap[pixel] + bitmap[pixel + 1] + bitmap[pixel + 2]) / 3;
        if (bitmap[pixel + 3] > 127 && shade < 180) band[row * bytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    parts.push(Buffer.from([0x1d, 0x76, 0x30, 0, bytes & 255, bytes >> 8, rows & 255, rows >> 8]), band);
  }
  // Portable printers commonly have a tear bar, so feed without requiring a cutter.
  parts.push(Buffer.from([0x1b, 0x64, 3]));
  return Buffer.concat(parts);
}

/** Isolate potentially stalled device opens/writes from Electron's main process. */
export async function sendSerial(name: string, data: Buffer): Promise<void> {
  const path = serialPath(name);
  if (process.platform !== 'darwin') throw new Error('Direct serial printing is currently available on macOS');
  if (!(await serialPrinters()).includes(path)) throw new Error('Printer is unavailable. Reconnect it in macOS Bluetooth settings and try again.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [join(__dirname, 'serial-worker.js'), path], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'ignore', 'pipe'],
    });
    let message = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 60000);
    child.stderr.on('data', chunk => { message = (message + chunk.toString()).slice(-2000); });
    child.stdin.on('error', () => {}); // Exit/error below reports broken pipes once.
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(signal ? 'Printer connection timed out. Check the paper before retrying; part of the receipt may have printed.' : 'Bluetooth print failed: ' + (message.trim() || 'Check that the printer is on and disconnected from the mobile app.')));
    });
    child.stdin.end(data);
  });
}
