import { constants, openSync, closeSync, writeSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Run only as a child process with Electron's Node mode. No shop database access.
async function main(): Promise<void> {
  const path = process.argv[2];
  if (
    process.platform !== "darwin" ||
    !/^\/dev\/cu\.[^/\x00-\x1f]+$/.test(path ?? "")
  )
    throw new Error("Invalid serial device");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 2_000_000) throw new Error("Receipt is too large");
    chunks.push(Buffer.from(chunk));
  }
  // Raw mode prevents the terminal driver altering ESC/POS binary image bytes.
  execFileSync(
    "/bin/stty",
    [
      "-f",
      path,
      "115200",
      "raw",
      "-echo",
      "-ixon",
      "-ixoff",
      "clocal",
      "-crtscts",
    ],
    { timeout: 10000, stdio: ["ignore", "ignore", "pipe"] },
  );
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_NOCTTY | constants.O_NONBLOCK,
  );
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const data = Buffer.concat(chunks);
    for (let offset = 0; offset < data.length; ) {
      try {
        const written = writeSync(
          fd,
          data,
          offset,
          Math.min(256, data.length - offset),
        );
        if (written === 0) throw new Error("Printer stopped accepting data");
        offset += written;
      } catch (error: any) {
        if (!["EAGAIN", "EWOULDBLOCK", "EINTR"].includes(error.code))
          throw error;
      }
      // Pace raster data for the small receive buffers in portable printers.
      await pause(25);
    }
    await pause(500);
  } finally {
    closeSync(fd);
  }
}
void main().catch((error) => {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
