import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudPanel } from "./CloudPanel";
import { FeatureSettings } from "./FeatureSettings";
import { PaymentSlips } from "./PaymentSlips";
import { NotificationSettings } from "./NotificationSettings";
import { useCapabilities } from "../useCapabilities";

export function Settings({ notify }: { notify: (s: string) => void }) {
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<
    | "store"
    | "printer"
    | "cloud"
    | "payments"
    | "pricing"
    | "subscription"
    | "diagnostics"
  >("store");

  const tabs: {
    key: typeof tab;
    label: string;
    icon: string;
  }[] = [
    { key: "store", label: "Store & Receipt", icon: "🏪" },
    { key: "printer", label: "Printer & Hardware", icon: "🖨️" },
    { key: "cloud", label: "Cloud & Sync", icon: "☁️" },
    { key: "payments", label: "Payment Methods", icon: "💳" },
    { key: "pricing", label: "Price Levels & Features", icon: "🏷️" },
    { key: "subscription", label: "Plan & Billing", icon: "💎" },
    { key: "diagnostics", label: "Diagnostics", icon: "🩺" },
  ];

  if (!capabilities.owner) {
    return (
      <section className="h-full space-y-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-800">⚙️ POS Station Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Cashier station hardware, receipt printer setup, and cloud connection status
          </p>
        </header>
        <div className="space-y-6">
          <CloudPanel notify={notify} />
          <PrinterTab notify={notify} />
          <DiagnosticsTab notify={notify} />
        </div>
      </section>
    );
  }

  return (
    <section className="h-full space-y-5 pb-12">
      {/* Top Header */}
      <header className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">⚙️ Settings & Hardware</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure store branding, receipt printers, cloud synchronization, payment channels, and diagnostic health
          </p>
        </div>
      </header>

      {/* Modern Tab Bar */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-200/90 shadow-inner">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {tab === "store" && <StoreProfileTab notify={notify} />}
        {tab === "printer" && <PrinterTab notify={notify} />}
        {tab === "cloud" && <CloudPanel notify={notify} />}
        {tab === "payments" && <PaymentTab notify={notify} />}
        {tab === "pricing" && <PricingAndFeaturesTab notify={notify} />}
        {tab === "subscription" && <SubscriptionTab notify={notify} />}
        {tab === "diagnostics" && <DiagnosticsTab notify={notify} />}
      </div>
    </section>
  );
}

/* ==========================================================================
   1. STORE & RECEIPT BRANDING TAB
   ========================================================================== */
function StoreProfileTab({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => window.storePos.pos.shopProfile(),
  });
  const [value, setValue] = useState({
    name: "",
    address: "",
    phone: "",
    receiptFooter: "",
  });

  useEffect(() => {
    if (profile.data) setValue(profile.data);
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => window.storePos.pos.saveShopProfile(value),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["shop-profile"] });
      notify("Shop profile and receipt settings saved");
    },
    onError: (e: Error) => notify(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Store Profile Form */}
      <div className="lg:col-span-7 space-y-6">
        <form
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-800 text-base">Store Profile & Details</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                These details are printed at the top and bottom of thermal customer receipts
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  Shop / Business Name
                </span>
              </label>
              <input
                className="input input-bordered input-sm"
                required
                placeholder="e.g. ABC Minimart"
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  Phone Number(s)
                </span>
              </label>
              <input
                className="input input-bordered input-sm"
                placeholder="e.g. 09-123456789, 09-987654321"
                value={value.phone}
                onChange={(e) => setValue({ ...value, phone: e.target.value })}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  Shop Physical Address
                </span>
              </label>
              <textarea
                className="textarea textarea-bordered textarea-sm h-20"
                placeholder="e.g. No. 12, Bogyoke Road, Bahan Township, Yangon"
                value={value.address}
                onChange={(e) => setValue({ ...value, address: e.target.value })}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  Receipt Footer Message
                </span>
              </label>
              <input
                className="input input-bordered input-sm"
                placeholder="e.g. Thank you for shopping with us! No returns after 3 days."
                value={value.receiptFooter}
                onChange={(e) =>
                  setValue({ ...value, receiptFooter: e.target.value })
                }
              />
              <label className="label py-0.5">
                <span className="label-text-alt text-slate-400">
                  Appears at the very bottom of printed receipts
                </span>
              </label>
            </div>
          </div>
        </form>

        <NotificationSettings notify={notify} />
      </div>

      {/* Right: Live Thermal Receipt Preview */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Live Receipt Preview
            </h4>
            <span className="badge badge-sm badge-neutral font-mono text-[10px]">
              Thermal 80mm
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Changes made in the form appear live on this thermal slip mockup:
          </p>

          {/* Thermal Receipt Paper Mockup */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-dashed border-slate-300 font-mono text-xs text-slate-700 max-w-sm mx-auto space-y-3">
            {/* Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                {value.name || "YOUR SHOP NAME"}
              </h2>
              {value.phone && <p className="text-[11px] text-slate-600">Tel: {value.phone}</p>}
              {value.address && (
                <p className="text-[11px] text-slate-500 leading-tight">
                  {value.address}
                </p>
              )}
            </div>

            {/* Receipt Meta */}
            <div className="text-[11px] text-slate-500 flex justify-between py-1 border-b border-dashed border-slate-200">
              <span>Receipt: #POS-10024</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>

            {/* Sample Items */}
            <div className="space-y-1.5 py-1 text-[11px]">
              <div className="flex justify-between">
                <span>1x Sample Product A</span>
                <span className="font-semibold">3,500</span>
              </div>
              <div className="flex justify-between">
                <span>2x Refreshment Drink</span>
                <span className="font-semibold">2,400</span>
              </div>
            </div>

            {/* Totals */}
            <div className="pt-2 border-t border-dashed border-slate-300 space-y-1 text-right">
              <div className="flex justify-between font-bold text-sm text-slate-900">
                <span>TOTAL</span>
                <span>5,900 MMK</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Cash Tendered</span>
                <span>10,000</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
                <span>Change Due</span>
                <span>4,100</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-500 italic">
              <p>{value.receiptFooter || "Thank you! Please come again."}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   2. PRINTER & HARDWARE TAB
   ========================================================================== */
function PrinterTab({ notify }: { notify: (s: string) => void }) {
  const [printers, setPrinters] = useState<
    { name: string; displayName: string }[]
  >([]);
  const [status, setStatus] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [testing, setTesting] = useState(false);
  const client = useQueryClient();
  const printer = useQuery({
    queryKey: ["printer"],
    queryFn: () => window.storePos.printer.settings(),
  });

  const save = async (next: NonNullable<typeof printer.data>) => {
    await window.storePos.printer.saveSettings(next);
    await client.invalidateQueries({ queryKey: ["printer"] });
  };

  const find = async () => {
    setFinding(true);
    setStatus(null);
    try {
      const found = await window.storePos.printer.list();
      setPrinters(found);
      setStatus(
        found.length
          ? `Found ${found.length} printer${found.length === 1 ? "" : "s"}. Select your receipt printer from the dropdown.`
          : "No printers detected. Verify USB cable or Bluetooth connection, then try again.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not scan for printers.",
      );
    } finally {
      setFinding(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await window.storePos.printer.test();
      setStatus(
        `✓ Test receipt sent successfully to ${printer.data?.deviceName}. Check paper cut and Burmese font.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Test print failed.";
      setStatus(`✕ Error: ${message}`);
      notify(message);
    } finally {
      setTesting(false);
    }
  };

  const activeDevice = printer.data?.deviceName;
  const isRawEscPos = activeDevice?.startsWith("usb-raw:") || activeDevice?.startsWith("serial:");

  return (
    <div className="space-y-6">
      {/* Active Printer Status Banner */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
              activeDevice ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            🖨️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">
                {activeDevice ? activeDevice : "No Receipt Printer Configured"}
              </h3>
              {activeDevice ? (
                <span className="badge badge-success text-white badge-xs font-semibold">
                  Active
                </span>
              ) : (
                <span className="badge badge-neutral badge-xs">Not Set</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeDevice
                ? `Paper width: ${printer.data?.paperWidth ?? 80}mm · Mode: ${isRawEscPos ? "Direct ESC/POS Raw" : "System Spooler Driver"}`
                : "Select a printer below to automatically print customer receipts upon checkout"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-outline"
            disabled={finding}
            onClick={() => void find()}
          >
            {finding ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "🔍 Scan for Printers"
            )}
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={!activeDevice || testing}
            onClick={() => void test()}
          >
            {testing ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "📄 Print Test Receipt"
            )}
          </button>
        </div>
      </div>

      {status && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
            status.startsWith("✓")
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : status.startsWith("✕")
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          <span>{status}</span>
        </div>
      )}

      {/* Printer Configuration Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
          <h4 className="font-semibold text-slate-800 text-sm border-b pb-3">
            Receipt Printer Preferences
          </h4>

          {/* Printer Selector */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-bold text-slate-700">
                Selected Device
              </span>
            </label>
            <select
              value={printer.data?.deviceName ?? ""}
              disabled={!printer.data}
              onChange={(event) => {
                if (!printer.data) return;
                const nextVal = event.target.value || null;
                const isRaw = nextVal?.startsWith("serial:") || nextVal?.startsWith("usb-raw:");
                void save({
                  ...printer.data,
                  deviceName: nextVal,
                  paperWidth: isRaw ? 58 : printer.data.paperWidth,
                }).then(() =>
                  setStatus(
                    nextVal
                      ? "Printer selected and saved. Click 'Print Test Receipt' to verify."
                      : "Printer selection cleared.",
                  ),
                );
              }}
              className="select select-bordered select-sm w-full"
            >
              <option value="">-- Choose a Printer --</option>
              {printer.data?.deviceName &&
                !printers.some((item) => item.name === printer.data.deviceName) && (
                  <option value={printer.data.deviceName}>
                    {printer.data.deviceName} (Currently Saved)
                  </option>
                )}
              {printers.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Paper Width Visual Buttons */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-bold text-slate-700">
                Receipt Paper Width
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (printer.data) void save({ ...printer.data, paperWidth: 58 });
                }}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                  printer.data?.paperWidth === 58
                    ? "border-primary bg-primary/5 text-primary font-bold shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">58 mm</p>
                  <p className="text-[11px] opacity-75 font-normal">Narrow mobile / compact thermal roll</p>
                </div>
                {printer.data?.paperWidth === 58 && <span>✓</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (printer.data) void save({ ...printer.data, paperWidth: 80 });
                }}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                  printer.data?.paperWidth === 80
                    ? "border-primary bg-primary/5 text-primary font-bold shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">80 mm</p>
                  <p className="text-[11px] opacity-75 font-normal">Standard desktop restaurant/POS roll</p>
                </div>
                {printer.data?.paperWidth === 80 && <span>✓</span>}
              </button>
            </div>
          </div>

          {/* Auto-Print Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Auto-print Receipt After Sale
              </p>
              <p className="text-xs text-slate-500">
                Automatically fire print job immediately when cashier tenders a sale
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={printer.data?.autoPrint ?? false}
              disabled={!printer.data}
              onChange={(event) => {
                if (printer.data)
                  void save({ ...printer.data, autoPrint: event.target.checked });
              }}
            />
          </div>
        </div>

        {/* Quick Connection Guide */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4 text-xs text-slate-600">
          <h4 className="font-semibold text-slate-800 text-sm border-b pb-3">
            Thermal Hardware Setup Guide
          </h4>
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p className="font-bold text-slate-800">USB & Wi-Fi Printers</p>
                <p className="text-slate-500 mt-0.5">
                  Plug in the USB cable and install the manufacturer driver (e.g. Xprinter, Epson, Rongta). On macOS, choose <em>USB thermal (ESC/POS)</em> to bypass PostScript rasterization.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p className="font-bold text-slate-800">Bluetooth Mobile Printers</p>
                <p className="text-slate-500 mt-0.5">
                  Pair your Bluetooth printer in Windows / macOS Bluetooth settings first. Once paired, click "Scan for Printers" to detect the serial port.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <p className="font-bold text-slate-800">Burmese Font Support</p>
                <p className="text-slate-500 mt-0.5">
                  The test print verifies Unicode Myanmar text rendering and currency formatting.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. PAYMENT METHODS TAB
   ========================================================================== */
function PaymentTab({ notify }: { notify: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const client = useQueryClient();
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => window.storePos.pos.paymentMethods(),
  });

  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["payment-methods"] });

  const save = useMutation({
    mutationFn: () => window.storePos.pos.savePaymentMethod({ name }),
    onSuccess: () => {
      setName("");
      setOpen(false);
      refresh();
      notify("Payment method saved");
    },
    onError: (e: Error) => notify(e.message),
  });

  const toggle = useMutation({
    mutationFn: (method: {
      id: string;
      name: string;
      code: string;
      sortOrder: number;
      isActive: boolean;
    }) =>
      window.storePos.pos.savePaymentMethod({
        ...method,
        isActive: !method.isActive,
      }),
    onSuccess: () => {
      refresh();
      notify("Payment method updated");
    },
    onError: (e: Error) => notify(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removePaymentMethod(id),
    onSuccess: (result) => {
      refresh();
      notify(
        result === "deactivated"
          ? "Method has past sales records, so it was hidden instead of deleted."
          : "Payment method removed.",
      );
    },
    onError: (e: Error) => notify(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Checkout Payment Methods</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage tender options available on the counter checkout register (Cash, KBZPay, WavePay, Cards)
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
          + Add Payment Method
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {methods.data?.map((method) => (
          <div
            key={method.id}
            className="p-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-base">
                💳
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-800">
                    {method.name}
                  </span>
                  <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {method.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {method.isActive ? (
                    <span className="text-emerald-600 font-medium">● Visible at checkout</span>
                  ) : (
                    <span className="text-slate-400">○ Hidden at checkout</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn btn-xs btn-outline"
                onClick={() => toggle.mutate(method)}
                disabled={toggle.isPending}
              >
                {method.isActive ? "Hide from Register" : "Show on Register"}
              </button>
              <button
                className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${method.name}? If used in past sales, it will be safely disabled without breaking reports.`,
                    )
                  )
                    remove.mutate(method.id);
                }}
                disabled={remove.isPending}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-base">Add New Payment Method</h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">
                    Payment Method Name
                  </span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Wave Pay, AYA Pay, Credit Card"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-bordered input-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save Method"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   4. PRICE LEVELS & FEATURES TAB
   ========================================================================== */
function PricingAndFeaturesTab({ notify }: { notify: (s: string) => void }) {
  const capabilities = useCapabilities();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const levels = useQuery({
    queryKey: ["price-levels"],
    queryFn: () => window.storePos.pos.priceLevels(),
  });

  useEffect(() => {
    if (levels.data) {
      setDrafts(Object.fromEntries(levels.data.map((l) => [l.id, l.name])));
    }
  }, [levels.data]);

  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["price-levels"] });

  const save = useMutation({
    mutationFn: (input: { id?: string; name: string; sortOrder?: number }) =>
      window.storePos.pos.savePriceLevel(input),
    onSuccess: () => {
      setName("");
      setOpen(false);
      refresh();
      notify("Price level saved");
    },
    onError: (error: Error) => notify(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removePriceLevel(id),
    onSuccess: () => {
      refresh();
      notify("Price level removed");
    },
    onError: (error: Error) => notify(error.message),
  });

  const rename = (level: { id: string; name: string; sortOrder: number }) => {
    const next = (drafts[level.id] ?? "").trim();
    if (next && next !== level.name) {
      save.mutate({ id: level.id, name: next, sortOrder: level.sortOrder });
    }
  };

  const extras = levels.data?.filter((l) => !l.isDefault) ?? [];

  const move = (index: number, delta: number) => {
    const other = index + delta;
    if (other < 0 || other >= extras.length) return;
    const current = extras[index];
    const target = extras[other];
    save.mutate({ id: current.id, name: current.name, sortOrder: target.sortOrder });
    save.mutate({ id: target.id, name: target.name, sortOrder: current.sortOrder });
  };

  return (
    <div className="space-y-6">
      {/* Feature Settings Toggles */}
      <FeatureSettings notify={notify} />

      {/* Price Levels Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-800 text-base">Pricing Tiers & Levels</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Retail is the default price. Add Wholesale, VIP, or Bulk tiers to set custom item prices
            </p>
          </div>
          {capabilities.effectivePlan !== "free" && (
            <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
              + Add Price Level
            </button>
          )}
        </div>

        {capabilities.effectivePlan === "free" ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Multi-tier pricing requires an active <strong>Offline Plus</strong> or <strong>Cloud Pro</strong> subscription.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {levels.data?.map((level) => {
              const index = extras.findIndex((item) => item.id === level.id);
              return (
                <div
                  key={level.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex-1 max-w-sm">
                    {level.isDefault ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">
                            {level.name}
                          </span>
                          <span className="badge badge-neutral badge-xs font-semibold">
                            Default Base Price
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Standard retail selling price configured on products
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          aria-label={`${level.name} name`}
                          value={drafts[level.id] ?? ""}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [level.id]: e.target.value })
                          }
                          onBlur={() => rename(level)}
                          className="input input-bordered input-xs font-medium w-full max-w-xs"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {level.productCount
                            ? `${level.productCount} item price${level.productCount === 1 ? "" : "s"} set`
                            : "No products configured with this price yet"}
                        </p>
                      </div>
                    )}
                  </div>

                  {!level.isDefault && (
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-xs btn-ghost btn-square"
                        disabled={index === 0 || save.isPending}
                        onClick={() => move(index, -1)}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-xs btn-ghost btn-square"
                        disabled={index === extras.length - 1 || save.isPending}
                        onClick={() => move(index, 1)}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${level.name}? Associated prices on products will also be removed.`,
                            )
                          )
                            remove.mutate(level.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ name, sortOrder: levels.data?.length ?? 0 });
            }}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-base">Add Price Level</h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">Level Name</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Wholesale, VIP Member, Bulk"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-bordered input-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save Level"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   5. PLAN & BILLING TAB
   ========================================================================== */
function SubscriptionTab({ notify }: { notify: (s: string) => void }) {
  const [code, setCode] = useState("");
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
  });
  const status = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => window.storePos.cloud.billingStatus(),
    enabled: Boolean(cloud.data?.deviceId),
  });
  const client = useQueryClient();

  const redeem = useMutation({
    mutationFn: () => window.storePos.cloud.redeemCode(code.trim()),
    onSuccess: (result) => {
      setCode("");
      void client.invalidateQueries();
      notify(
        result.daysAdded
          ? `✓ ${result.daysAdded} days added to your plan!`
          : "Plan updated successfully",
      );
    },
    onError: (error: Error) => notify(error.message),
  });

  const until = status.data?.premiumUntil ? new Date(status.data.premiumUntil) : null;
  const days = until ? Math.max(0, Math.floor((until.getTime() - Date.now()) / 86400000)) : 0;
  const isPremium = until && until.getTime() > Date.now();
  const isExpiringSoon = Boolean(isPremium && days <= 7);

  const tierName =
    status.data?.tier === "cloud_pro"
      ? "Cloud Pro"
      : status.data?.tier === "offline_plus"
        ? "Offline Plus"
        : "Free Offline";

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          isPremium
            ? "bg-gradient-to-br from-emerald-50 to-teal-50/40 border-emerald-300"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
          <div>
            <span
              className={`badge font-semibold mb-2 ${
                isPremium ? "badge-success text-white" : "badge-neutral"
              }`}
            >
              {tierName}
            </span>
            <h3 className="text-2xl font-black text-slate-800">
              {isPremium ? "Active Subscription" : "Free Offline Edition"}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isPremium
                ? "Full access to offline multi-register features and cloud syncing capabilities"
                : "Basic offline checkout and receipt printing enabled. Upgrade to unlock customer debt, expenses, and cloud sync."}
            </p>
          </div>

          <button
            className="btn btn-sm btn-ghost"
            onClick={() =>
              void client.invalidateQueries({ queryKey: ["billing-status"] })
            }
          >
            ↻ Refresh Status
          </button>
        </div>

        {isPremium && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-emerald-200/60">
            <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Days Remaining
              </span>
              <p
                className={`text-2xl font-black mt-1 ${
                  isExpiringSoon ? "text-amber-600" : "text-emerald-700"
                }`}
              >
                {days} days
              </p>
            </div>
            <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Valid Until
              </span>
              <p className="text-base font-bold text-slate-800 mt-1">
                {until?.toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Feature Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-semibold text-slate-800 text-sm">Plan Features Comparison</h4>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {[
            ["Offline POS & Thermal Printing", "All Plans", true],
            ["Customer Debt & Store Credit Ledger", "Offline Plus / Cloud Pro", isPremium],
            ["Petty Cash Payouts & Day-End Shifts", "Offline Plus / Cloud Pro", isPremium],
            ["Multi-Tier Pricing (Wholesale / VIP)", "Offline Plus / Cloud Pro", isPremium],
            ["Automatic Cloud Backup & Multi-Device Sync", "Cloud Pro", status.data?.tier === "cloud_pro"],
          ].map(([feature, tierReq, available]) => (
            <div key={String(feature)} className="p-3.5 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{feature}</p>
                <p className="text-[11px] text-slate-400">Requires: {tierReq}</p>
              </div>
              <span
                className={`badge badge-sm font-semibold ${
                  available ? "badge-success text-white" : "badge-neutral"
                }`}
              >
                {available ? "Active" : "Locked"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Redeem Voucher / Code */}
      <form
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          redeem.mutate();
        }}
      >
        <div>
          <h4 className="font-semibold text-slate-800 text-sm">Redeem Prepaid Activation Code</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter the 14-character prepaid code to instantly activate or extend your plan
          </p>
        </div>

        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            required
            value={code}
            placeholder="XXXX-XXXX-XXXC"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={14}
            className="input input-bordered input-sm font-mono tracking-wider font-bold flex-1"
          />
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={redeem.isPending || code.trim().length < 12}
          >
            {redeem.isPending ? "Redeeming…" : "Redeem Code"}
          </button>
        </div>
      </form>

      {/* Manual Payment Slips */}
      <PaymentSlips notify={notify} />
    </div>
  );
}

