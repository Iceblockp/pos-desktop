import { useCapabilities } from './useCapabilities';
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CartDraft,
  CartLine,
  CashSessionSummary,
  Product,
  Receipt,
  ReportSummary,
  SaleSummary,
  StockMovement,
  Supplier,
} from "../shared/models";
import { Money as MoneyPage } from "./components/Money";
import { Counter } from "./components/Counter";
import { Sales } from "./components/Sales";
import { Inventory } from "./components/Inventory";
import { Customers } from "./components/Customers";
import { Reports } from "./components/Reports";
import { Settings } from "./components/Settings";

type Page =
  | "counter"
  | "sales"
  | "inventory"
  | "customers"
  | "reports"
  | "settings";

type TierDraft = {
  key: string;
  id: string;
  minQuantity: string;
  bulkPrice: string;
};

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function App() {
  const [page, setPage] = useState<Page>("counter");
  const capabilities = useCapabilities();
  const [draft,setDraft] = useState<CartDraft|null>(null);
  const cart = draft?.lines ?? [];
  const setCart: React.Dispatch<React.SetStateAction<CartLine[]>> = value => setDraft(current => current ? {...current,lines:typeof value==='function'?value(current.lines):value} : current);
  const updateDraft = (patch:Partial<CartDraft>) => setDraft(current => current ? {...current,...patch} : current);
  useEffect(() => { window.storePos.pos.cartDraft().then(setDraft).catch(error=>setNotice(error.message)); }, []);
  useEffect(() => { if(draft)void window.storePos.pos.saveCartDraft(draft).catch(error=>setNotice('Cart could not be saved: '+error.message)); }, [draft]);
  const [notice, setNotice] = useState<string | null>(null);
  const client = useQueryClient();
  const cloud = useQuery({queryKey:['cloud'], queryFn:()=>window.storePos.cloud.state(), refetchInterval:5000});
  const lastRevision = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (cloud.data?.dataRevision !== lastRevision.current) {
      lastRevision.current = cloud.data?.dataRevision;
      void client.invalidateQueries({predicate:q => !['cloud','cloud-state'].includes(String(q.queryKey[0]))});
    }
  }, [cloud.data?.dataRevision, client]);
  useEffect(() => { const sync=()=>{void window.storePos.cloud.syncNow();};window.addEventListener("online",sync);return()=>window.removeEventListener("online",sync);},[]);
  useEffect(()=>window.storePos.app.onNavigate(setPage),[]);
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
    setDraft({lines:[],orderDiscount:0,customerId:'',note:'',soldAt:'',priceLevelId:'level-retail'});
    void client.invalidateQueries();
  };
  return (
    <div className="flex min-h-screen bg-stone-50">
      <aside className="w-60 bg-gradient-to-b from-gray-800 to-gray-900 text-gray-100 p-7 flex flex-col gap-1.5 shadow-xl">
        <div className="px-3 pb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Store <span className="text-green-400 font-extrabold">POS</span>
          </h1>
          <p className="text-xs uppercase tracking-wider text-green-200/60 mt-1.5 font-semibold">
            Desktop
          </p>
        </div>
        {(
          [
            ["counter", "🛒 Counter"],
            ["sales", "📊 Sales"],
            ["inventory", "📦 Inventory"],
            ["customers", "👥 Customers"],
            ["reports", "💰 Reports"],
            ["settings", "⚙️ Settings"],
          ] as [Page, string][]
        ).map(([key, label]) => (
          <button
            className={`px-4 py-3.5 rounded-lg text-left font-medium transition-all text-sm ${
              page === key
                ? "bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg"
                : "text-gray-300 hover:bg-green-600/10 hover:text-white"
            }`}
            key={key}
            onClick={() => setPage(key)}
          >
            {key === "reports" && !capabilities.owner ? "🧰 Shop tools" : label}
          </button>
        ))}
        <div className="mt-auto p-3 text-xs leading-relaxed bg-white/5 rounded-lg border border-white/10">
          Offline-first
          <br />
          Cloud sync is optional
        </div>
      </aside>
      <main className="flex-1 p-10 max-w-screen-2xl mx-auto">
        {notice && (
          <div
            className="fixed top-5 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg cursor-pointer"
            onClick={() => setNotice(null)}
          >
            {notice}
          </div>
        )}
        {page === "counter" && draft && (
          <Counter
            draft={draft}
            updateDraft={updateDraft}
            cart={cart}
            setCart={setCart}
            afterSale={afterSale}
            notify={setNotice}
          />
        )}
        {page === "sales" && <Sales notify={setNotice} />}
        {page === "inventory" && <Inventory notify={setNotice} />}
        {page === "customers" && <Customers notify={setNotice} />}
        {page === "reports" && (
          <Reports dashboard={dashboard.data} notify={setNotice} />
        )}
        {page === "settings" && <Settings notify={setNotice} />}
      </main>
    </div>
  );
}
