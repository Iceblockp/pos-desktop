import { useCapabilities } from '../useCapabilities';
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer, Receipt } from "../../shared/models";
import { formatCurrency } from '../../shared/currency';

const money = { format: formatCurrency };

export function Customers({ notify }: { notify: (s: string, type?: "success" | "error" | "info") => void }) {
  const capabilities = useCapabilities();
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => window.storePos.pos.paymentMethods(),
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "debt" | "clear">("all");
  const [offset, setOffset] = useState(0);

  const emptyCustomer = { id: "", name: "", phone: "", note: "" };
  const [modal, setModal] = useState<"customer" | "ledger" | "collect" | null>(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Collect form state
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState("cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectSaleId, setCollectSaleId] = useState("");
  const [collectPaidAt, setCollectPaidAt] = useState("");
  const [debtReceipt, setDebtReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    const active = methods.data?.filter((m) => m.isActive && m.code !== "debt");
    if (
      collectMethod !== "debt" &&
      active?.length &&
      !active.some((m) => m.code === collectMethod)
    ) {
      setCollectMethod(active[0].code);
    }
  }, [methods.data, collectMethod]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modal) {
        setModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modal]);

  const client = useQueryClient();

  const customers = useQuery({
    queryKey: ["customer-page", search, filter, offset],
    queryFn: () => window.storePos.pos.customerPage({ search, filter, offset, limit: 100 }),
  });

  const customerSummary = useQuery({ queryKey: ['customer-summary'], queryFn: () => window.storePos.pos.customerSummary() });

  const debtors = useQuery({
    queryKey: ["debtors"],
    queryFn: () => window.storePos.pos.debtors(),
    enabled: modal === "collect",
  });

  const activeCustomer = useMemo(
    () => customers.data?.items.find((c) => c.id === selectedCustomerId) ?? null,
    [customers.data, selectedCustomerId],
  );

  const ledger = useQuery({
    queryKey: ["customer-ledger", selectedCustomerId],
    queryFn: () => window.storePos.pos.customerLedger(selectedCustomerId),
    enabled: Boolean(selectedCustomerId) && (modal === "ledger" || modal === "collect"),
  });

  const debtMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of debtors.data ?? []) {
      map.set(d.id, d.debt);
    }
    return map;
  }, [debtors.data]);

  const saveCustomer = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveCustomer({
        id: customerForm.id || undefined,
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim() || null,
        note: customerForm.note.trim() || null,
      }),
    onSuccess: (saved) => {
      setModal(null);
      setCustomerForm(emptyCustomer);
      void client.invalidateQueries({ queryKey: ["customer-page"] });
      void client.invalidateQueries({ queryKey: ["counter-customer-page"] });
      void client.invalidateQueries({ queryKey: ["customer-summary"] });
      void client.invalidateQueries({ queryKey: ["debtors"] });
      notify(`ဖောက်သည် ${saved.name} ကို သိမ်းပြီးပါပြီ`, "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const removeCustomer = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeCustomer(id),
    onSuccess: () => {
      setModal(null);
      setSelectedCustomerId("");
      setCustomerForm(emptyCustomer);
      void client.invalidateQueries({ queryKey: ["customer-page"] });
      void client.invalidateQueries({ queryKey: ["counter-customer-page"] });
      void client.invalidateQueries({ queryKey: ["customer-summary"] });
      void client.invalidateQueries({ queryKey: ["debtors"] });
      notify("ဖောက်သည်အချက်အလက် ဖယ်ရှားပြီး အရောင်းမှတ်တမ်းကို ဆက်လက်သိမ်းထားပါသည်။", "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const collectDebt = useMutation({
    mutationFn: () =>
      window.storePos.pos.collectDebt(
        selectedCustomerId,
        Number(collectAmount),
        collectMethod,
        collectNote || undefined,
        collectSaleId || undefined,
        collectPaidAt ? new Date(collectPaidAt).toISOString() : undefined,
      ),
    onSuccess: (receipt) => {
      setDebtReceipt(receipt);
      setCollectSaleId("");
      setCollectPaidAt("");
      setCollectAmount("");
      setCollectNote("");
      setModal(null);
      void client.invalidateQueries();
      notify("အကြွေးဆပ်ငွေ မှတ်တမ်းတင်ပြီးပါပြီ", "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const openNewCustomer = () => {
    setCustomerForm(emptyCustomer);
    setModal("customer");
  };

  const openEditCustomer = (c: Customer) => {
    setCustomerForm({
      id: c.id,
      name: c.name,
      phone: c.phone ?? "",
      note: c.note ?? "",
    });
    setModal("customer");
  };

  const openLedger = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setModal("ledger");
  };

  const openCollect = (customerId = "") => {
    if (!capabilities.debt) {
      notify("ဖောက်သည်အကြွေး အသုံးပြုရန် သက်တမ်းရှိအစီအစဉ်နှင့် အကြွေးလုပ်ဆောင်ချက် လိုအပ်သည်", "error");
      return;
    }
    setSelectedCustomerId(customerId);
    const existingDebt = debtMap.get(customerId) ?? 0;
    setCollectAmount(existingDebt > 0 ? String(existingDebt) : "");
    setCollectNote("");
    setCollectSaleId("");
    setCollectPaidAt("");
    setModal("collect");
  };

  // Metrics
  const totalCustomerCount = customerSummary.data?.total ?? 0;
  const debtorCount = customerSummary.data?.debtors ?? 0;
  const totalReceivables = customerSummary.data?.receivables ?? 0;
  const filteredCustomers = customers.data?.items ?? [];

  return (
    <section className="h-full flex flex-col gap-3">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            👥 ဖောက်သည်နှင့် အကြွေးစာရင်း
          </h1>
          <p className="text-xs text-gray-500">
            ဖောက်သည်စာရင်း၊ ကျန်အကြွေးနှင့် အကြွေးဆပ်မှုများကို စီမံပါ
          </p>
        </div>

        <div className="flex items-center gap-2">
          {debtReceipt && (
            <button
              onClick={() => {
                window.storePos.printer
                  .printReceipt(debtReceipt)
                  .then(() => notify("အကြွေးဆပ်ဘောက်ချာကို ပရင်တာသို့ ပို့ပြီးပါပြီ", "success"))
                  .catch((e) => notify(e.message, "error"));
              }}
              className="btn btn-outline btn-xs font-semibold gap-1 text-emerald-700 hover:bg-emerald-50"
            >
              <span>🖨️</span>
              <span>နောက်ဆုံးအကြွေးဆပ်ဘောက်ချာ ပြန်ထုတ်မည်</span>
            </button>
          )}
          <button onClick={openNewCustomer} className="btn btn-primary btn-sm">
            + ဖောက်သည်အသစ်
          </button>
        </div>
      </header>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => setFilter("all")}
          className={`p-3.5 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            filter === "all"
              ? "bg-slate-900 text-white border-slate-900 shadow-md"
              : "bg-white border-gray-200/80 text-gray-800 hover:bg-gray-50"
          }`}
        >
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${filter === "all" ? "text-slate-300" : "text-gray-400"}`}>
              ဖောက်သည်စုစုပေါင်း
            </p>
            <p className="text-xl font-black mt-0.5">{totalCustomerCount}</p>
          </div>
          <span className="text-2xl">👥</span>
        </div>

        <div
          onClick={() => setFilter(filter === "debt" ? "all" : "debt")}
          className={`p-3.5 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            filter === "debt"
              ? "bg-amber-600 text-white border-amber-600 shadow-md"
              : "bg-white border-gray-200/80 text-gray-800 hover:bg-amber-50/50"
          }`}
        >
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${filter === "debt" ? "text-amber-100" : "text-amber-600"}`}>
              အကြွေးကျန်သူ
            </p>
            <p className="text-xl font-black mt-0.5">{debtorCount}</p>
          </div>
          <span className="text-2xl">⚠️</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">
              ရရန်ကျန်ငွေစုစုပေါင်း
            </p>
            <p className="text-xl font-black text-rose-700 mt-0.5">
              {money.format(totalReceivables)}
            </p>
          </div>
          <span className="text-2xl">💰</span>
        </div>
      </div>

      {/* Control Bar: Search & Filter Chips */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              🔍
            </span>
            <input
              type="text"
              placeholder="အမည်၊ ဖုန်း သို့မဟုတ် မှတ်ချက်ဖြင့်ရှာပါ…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              className="input input-bordered input-sm w-full pl-9 text-xs bg-gray-50 focus:bg-white"
              autoFocus
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => { setFilter("all"); setOffset(0); }}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                filter === "all"
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              အားလုံး ({totalCustomerCount})
            </button>
            <button
              onClick={() => { setFilter("debt"); setOffset(0); }}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                filter === "debt"
                  ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              အကြွေးရှိ ({debtorCount})
            </button>
            <button
              onClick={() => { setFilter("clear"); setOffset(0); }}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                filter === "clear"
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              အကြွေးမရှိ ({totalCustomerCount - debtorCount})
            </button>
          </div>
        </div>
      </div>

      {/* Unified Customer Table */}
      <div className="card bg-white shadow-sm border border-gray-200/80 flex-1 overflow-hidden">
        <div className="card-body p-0 flex flex-col overflow-hidden">
          {filteredCustomers.length > 0 ? (
            <div className="flex-1 overflow-y-auto">
              <table className="table table-sm w-full">
                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold">ဖောက်သည်အမည်</th>
                    <th className="py-3 px-4 font-semibold">ဖုန်းနံပါတ်</th>
                    <th className="py-3 px-4 font-semibold">ကျန်အကြွေး</th>
                    <th className="py-3 px-4 font-semibold">မှတ်ချက်</th>
                    <th className="py-3 px-4 font-semibold text-right">လုပ်ဆောင်ချက်</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredCustomers.map((c) => {
                    const debt = c.debt;
                    const hasDebt = debt > 0;

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-gray-50/80 transition group"
                      >
                        <td className="py-3 px-4">
                          <span className="font-bold text-sm text-gray-900 block leading-tight">
                            {c.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600 font-mono">
                          {c.phone || "—"}
                        </td>
                        <td className="py-3 px-4">
                          {hasDebt ? (
                            <span className="badge badge-warning badge-sm font-bold text-amber-900 bg-amber-100 border-amber-300">
                              အကြွေး {money.format(debt)}
                            </span>
                          ) : (
                            <span className="badge badge-ghost badge-sm text-gray-400 bg-gray-50">
                              ရှင်းပြီး (၀)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-500 max-w-[200px] truncate">
                          {c.note || "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {hasDebt && capabilities.debt && (
                              <button
                                className="btn btn-xs btn-warning font-bold shadow-xs"
                                onClick={() => openCollect(c.id)}
                              >
                                အကြွေးဆပ်
                              </button>
                            )}
                            <button
                              className="btn btn-xs btn-outline border-gray-300 text-gray-700 hover:bg-gray-100"
                              onClick={() => openLedger(c.id)}
                            >
                              စာရင်းကြည့်
                            </button>
                            <button
                              className="btn btn-xs btn-ghost text-gray-600 hover:bg-gray-100"
                              onClick={() => openEditCustomer(c)}
                            >
                              ပြင်မည်
                            </button>
                            {!hasDebt && (
                              <button
                                className="btn btn-xs btn-ghost text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `ဖောက်သည် “${c.name}” ကို ဖယ်ရှားမည်လား။ ယခင်အရောင်းမှတ်တမ်းများ မပျက်ပါ။`,
                                    )
                                  ) {
                                    removeCustomer.mutate(c.id);
                                  }
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
                <span>ပြထားသည် {offset + 1}-{offset + filteredCustomers.length} / {customers.data?.total ?? 0}</span>
                <div className="flex gap-2"><button className="btn btn-xs" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>ရှေ့သို့</button><button className="btn btn-xs" disabled={offset + filteredCustomers.length >= (customers.data?.total ?? 0)} onClick={() => setOffset(offset + 100)}>နောက် ၁၀၀ ခု</button></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400">
              <span className="text-4xl mb-2">👥</span>
              <p className="text-base font-bold text-gray-700">
                ဖောက်သည် မတွေ့ပါ
              </p>
              <p className="text-xs text-gray-500 mt-1">
                အခြားအမည်/ဖုန်းဖြင့်ရှာပါ သို့မဟုတ် စစ်ထုတ်မှုကိုရှင်းပါ။
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Create / Edit Modal */}
      {modal === "customer" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                {customerForm.id ? "ဖောက်သည်ပြင်မည်" : "ဖောက်သည်အသစ်"}
              </h3>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customerForm.name.trim()) return;
                saveCustomer.mutate();
              }}
              className="mt-4 space-y-3"
            >
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ဖောက်သည်အမည် *
                  </span>
                </label>
                <input
                  required
                  value={customerForm.name}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, name: e.target.value })
                  }
                  placeholder="ဥပမာ ဒေါ်ခင်၊ ကိုအောင်"
                  className="input input-bordered input-sm w-full"
                  autoFocus
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ဖုန်းနံပါတ်
                  </span>
                </label>
                <input
                  type="tel"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, phone: e.target.value })
                  }
                  placeholder="e.g. 0912345678"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    မှတ်ချက် / လိပ်စာ
                  </span>
                </label>
                <textarea
                  value={customerForm.note}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, note: e.target.value })
                  }
                  placeholder="ပို့ရန်လိပ်စာ သို့မဟုတ် မှတ်ချက်…"
                  className="textarea textarea-bordered textarea-sm w-full"
                  rows={2}
                />
              </div>

              <div className="modal-action pt-2 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setModal(null)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={saveCustomer.isPending || !customerForm.name.trim()}
                >
                  {saveCustomer.isPending ? "သိမ်းနေသည်…" : "ဖောက်သည်သိမ်းမည်"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Ledger Dialog Modal */}
      {modal === "ledger" && activeCustomer && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl max-h-[85vh] flex flex-col p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-xl text-gray-900">
                  {activeCustomer.name}
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  {activeCustomer.phone || "ဖုန်းနံပါတ် မမှတ်ထားပါ"}
                  {activeCustomer.note ? ` · ${activeCustomer.note}` : ""}
                </p>
              </div>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            {/* Current Balance Card */}
            <div className="my-4 p-4 rounded-xl border flex items-center justify-between bg-gray-50">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  လက်ရှိအကြွေးလက်ကျန်
                </p>
                <p
                  className={`text-2xl font-black mt-0.5 ${
                    (ledger.data?.balance ?? 0) > 0
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {money.format(ledger.data?.balance ?? 0)}
                </p>
              </div>

              {(ledger.data?.balance ?? 0) > 0 && capabilities.debt && (
                <button
                  onClick={() => openCollect(activeCustomer.id)}
                  className="btn btn-warning btn-sm font-bold shadow-sm"
                >
                  အကြွေးဆပ်ငွေ လက်ခံမည်
                </button>
              )}
            </div>

            {/* Ledger Transactions: Credit Purchases vs Repayments */}
            <div className="flex-1 overflow-y-auto space-y-3">
              <div>
                <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2">
                  မရှင်းရသေးသော အကြွေးအရောင်း
                </h4>
                {ledger.data?.sales.length ? (
                  <div className="space-y-1.5">
                    {ledger.data.sales.map((sale) => (
                      <div
                        key={sale.id}
                        className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-gray-900 font-mono">
                            #{sale.voucherId}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {new Date(sale.soldAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">
                            စုစုပေါင်း — {money.format(sale.total)}
                          </p>
                          <p className="text-[11px] font-semibold text-amber-700">
                            ကျန်ငွေ — {money.format(sale.remaining)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-2">
                    အကြွေးအရောင်းမှတ်တမ်း မရှိပါ။
                  </p>
                )}
              </div>

              <div className="divider my-1"></div>

              <div>
                <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2">
                  အကြွေးဆပ်မှတ်တမ်း
                </h4>
                {ledger.data?.payments.length ? (
                  <div className="space-y-1.5">
                    {ledger.data.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-emerald-900">
                            ဆပ်ငွေ ({p.methodName})
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {new Date(p.paidAt).toLocaleString()}
                            {p.note ? ` · Note: ${p.note}` : ""}
                          </p>
                        </div>
                        <span className="font-bold text-sm text-emerald-700 font-mono">
                          +{money.format(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-2">
                    အကြွေးဆပ်မှတ်တမ်း မရှိသေးပါ။
                  </p>
                )}
              </div>
            </div>

            <div className="modal-action pt-3 border-t border-gray-100 flex justify-between">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setModal(null)}
              >
                ပိတ်မည်
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => openEditCustomer(activeCustomer)}
              >
                အချက်အလက်ပြင်မည်
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Debt Payment Modal */}
      {modal === "collect" && capabilities.debt && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                အကြွေးဆပ်ငွေ လက်ခံမည်
              </h3>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedCustomerId || Number(collectAmount) <= 0) return;
                collectDebt.mutate();
              }}
              className="mt-4 space-y-3"
            >
              {/* Customer Selector */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    အကြွေးကျန်ဖောက်သည် *
                  </span>
                </label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setSelectedCustomerId(cId);
                    const bal = debtMap.get(cId) ?? 0;
                    if (bal > 0) setCollectAmount(String(bal));
                  }}
                  className="select select-bordered select-sm w-full font-medium"
                >
                  <option value="">ဖောက်သည်ရွေးပါ…</option>
                  {debtors.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (အကြွေး {money.format(d.debt)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Outstanding Debt Info & Full Balance Chip */}
              {selectedCustomerId && (debtMap.get(selectedCustomerId) ?? 0) > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-amber-800">အကြွေးစုစုပေါင်း —</span>{" "}
                    <strong className="text-amber-900">
                      {money.format(debtMap.get(selectedCustomerId) ?? 0)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCollectAmount(
                        String(debtMap.get(selectedCustomerId) ?? 0),
                      )
                    }
                    className="btn btn-xs btn-outline border-amber-400 text-amber-900 hover:bg-amber-200"
                  >
                    အပြည့်ဆပ်မည်
                  </button>
                </div>
              )}

              {/* Payment Amount */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    လက်ခံရရှိငွေ *
                  </span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.001"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  placeholder="0.00"
                  className="input input-bordered input-sm font-bold text-sm"
                  autoFocus
                />
              </div>

              {/* Payment Method */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ပေးချေမှုနည်းလမ်း *
                  </span>
                </label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value)}
                  className="select select-bordered select-sm w-full"
                >
                  {methods.data
                    ?.filter((m) => m.isActive && m.code !== "debt")
                    .map((m) => (
                      <option key={m.id} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Specific Voucher Allocation */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ဆပ်မည့် ဘောက်ချာ ရွေးရန်
                  </span>
                </label>
                <select
                  className="select select-bordered select-sm w-full text-xs"
                  value={collectSaleId}
                  onChange={(e) => setCollectSaleId(e.target.value)}
                >
                  <option value="">အဟောင်းဆုံးအကြွေးမှ စဆပ်မည်</option>
                  {ledger.data?.sales
                    .filter((s) => s.remaining > 0)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        ဘောက်ချာ #{s.voucherId} ({money.format(s.remaining)} ကျန်)
                      </option>
                    ))}
                </select>
              </div>

              {/* Note */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ဘောက်ချာမှတ်ချက်
                  </span>
                </label>
                <input
                  value={collectNote}
                  onChange={(e) => setCollectNote(e.target.value)}
                  placeholder="ဥပမာ ငွေသားဖြင့်ဆပ်သည် / လွှဲငွေအမှတ်"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="modal-action pt-2 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setModal(null)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary font-bold px-5"
                  disabled={
                    collectDebt.isPending ||
                    !selectedCustomerId ||
                    Number(collectAmount) <= 0
                  }
                >
                  {collectDebt.isPending
                    ? "မှတ်တမ်းတင်နေသည်…"
                    : `Confirm Payment · ${money.format(Number(collectAmount) || 0)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