/* ==========================================================================
   6. DIAGNOSTICS & SYSTEM TAB
   ========================================================================== */
function DiagnosticsTab({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const version = useQuery({
    queryKey: ["app-version"],
    queryFn: () => window.storePos.app.version(),
  });
  const crashes = useQuery({
    queryKey: ["crashes"],
    queryFn: () => window.storePos.pos.crashes(),
  });
  const stock = useQuery({
    queryKey: ["stock-discrepancies"],
    queryFn: () => window.storePos.pos.stockDiscrepancies(),
  });
  const cloudState = useQuery({
    queryKey: ["cloud-state"],
    queryFn: () => window.storePos.cloud.state(),
  });

  const clear = useMutation({
    mutationFn: () => window.storePos.pos.clearCrashes(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["crashes"] });
      notify("Crash logs cleared");
    },
  });

  const copy = async () => {
    const text = [
      `Store POS Desktop v${version.data ?? "?"}`,
      `Sync Status: ${cloudState.data?.status ?? "unknown"}`,
      `Pending Changes: ${cloudState.data?.pending ?? 0}`,
      `Last Synced: ${cloudState.data?.lastSyncedAt ? new Date(cloudState.data.lastSyncedAt).toLocaleString() : "Never"}`,
      "",
      "=== CRASH LOGS ===",
      "",
      ...(crashes.data ?? []).map(
        (item) =>
          `${new Date(item.occurredAt).toLocaleString()}\nSource: ${item.source}\nVersion: ${item.appVersion ?? "unknown"}\nMessage: ${item.message}`,
      ),
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      notify("Diagnostics copied to clipboard");
    } catch {
      notify("Unable to copy diagnostics");
    }
  };

  return (
    <div className="space-y-6">
      {/* System Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            App Version
          </span>
          <p className="text-xl font-mono font-black text-slate-800 mt-1">
            v{version.data ?? "0.1.0"}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Cloud Sync
          </span>
          <p className="text-xl font-bold text-slate-800 mt-1 capitalize">
            {cloudState.data?.status ?? "Offline"}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Negative Stock Items
          </span>
          <p
            className={`text-xl font-black mt-1 ${
              stock.data && stock.data.length > 0 ? "text-rose-600" : "text-slate-800"
            }`}
          >
            {stock.data?.length ?? 0}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Crash Logs Recorded
          </span>
          <p className="text-xl font-black text-slate-800 mt-1">
            {crashes.data?.length ?? 0}
          </p>
        </div>
      </div>

      {/* Negative Stock Warning */}
      {stock.data && stock.data.length > 0 && (
        <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <span>⚠️</span>
            <span>Stock Discrepancies ({stock.data.length} items with negative inventory)</span>
          </div>
          <div className="divide-y divide-amber-200/60 max-h-48 overflow-y-auto">
            {stock.data.map((item) => (
              <div key={item.id} className="py-2 flex justify-between text-xs text-amber-900">
                <span className="font-medium">{item.name}</span>
                <span className="font-mono font-bold text-rose-600">
                  {item.quantity} in stock
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crash Logs Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h4 className="font-semibold text-slate-800 text-sm">
              Application Problem & Crash Logs ({crashes.data?.length ?? 0})
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Recorded errors for troubleshooting and support
            </p>
          </div>
          {crashes.data && crashes.data.length > 0 && (
            <div className="flex gap-2">
              <button className="btn btn-xs btn-outline" onClick={() => void copy()}>
                Copy Diagnostics
              </button>
              <button
                className="btn btn-xs btn-ghost text-rose-600"
                disabled={clear.isPending}
                onClick={() => {
                  if (window.confirm("Clear all recorded crash logs?")) clear.mutate();
                }}
              >
                Clear Logs
              </button>
            </div>
          )}
        </div>

        <div className="p-4">
          {crashes.data && crashes.data.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {crashes.data.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono space-y-1"
                >
                  <p className="font-semibold text-rose-700">{item.message}</p>
                  <p className="text-slate-400 text-[11px]">
                    {new Date(item.occurredAt).toLocaleString()} · Source: {item.source}
                    {item.appVersion ? ` · v${item.appVersion}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              No crashes recorded. Everything running smoothly! 🎉
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
