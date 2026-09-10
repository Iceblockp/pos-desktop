import { useCapabilities } from './useCapabilities';
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CartDraft,
  CartLine,
} from "../shared/models";
import { Money as MoneyPage } from "./components/Money";
import { Counter } from "./components/Counter";
import { Sales } from "./components/Sales";
import { Inventory } from "./components/Inventory";
import { Customers } from "./components/Customers";
import { Reports } from "./components/Reports";
import { Settings } from "./components/Settings";
import { cacheCurrency, formatCurrency, parseCurrency } from '../shared/currency';

type Page =
  | "counter"
  | "sales"
  | "inventory"
  | "customers"
  | "cash-drawer"
  | "reports"
  | "settings";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

const money = { format: formatCurrency };

export function App() {
  // Formatting helpers read this cached value. Refresh it from SQLite so a
  // currency change pulled from another device repaints the whole shell too.
  const [, setCurrencyRevision] = useState(0);
  const currencyProfile = useQuery({
    queryKey: ['currency-profile'],
    queryFn: () => window.storePos.pos.shopProfile(),
    refetchInterval: 5000,
  });
  useEffect(() => {
    cacheCurrency(parseCurrency(currencyProfile.data?.currency));
    setCurrencyRevision((revision) => revision + 1);
  }, [currencyProfile.data?.currency]);
  const [page, setPage] = useState<Page>("counter");
  const capabilities = useCapabilities();
  const [draft, setDraft] = useState<CartDraft | null>(null);
  const cart = draft?.lines ?? [];
  const setCart: React.Dispatch<React.SetStateAction<CartLine[]>> = (value) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: typeof value === "function" ? value(current.lines) : value,
          }
        : current,
    );
  const updateDraft = (patch: Partial<CartDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (message: string, type?: "success" | "error" | "info") => {
    const inferredType: "success" | "error" | "info" =
      type ??
      (/fail|error|reject|cannot|denied|invalid|err/i.test(message)
        ? "error"
        : "success");
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, type: inferredType }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    window.storePos.pos
      .cartDraft()
      .then(setDraft)
      .catch((error) => showToast(error.message, "error"));
  }, []);

  useEffect(() => {
    if (draft)
      void window.storePos.pos
        .saveCartDraft(draft)
        .catch((error) =>
          showToast("Cart could not be saved: " + error.message, "error"),
        );
  }, [draft]);

  const client = useQueryClient();
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
    refetchInterval: 5000,
  });

  const session = useQuery({
    queryKey: ["cash-session"],
    queryFn: () => window.storePos.pos.cashSession(),
    refetchInterval: 15000,
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSyncing(true);
    try {
      await window.storePos.cloud.syncNow();
      await client.invalidateQueries();
      showToast("Cloud sync completed", "success");
    } catch (err: any) {
      showToast(err?.message || "Sync failed", "error");
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const lastRevision = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (cloud.data?.dataRevision !== lastRevision.current) {
      lastRevision.current = cloud.data?.dataRevision;
      void client.invalidateQueries({
        predicate: (q) =>
          !["cloud", "cloud-state"].includes(String(q.queryKey[0])),
      });
    }
  }, [cloud.data?.dataRevision, client]);

  useEffect(() => {
    const sync = () => {
      void window.storePos.cloud.syncNow();
    };
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  useEffect(() => window.storePos.app.onNavigate(setPage as any), []);

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => window.storePos.pos.dashboard(),
  });

  useEffect(() => {
    const log = (message: string, source: string) => {
      void window.storePos.pos.logCrash(message, source).catch(() => {});
    };
    const onError = (event: ErrorEvent) =>
      log(event.error?.stack || event.message, event.filename || "renderer");
    const onRejection = (event: PromiseRejectionEvent) =>
      log(
        event.reason instanceof Error
          ? event.reason.stack || event.reason.message
          : String(event.reason),
        "unhandled promise rejection",
      );
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const afterSale = () => {
    setDraft({
      lines: [],
      orderDiscount: 0,
      customerId: "",
      note: "",
      soldAt: "",
      priceLevelId: "level-retail",
    });
    void client.invalidateQueries();
  };

  const isDrawerOpen = session.data?.status === "open";
  const syncStatus = cloud.data?.status;
  const pendingCount = cloud.data?.pending ?? 0;

  const navItems: {
    key: Page;
    label: string;
    icon: string;
    badge?: React.ReactNode;
  }[] = [
    { key: "counter", label: "Counter", icon: "🛒" },
    { key: "sales", label: "Sales", icon: "📊" },
    { key: "inventory", label: "Inventory", icon: "📦" },
    { key: "customers", label: "Customers", icon: "👥" },
    {
      key: "cash-drawer",
      label: "Cash Drawer",
      icon: "💵",
      badge: isDrawerOpen ? (
        <span className="badge badge-success badge-xs py-0.5 px-1.5 text-[10px] text-white">
          Open
        </span>
      ) : (
        <span className="badge badge-ghost badge-xs py-0.5 px-1.5 text-[10px] text-gray-400 bg-white/10 border-0">
          Closed
        </span>
      ),
    },
    {
      key: "reports",
      label: "Reports",
      icon: "📈",
      badge: !capabilities.owner ? (
        <span className="badge badge-neutral badge-xs py-0.5 px-1.5 text-[10px] text-gray-400 bg-white/10 border-0">
          Owner
        </span>
      ) : undefined,
    },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 font-sans antialiased text-gray-800">
      {/* Sidebar */}
      <aside className="w-64 h-full shrink-0 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 p-5 flex flex-col gap-2 shadow-2xl border-r border-slate-800 select-none overflow-y-auto">
        {/* Brand & Shop Profile Header */}
        <div className="px-2 pb-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-lg shadow-inner">
              P
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-tight text-white">
                Store <span className="text-emerald-400 font-extrabold">POS</span>
              </h1>
              <p className="text-[11px] text-emerald-400/90 font-medium truncate max-w-[150px]">
                {cloud.data?.shopName || "Offline Counter"}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span className="truncate flex-1">
              {cloud.data?.deviceName || "Desktop"}
              {cloud.data?.role ? ` (${cloud.data.role})` : ""}
            </span>
          </div>
        </div>

        {/* Primary Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1 pt-2">
          {navItems.map(({ key, label, icon, badge }) => {
            const isActive = page === key;
            return (
              <button
                key={key}
                onClick={() => setPage(key)}
                className={`group flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                    : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base leading-none">{icon}</span>
                  <span>{label}</span>
                </div>
                {badge}
              </button>
            );
          })}
        </nav>

        {/* Status Widgets in Sidebar Footer */}
        <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-slate-800/80">
          {/* Live Drawer Status Widget */}
          <div
            onClick={() => setPage("cash-drawer")}
            className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/80 transition cursor-pointer"
            title="Click to view Cash Drawer"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Cash Drawer
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isDrawerOpen ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                }`}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">
                {isDrawerOpen ? "Session Open" : "Drawer Closed"}
              </span>
              {isDrawerOpen && session.data?.openingFloat != null && (
                <span className="text-[11px] text-emerald-400 font-mono">
                  {money.format(session.data.openingFloat)}
                </span>
              )}
            </div>
          </div>

          {/* Live Cloud & Sync Status Widget */}
          <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    syncStatus === "syncing" || isSyncing
                      ? "bg-amber-400 animate-spin"
                      : syncStatus === "error"
                        ? "bg-rose-400"
                        : cloud.data?.deviceId
                          ? "bg-emerald-400"
                          : "bg-slate-500"
                  }`}
                />
                <span className="text-xs font-medium text-slate-200 truncate">
                  {syncStatus === "syncing" || isSyncing
                    ? "Syncing data..."
                    : syncStatus === "error"
                      ? "Sync error"
                      : cloud.data?.deviceId
                        ? "Cloud Online"
                        : "Offline Mode"}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate pl-3.5">
                {pendingCount > 0
                  ? `${pendingCount} pending upload`
                  : "All records synced"}
              </p>
            </div>

            {/* Quick Sync Button */}
            <button
              onClick={handleManualSync}
              disabled={isSyncing || syncStatus === "syncing"}
              title="Sync now with cloud"
              className="btn btn-ghost btn-xs btn-square text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className={`w-3.5 h-3.5 ${
                  isSyncing || syncStatus === "syncing" ? "animate-spin" : ""
                }`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto p-6 min-w-0 flex flex-col">
        {/* Floating Toast Notification Stack */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm cursor-pointer transition-all transform translate-y-0 ${
                toast.type === "error"
                  ? "bg-rose-600 text-white border-rose-500 shadow-rose-900/20"
                  : toast.type === "info"
                    ? "bg-blue-600 text-white border-blue-500 shadow-blue-900/20"
                    : "bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/20"
              }`}
            >
              <span>
                {toast.type === "error"
                  ? "✕"
                  : toast.type === "info"
                    ? "ℹ"
                    : "✓"}
              </span>
              <span className="font-medium">{toast.message}</span>
            </div>
          ))}
        </div>

        {page === "counter" && draft && (
          <Counter
            draft={draft}
            updateDraft={updateDraft}
            cart={cart}
            setCart={setCart}
            afterSale={afterSale}
            notify={showToast}
          />
        )}
        {page === "sales" && <Sales notify={showToast} />}
        {page === "inventory" && <Inventory notify={showToast} />}
        {page === "customers" && <Customers notify={showToast} />}
        {page === "cash-drawer" && (
          <MoneyPage dashboard={dashboard.data} notify={showToast} />
        )}
        {page === "reports" && (
          <Reports dashboard={dashboard.data} notify={showToast} />
        )}
        {page === "settings" && <Settings notify={showToast} />}
      </main>
    </div>
  );
}
