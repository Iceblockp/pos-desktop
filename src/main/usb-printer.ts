import { execFile } from 'node:child_process';

export const USB_PREFIX = 'usb-raw:';
export interface UsbQueue { name: string; uri: string }

export function parseUsbQueues(output: string): UsbQueue[] {
  return output.split(/\r?\n/).flatMap(line => {
    const match = /^device for ([A-Za-z0-9_.-]+): (usb:\/\/\S+)$/.exec(line.trim());
    return match ? [{name:match[1],uri:match[2]}] : [];
  });
}

export function usbQueueName(value: string): string {
  const name = value.slice(USB_PREFIX.length);
  if (!value.startsWith(USB_PREFIX) || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,126}$/.test(name)) throw new Error('Invalid USB printer queue');
  return name;
}

export async function usbQueues(): Promise<UsbQueue[]> {
  if (process.platform !== 'darwin') return [];
  return new Promise((resolve,reject) => {
    execFile('/usr/bin/lpstat',['-v'],{timeout:10000,env:{...process.env,LC_ALL:'C'}},(error,stdout,stderr) => {
      if (error && !/No destinations added/i.test(stderr)) reject(new Error('Could not read USB printers: '+stderr.trim()));
      else resolve(parseUsbQueues(stdout));
    });
  });
}

/** CUPS handles USB delivery only. Raw mode explicitly skips the PostScript filter. */
export async function sendUsb(name: string, data: Buffer): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Direct USB queue printing is currently available on macOS');
  const queue = usbQueueName(name);
  if (!(await usbQueues()).some(item => item.name === queue)) throw new Error('USB printer queue is unavailable. Reconnect the cable and find printers again.');
  await new Promise<void>((resolve,reject) => {
    const child = execFile('/usr/bin/lp',['-d',queue,'-o','raw','-t','Store POS receipt'],{timeout:15000},(error,_stdout,stderr) => {
      if (error) reject(new Error('USB print submission failed: '+(stderr.trim() || error.message)));
      else resolve(); // Accepted by the spooler; paper delivery is not implied.
    });
    child.stdin?.on('error',()=>{});
    child.stdin?.end(data);
  });
}
