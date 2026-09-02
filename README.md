# Store POS Desktop

Windows-first Electron desktop POS, with a macOS build target. It uses a local
SQLite database as its source of truth and synchronizes the same shop data to
the existing Store POS API.

## Included foundation

- Secure Electron boundary: sandboxed renderer, `contextIsolation`, no Node in
  React, and one validated IPC method per native operation.
- Native-process SQLite database with the same sync envelope and registry as
  the mobile app. Sales, sale items, stock movements, payments, products,
  customers, catalog settings, cash sessions, expenses, and activity records
  are all represented locally.
- Keyboard-wedge barcode scanning for supermarket-style USB/Bluetooth scanners.
  Scan a code followed by Enter and it is immediately added to the counter.
- Counter checkout, derived stock ledger, receipts, product setup, customer
  setup, daily summary, local outbox, API pairing/login, and push/pull sync.
- OS-driver receipt printing for installed USB, Bluetooth, and Wi-Fi printers,
  with 58 mm/80 mm paper settings and optional auto-print.

The detailed desktop screens for debt collection, expenses, returns, cash
closing, suppliers, categories, payment methods, price levels, activity, and
reports are the next feature tranche. Their tables and sync contract are ready
in this foundation.

## Run locally

```sh
cp .env.example .env
npm install
npm run dev
```

Set `VITE_API_URL` to the deployed API URL including `/api`. Pair the desktop
from **Settings**; the API registers it with `platform: desktop` and counts it
as a shop device.

SQLite uses Electron's bundled `node:sqlite` runtime, so this app does not need
native database compilation or Xcode/Visual Studio toolchains just to run.

## Build and package

```sh
npm run build
npm run package
```

The package command produces an NSIS installer for Windows and a `.dmg` for
macOS. Distribute signed installers in production: Windows code signing reduces
SmartScreen warnings, while macOS requires Developer ID signing and notarizing
for a smooth Gatekeeper experience.

## Printer behavior

Install and pair the printer at the operating-system level first. The app lists
the installed printers and sends an HTML receipt to the selected driver, which
works for normal USB, Bluetooth, and Wi-Fi thermal printers. Raw ESC/POS
features such as cutter and cash-drawer commands need testing against the
chosen printer hardware and are intentionally not assumed here.
