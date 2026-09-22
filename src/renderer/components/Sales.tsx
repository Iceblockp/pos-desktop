import { useCapabilities } from '../useCapabilities';
import { PeriodFilter, usePeriod } from "./PeriodFilter";
import { useMemo, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Receipt, SaleSummary } from "../../shared/models";
import { formatCurrency } from '../../shared/currency';

const money = { format: formatCurrency };

export function Sales({ notify }: { notify: (s: string, type?: "success" | "error" | "info") => void }) {
  const capabilities = useCapabilities();
  const [search, setSearch] = useState("");
  const { range, label: periodLabel } = usePeriod(true);
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => window.storePos.pos.paymentMethods(),
  });

  const [typeFilter, setTypeFilter] = useState<"all" | "sales" | "debt" | "returns">("all");
  const [offset, setOffset] = useState(0);
  const [voucherId, setVoucherId] = useState<string | null>(null);

  // Return state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundAmount, setRefundAmount] = useState("");
  const [returnNote, setReturnNote] = useState("");

  // Debt collection state
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState("cash");
  const [collectNote, setCollectNote] = useState("");
  const [collectScope, setCollectScope] = useState<"voucher" | "customer">("voucher");
  const [debtReceipt, setDebtReceipt] = useState<Receipt | null>(null);

  const client = useQueryClient();

  const sales = useQuery({
    queryKey: ["sales-page", search, range?.from, range?.to, typeFilter, offset],
    queryFn: () => window.storePos.pos.salesPage({ search, from: range?.from, to: range?.to, filter: typeFilter, offset, limit: 50 }),
  });
  const salesSummary = useQuery({ queryKey: ['sales-summary', search, range?.from, range?.to], queryFn: () => window.storePos.pos.salesSummary({ search, from: range?.from, to: range?.to }) });

  const receipt = useQuery({
    queryKey: ["receipt", voucherId],
    queryFn: () => window.storePos.pos.receipt(voucherId!),
    enabled: Boolean(voucherId),
  });

  const returnable = useQuery({
    queryKey: ["returnable-sale", voucherId],
    queryFn: () => window.storePos.pos.returnableSale(voucherId!),
    enabled: Boolean(voucherId),
  });

  const customerId = receipt.data?.customerId;
  const ledger = useQuery({
    queryKey: ["customer-ledger", customerId],
    queryFn: () => (customerId ? window.storePos.pos.customerLedger(customerId) : null),
    enabled: Boolean(customerId && (showCollectModal || !!receipt.data?.outstanding)),
  });

  // Auto-select latest transaction when sales list updates
  useEffect(() => {
    if (!voucherId && sales.data?.items.length) {
      setVoucherId(sales.data.items[0].voucherId);
    } else if (voucherId && sales.data?.items.length && !sales.data.items.some((s) => s.voucherId === voucherId)) {
      setVoucherId(sales.data.items[0].voucherId);
    }
  }, [sales.data, voucherId]);

  useEffect(() => {
    const active = methods.data?.filter((m) => m.isActive && m.code !== "debt");
    if (
      refundMethod !== "debt" &&
      active?.length &&
      !active.some((m) => m.code === refundMethod)
    ) {
      setRefundMethod(active[0].code);
    }
  }, [methods.data, refundMethod]);

  const returnSale = useMutation({
    mutationFn: () =>
      window.storePos.pos.returnSale(
        voucherId!,
        Object.entries(returnQuantities)
          .map(([productId, quantity]) => ({
            productId,
            quantity: Number(quantity),
          }))
          .filter((line) => line.quantity > 0),
        refundMethod,
        returnNote || undefined,
        refundAmount ? Number(refundAmount) : undefined,
      ),
    onSuccess: (result) => {
      setShowReturnModal(false);
      setReturnQuantities({});
      setReturnNote("");
      setRefundAmount("");
      void client.invalidateQueries();
      setVoucherId(result.voucherId);
      void client.invalidateQueries({ queryKey: ["sales-page"] });
      void client.invalidateQueries({ queryKey: ["sales-summary"] });
      void client.invalidateQueries({ queryKey: ["product-page"] });
      void client.invalidateQueries({ queryKey: ["product-summary"] });
      void client.invalidateQueries({ queryKey: ["cart-products"] });
      void client.invalidateQueries({ queryKey: ["returnable-sale"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      notify(`ပစ္စည်းပြန်သွင်းပြီးပါပြီ — #${result.voucherId}`, "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  // Print helper with toast
  const handlePrint = (r: Receipt) => {
    window.storePos.printer
      .printReceipt(r)
      .then(() => notify(`ဘောင်ချာ #${r.voucherId} ထုတ်ပြီးပါပြီ`, "success"))
      .catch((e) => notify(e.message, "error"));
  };

  const openCollectDebt = () => {
    if (!capabilities.debt) {
      notify("ဖောက်သည်အကြွေး အသုံးပြုရန် သက်တမ်းရှိအစီအစဉ် လိုအပ်သည်", "error");
      return;
    }
    if (!receipt.data) return;
    const remaining = receipt.data.outstanding ?? 0;
    setCollectAmount(remaining > 0 ? String(remaining) : "");
    setCollectScope("voucher");
    setCollectNote("");
    const active = methods.data?.filter((m) => m.isActive && m.code !== "debt");
    if (active?.length) {
      setCollectMethod(active[0].code);
    }
    setShowCollectModal(true);
  };

  const collectDebt = useMutation({
    mutationFn: () => {
      if (!customerId) throw new Error("No customer linked to this debt");
      const amt = Number(collectAmount);
      if (!amt || amt <= 0) throw new Error("Please enter a valid amount");

      const targetSaleId =
        collectScope === "voucher"
          ? receipt.data?.saleId ||
            sales.data?.items.find((s) => s.voucherId === voucherId)?.id ||
            ledger.data?.sales.find((s) => s.voucherId === voucherId)?.id
          : undefined;

      return window.storePos.pos.collectDebt(
        customerId,
        amt,
        collectMethod,
        collectNote ? collectNote.trim() : undefined,
        targetSaleId || undefined,
      );
    },
    onSuccess: (resReceipt) => {
      setDebtReceipt(resReceipt);
      setShowCollectModal(false);
      void client.invalidateQueries({ queryKey: ["receipt", voucherId] });
      void client.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
      void client.invalidateQueries({ queryKey: ["sales-page"] });
      void client.invalidateQueries({ queryKey: ["sales-summary"] });
      void client.invalidateQueries({ queryKey: ["debtors"] });
      void client.invalidateQueries({ queryKey: ["customer-page"] });
      void client.invalidateQueries({ queryKey: ["counter-customer-page"] });
      void client.invalidateQueries({ queryKey: ["customer-summary"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      notify("အကြွေးဆပ်ငွေ လက်ခံပြီးပါပြီ", "success");
      handlePrint(resReceipt);
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  // Keyboard shortcuts: Ctrl+P / Cmd+P to print, Escape to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        if (receipt.data) {
          e.preventDefault();
          handlePrint(receipt.data);
        }
      } else if (e.key === "Escape") {
        if (showReturnModal) {
          setShowReturnModal(false);
        } else if (showCollectModal) {
          setShowCollectModal(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [receipt.data, showReturnModal, showCollectModal]);

  // Summary Metrics
  const rawList = sales.data?.items ?? [];
  const totalVolume = salesSummary.data?.netVolume ?? 0;
  const returnCount = salesSummary.data?.returns ?? 0;
  const debtCount = salesSummary.data?.debt ?? 0;
  const filteredSales = rawList;
  const activeSale = sales.data?.items.find((s) => s.voucherId === voucherId);
  const customerName = activeSale?.customerName;

  const handleReturnAll = () => {
    if (!returnable.data) return;
    const all: Record<string, string> = {};
    for (const line of returnable.data) {
      all[line.productId] = String(line.returnable);
    }
    setReturnQuantities(all);
  };

  const calculatedRefundTotal = useMemo(() => {
    if (!returnable.data) return 0;
    return Object.entries(returnQuantities).reduce((sum, [pId, qtyStr]) => {
      const q = Number(qtyStr) || 0;
      const line = returnable.data?.find((l) => l.productId === pId);
      return sum + q * (line?.refundPerUnit ?? 0);
    }, 0);
  }, [returnable.data, returnQuantities]);

  return (
    <section className="h-full flex flex-col gap-3">
      {/* Overview Stats & Period Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            📊 အရောင်းမှတ်တမ်းနှင့် ဘောင်ချာများ
          </h1>
          <p className="text-xs text-gray-500">
            {periodLabel} · ပြထားသည် {offset + 1}-{offset + filteredSales.length} / {sales.data?.total ?? 0} ခု
          </p>
        </div>

        <div className="flex items-center gap-3">
          {debtReceipt && (
            <button
              type="button"
              onClick={() => handlePrint(debtReceipt)}
              className="btn btn-outline btn-xs font-semibold gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-300 shadow-sm"
              title="နောက်ဆုံးအကြွေးဆပ်ဘောင်ချာကို ပြန်ထုတ်မည်"
            >
              <span>🖨️</span>
              <span>အကြွေးဆပ်ဘောင်ချာ ပြန်ထုတ်မည် #{debtReceipt.voucherId}</span>
            </button>
          )}
          <PeriodFilter allowAll />
        </div>
      </header>

      {/* Metric Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => { setTypeFilter("all"); setOffset(0); }}
          className={`p-3 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            typeFilter === "all"
              ? "bg-slate-900 text-white border-slate-900 shadow-md"
              : "bg-white border-gray-200/80 text-gray-800 hover:bg-gray-50"
          }`}
        >
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${typeFilter === "all" ? "text-slate-300" : "text-gray-400"}`}>
              အရောင်းမှတ်တမ်း
            </p>
            <p className="text-xl font-black mt-0.5">{salesSummary.data?.total ?? 0}</p>
          </div>
          <span className="text-2xl">🧾</span>
        </div>

        <div
          onClick={() => { setTypeFilter("sales"); setOffset(0); }}
          className={`p-3 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            typeFilter === "sales"
              ? "bg-emerald-700 text-white border-emerald-700 shadow-md"
              : "bg-white border-gray-200/80 text-gray-800 hover:bg-emerald-50/50"
          }`}
        >
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${typeFilter === "sales" ? "text-emerald-100" : "text-emerald-600"}`}>
              အသားတင်အရောင်း
            </p>
            <p className="text-xl font-black mt-0.5">{money.format(totalVolume)}</p>
          </div>
          <span className="text-2xl">💰</span>
        </div>

        <div
          onClick={() => { setTypeFilter("debt"); setOffset(0); }}
          className={`p-3 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            typeFilter === "debt"
              ? "bg-amber-600 text-white border-amber-600 shadow-md"
              : "bg-white border-gray-200/80 text-gray-800 hover:bg-amber-50/50"
          }`}
        >
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${typeFilter === "debt" ? "text-amber-100" : "text-amber-600"}`}>
              အကြွေးအရောင်း
            </p>
            <p className="text-xl font-black mt-0.5">{debtCount}</p>
          </div>
          <span className="text-2xl">👥</span>
        </div>

        <div
          onClick={() => { setTypeFilter("returns"); setOffset(0); }}
          className={`p-3 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            typeFilter === "returns"
              ? "bg-rose-600 text-white border-rose-600 shadow-md"
              : "bg-white border-gray-200/80 text-gray-800 hover:bg-rose-50/50"
          }`}
        >
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${typeFilter === "returns" ? "text-rose-100" : "text-rose-600"}`}>
              ပြန်အမ်း / ပြန်သွင်း
            </p>
            <p className="text-xl font-black mt-0.5">{returnCount}</p>
          </div>
          <span className="text-2xl">↩️</span>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4 flex-1 overflow-hidden">
        {/* Left Column: Search & Transactions List */}
        <div className="flex flex-col bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden p-3.5">
          {/* Search Box */}
          <div className="relative mb-3">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              🔍
            </span>
            <input
              type="text"
              placeholder="ဘောင်ချာအမှတ် သို့မဟုတ် ဖောက်သည်အမည်ဖြင့်ရှာပါ…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              className="input input-bordered input-sm w-full pl-9 text-xs bg-gray-50 focus:bg-white"
              autoFocus
            />
          </div>

          {/* Transactions List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredSales.length > 0 ? (
              <>
              {filteredSales.map((sale: SaleSummary) => {
                const isSelected = sale.voucherId === voucherId;
                const isReturn = sale.type === "return";
                const isDebt = sale.outstanding > 0;

                return (
                  <button
                    key={sale.id}
                    onClick={() => setVoucherId(sale.voucherId)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-emerald-50/80 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30"
                        : "bg-white border-gray-200/80 hover:border-gray-300 hover:bg-gray-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-gray-900 font-mono">
                            #{sale.voucherId}
                          </span>
                          {isReturn ? (
                            <span className="badge badge-error badge-xs text-white">
                              ပြန်သွင်း
                            </span>
                          ) : isDebt ? (
                            <span className="badge badge-warning badge-xs">
                              အကြွေး
                            </span>
                          ) : (
                            <span className="badge badge-success badge-xs text-white">
                              ရှင်းပြီး
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-600 truncate">
                          {sale.customerName ? (
                            <strong className="text-gray-900">
                              {sale.customerName}
                            </strong>
                          ) : (
                            "အထွေထွေဖောက်သည်"
                          )}{" "}
                          · {sale.paymentMethod}
                          {isDebt ? ` · ကျန် ${money.format(sale.outstanding)}` : ""}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(sale.soldAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-black text-base ${
                            isReturn ? "text-rose-600" : "text-gray-900"
                          }`}
                        >
                          {money.format(sale.total)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              <div className="flex items-center justify-between py-3 text-xs text-gray-500"><span>လက်ရှိစာမျက်နှာ — {filteredSales.length} ခု</span><div className="flex gap-2"><button className="btn btn-xs" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>ရှေ့သို့</button><button className="btn btn-xs" disabled={offset + filteredSales.length >= (sales.data?.total ?? 0)} onClick={() => setOffset(offset + 50)}>နောက် ၅၀ ခု</button></div></div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <span className="text-3xl mb-1">🧾</span>
                <p className="text-sm font-medium">အရောင်းမှတ်တမ်း မတွေ့ပါ</p>
                <p className="text-xs">ရှာဖွေမှု သို့မဟုတ် ကာလကို ပြောင်းကြည့်ပါ</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Thermal-Style Receipt Preview */}
        <div className="flex flex-col bg-white rounded-xl border border-gray-200/80 shadow-lg overflow-hidden">
          {receipt.isFetching ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <span className="loading loading-spinner loading-md text-emerald-600 mb-2"></span>
              <p className="text-xs font-medium">ဘောင်ချာဖတ်နေသည်…</p>
            </div>
          ) : receipt.data ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Receipt Header Bar */}
              <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-gray-800 font-mono">
                    ဘောင်ချာအမှတ် #{receipt.data.voucherId}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {new Date(receipt.data.soldAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {Boolean(receipt.data.outstanding && receipt.data.customerId) && (
                    <button
                      onClick={openCollectDebt}
                      className="btn btn-warning btn-xs font-bold gap-1 shadow-sm"
                      title="ဤအရောင်းအတွက် အကြွေးဆပ်ငွေ လက်ခံမည်"
                    >
                      <span>💳</span>
                      <span>အကြွေးဆပ်</span>
                    </button>
                  )}
                  {returnable.data && returnable.data.length > 0 && (
                    <button
                      onClick={() => setShowReturnModal(true)}
                      className="btn btn-warning btn-xs font-semibold"
                    >
                      ↩ ပြန်သွင်း
                    </button>
                  )}
                  <button
                    onClick={() => handlePrint(receipt.data!)}
                    className="btn btn-primary btn-xs font-bold gap-1 shadow-sm"
                    title="ဘောင်ချာထုတ်မည် (Ctrl+P / Cmd+P)"
                  >
                    <span>🖨️</span>
                    <span>ပရင့်ထုတ်</span>
                  </button>
                </div>
              </div>

              {/* Receipt Body (Paper Aesthetic) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Store Header & Customer Info */}
                <div className="text-center pb-3 border-b border-dashed border-gray-200">
                  <h2 className="font-black text-lg text-gray-900 tracking-tight">
                    {receipt.data.shopName || "ဆိုင် POS"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    ဖောက်သည် —{" "}
                    <strong>
                      {sales.data?.items.find((s) => s.voucherId === receipt.data?.voucherId)?.customerName || "အထွေထွေဖောက်သည်"}
                    </strong>
                    {Boolean(receipt.data.customerId && receipt.data.outstanding) && (
                      <span className="badge badge-warning badge-xs ml-1.5 font-bold">
                        အကြွေးရှိ
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    ပေးချေမှု — {receipt.data.paymentMethod}
                  </p>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between pb-1 border-b border-gray-100">
                    <span>ပစ္စည်း</span>
                    <span>စုစုပေါင်း</span>
                  </div>

                  {receipt.data.lines.map((line) => (
                    <div
                      key={line.productId}
                      className="flex justify-between items-start text-xs py-1"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-gray-900 leading-snug">
                          {line.name}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {line.quantity} {line.unit} × {money.format(line.unitPrice)}
                          {line.discount > 0 && (
                            <span className="text-orange-600 font-medium ml-1">
                              (-{money.format(line.discount)})
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="font-bold font-mono text-gray-900">
                        {money.format(
                          line.subtotal ??
                            line.quantity * line.unitPrice - line.discount,
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total & Payments Calculation */}
                <div className="pt-3 border-t border-dashed border-gray-300 space-y-1.5 text-xs">
                  {receipt.data.payments?.map((p, i) => (
                    <div key={i} className="flex justify-between text-gray-600">
                      <span>{p.methodName ?? p.methodCode}</span>
                      <span className="font-mono">{money.format(p.amount)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
                    <span className="text-sm font-bold text-gray-900">
                      စုစုပေါင်း
                    </span>
                    <span className="text-xl font-black text-emerald-700">
                      {money.format(receipt.data.total)}
                    </span>
                  </div>

                  {receipt.data.change != null && receipt.data.change > 0 && (
                    <div className="flex justify-between text-emerald-800 bg-emerald-50 p-2 rounded font-semibold mt-1">
                      <span>ပြန်အမ်းငွေ</span>
                      <span className="font-mono">
                        {money.format(receipt.data.change)}
                      </span>
                    </div>
                  )}

                  {!!receipt.data.outstanding && (
                    <div className="flex items-center justify-between text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2">
                      <div>
                        <span className="text-[11px] font-semibold text-amber-700 block uppercase tracking-wider">
                          အကြွေးကျန်ငွေ
                        </span>
                        <span className="font-mono text-base font-bold text-amber-950">
                          {money.format(receipt.data.outstanding)}
                        </span>
                      </div>
                      {receipt.data.customerId && (
                        <button
                          type="button"
                          onClick={openCollectDebt}
                          className="btn btn-warning btn-xs font-bold shadow-sm"
                        >
                          💳 အကြွေးဆပ်ငွေ လက်ခံမည်
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-center pt-4 text-[11px] text-gray-400">
                  <p>အားပေးမှုအတွက် ကျေးဇူးတင်ပါသည်။</p>
                  <p className="font-mono mt-0.5 text-[10px]">
                    ပြန်ထုတ်ရန် Cmd+P / Ctrl+P နှိပ်ပါ
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
              <span className="text-4xl mb-2">🧾</span>
              <p className="text-sm font-semibold text-gray-700">
                အရောင်းတစ်ခုရွေးပါ
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                ဘောင်ချာအသေးစိတ်ကြည့်ရန် ဘယ်ဘက်စာရင်းမှ အရောင်းတစ်ခုကို ရွေးပါ။
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Return Items Dialog Modal */}
      {showReturnModal && returnable.data && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  ပစ္စည်းပြန်သွင်း / ငွေပြန်အမ်းမည်
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  ဘောင်ချာအမှတ် #{voucherId}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setShowReturnModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-600">
                  ပြန်သွင်းမည့်ပစ္စည်းရွေးပါ —
                </span>
                <button
                  type="button"
                  onClick={handleReturnAll}
                  className="btn btn-xs btn-outline font-semibold"
                >
                  အားလုံးပြန်သွင်းမည်
                </button>
              </div>

              {/* Returnable Items List */}
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {returnable.data.map((line) => (
                  <div
                    key={line.productId}
                    className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {line.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        အများဆုံး {line.returnable} {line.unit} · {money.format(line.refundPerUnit)} စီ
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="number"
                        min="0"
                        max={line.returnable}
                        inputMode="decimal"
                        placeholder="0"
                        value={returnQuantities[line.productId] ?? ""}
                        onChange={(e) =>
                          setReturnQuantities({
                            ...returnQuantities,
                            [line.productId]: e.target.value,
                          })
                        }
                        className="input input-bordered input-xs w-20 text-center font-bold"
                      />
                      <span className="text-[11px] text-gray-500">
                        / {line.returnable}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Refund Summary */}
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 flex justify-between items-center text-xs">
                <span className="font-semibold text-rose-900">
                  ပြန်အမ်းငွေစုစုပေါင်း —
                </span>
                <span className="text-base font-black text-rose-700">
                  {money.format(calculatedRefundTotal)}
                </span>
              </div>

              {/* Refund Method */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ပြန်အမ်းမည့်နည်းလမ်း
                  </span>
                </label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="select select-bordered select-sm w-full"
                >
                  {methods.data
                    ?.filter((m) => m.isActive && m.code !== "debt")
                    .map((m) => (
                      <option key={m.id} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  {capabilities.debt && receipt.data?.customerId && (
                    <option value="debt">ဖောက်သည်အကြွေးစာရင်းထဲသို့</option>
                  )}
                </select>
              </div>

              {/* Return Reason Note */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    အကြောင်းပြချက် / မှတ်ချက် (မဖြည့်လည်းရ)
                  </span>
                </label>
                <input
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="ဥပမာ သက်တမ်းကုန်၊ အထုပ်ပျက်၊ အရွယ်မှား"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="modal-action pt-2 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowReturnModal(false)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-error text-white font-bold"
                  disabled={
                    returnSale.isPending || calculatedRefundTotal <= 0
                  }
                  onClick={() => returnSale.mutate()}
                >
                  {returnSale.isPending
                    ? "လုပ်ဆောင်နေသည်…"
                    : `Confirm Return · ${money.format(calculatedRefundTotal)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collect Debt Payment Modal */}
      {showCollectModal && receipt.data && customerId && capabilities.debt && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  အကြွေးဆပ်ငွေ လက်ခံမည်
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  ဘောင်ချာအမှတ် #{voucherId} · {customerName || "ဖောက်သည်"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setShowCollectModal(false)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!collectAmount || Number(collectAmount) <= 0) return;
                collectDebt.mutate();
              }}
              className="mt-4 space-y-4"
            >
              {/* Balance Summary Card */}
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-800">ဤဘောင်ချာကျန်ငွေ —</span>
                  <span className="font-mono font-bold text-amber-950 text-sm">
                    {money.format(receipt.data.outstanding ?? 0)}
                  </span>
                </div>
                {ledger.data && (
                  <div className="flex justify-between items-center text-xs pt-1.5 border-t border-amber-200/60">
                    <span className="text-amber-800">ဖောက်သည်အကြွေးစုစုပေါင်း —</span>
                    <span className="font-mono font-bold text-amber-950">
                      {money.format(ledger.data.balance)}
                    </span>
                  </div>
                )}
              </div>

              {/* Scope Quick Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">
                  ဆပ်ငွေသတ်မှတ်မည့်နေရာ
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCollectScope("voucher");
                      setCollectAmount(String(receipt.data?.outstanding ?? 0));
                    }}
                    className={`btn btn-xs py-1 h-auto text-left flex flex-col items-start ${
                      collectScope === "voucher"
                        ? "btn-primary"
                        : "btn-outline border-gray-300"
                    }`}
                  >
                    <span className="font-bold">ဤဘောင်ချာအတွက်သာ</span>
                    <span className="text-[10px] opacity-80">
                      {money.format(receipt.data.outstanding ?? 0)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCollectScope("customer");
                      setCollectAmount(
                        String(ledger.data?.balance ?? receipt.data?.outstanding ?? 0),
                      );
                    }}
                    className={`btn btn-xs py-1 h-auto text-left flex flex-col items-start ${
                      collectScope === "customer"
                        ? "btn-primary"
                        : "btn-outline border-gray-300"
                    }`}
                  >
                    <span className="font-bold">အကြွေးအားလုံး</span>
                    <span className="text-[10px] opacity-80">
                      {money.format(ledger.data?.balance ?? receipt.data?.outstanding ?? 0)}
                    </span>
                  </button>
                </div>
              </div>

              {/* Amount Input */}
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
                  step="any"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  placeholder="0"
                  className="input input-bordered input-sm font-bold text-base text-gray-900"
                  autoFocus
                />
              </div>

              {/* Payment Method Selector */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    ပေးချေမှုနည်းလမ်း *
                  </span>
                </label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value)}
                  className="select select-bordered select-sm w-full font-medium"
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

              {/* Note / Remarks */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    မှတ်ချက် (မဖြည့်လည်းရ)
                  </span>
                </label>
                <input
                  value={collectNote}
                  onChange={(e) => setCollectNote(e.target.value)}
                  placeholder="ဥပမာ ငွေသားဖြင့်ဆပ်သည် / လွှဲငွေအမှတ်"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              {/* Modal Actions */}
              <div className="modal-action pt-2 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowCollectModal(false)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  disabled={
                    collectDebt.isPending ||
                    !Number(collectAmount) ||
                    Number(collectAmount) <= 0
                  }
                  className="btn btn-sm btn-primary font-bold px-4"
                >
                  {collectDebt.isPending
                    ? "မှတ်တမ်းတင်နေသည်…"
                    : `Confirm Payment (${money.format(Number(collectAmount) || 0)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
