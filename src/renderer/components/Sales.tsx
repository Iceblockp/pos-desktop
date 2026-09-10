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
      void client.invalidateQueries({ queryKey: ["sales"] });
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["returnable-sale"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      notify(`Return processed: #${result.voucherId}`, "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  // Print helper with toast
  const handlePrint = (r: Receipt) => {
    window.storePos.printer
      .printReceipt(r)
      .then(() => notify(`Receipt #${r.voucherId} printed`, "success"))
      .catch((e) => notify(e.message, "error"));
  };

  // Keyboard shortcuts: Ctrl+P / Cmd+P to print, Escape to close return modal
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
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [receipt.data, showReturnModal]);

  // Summary Metrics
  const rawList = sales.data?.items ?? [];
  const totalVolume = salesSummary.data?.netVolume ?? 0;
  const returnCount = salesSummary.data?.returns ?? 0;
  const debtCount = salesSummary.data?.debt ?? 0;
  const filteredSales = rawList;

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
            📊 Sales History & Receipts
          </h1>
          <p className="text-xs text-gray-500">
            {periodLabel} · Showing {offset + 1}-{offset + filteredSales.length} of {sales.data?.total ?? 0} transactions
          </p>
        </div>

        <div className="flex items-center gap-3">
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
              Transactions
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
              Net Sales Volume
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
              On Account (Credit)
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
              Refunds / Returns
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
              placeholder="Search voucher # or customer name..."
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
                const isDebt =
                  sale.paymentMethod === "debt" ||
                  sale.paymentMethod === "On Account";

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
                              Return
                            </span>
                          ) : isDebt ? (
                            <span className="badge badge-warning badge-xs">
                              On Account
                            </span>
                          ) : (
                            <span className="badge badge-success badge-xs text-white">
                              Paid
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-600 truncate">
                          {sale.customerName ? (
                            <strong className="text-gray-900">
                              {sale.customerName}
                            </strong>
                          ) : (
                            "Walk-in Customer"
                          )}{" "}
                          · {sale.paymentMethod}
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
                          {isReturn ? `-${money.format(sale.total)}` : money.format(sale.total)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              <div className="flex items-center justify-between py-3 text-xs text-gray-500"><span>Current page: {filteredSales.length} rows</span><div className="flex gap-2"><button className="btn btn-xs" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button className="btn btn-xs" disabled={offset + filteredSales.length >= (sales.data?.total ?? 0)} onClick={() => setOffset(offset + 50)}>Next 50</button></div></div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <span className="text-3xl mb-1">🧾</span>
                <p className="text-sm font-medium">No transactions found</p>
                <p className="text-xs">Adjust your search query or period filter</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Thermal-Style Receipt Preview */}
        <div className="flex flex-col bg-white rounded-xl border border-gray-200/80 shadow-lg overflow-hidden">
          {receipt.isFetching ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <span className="loading loading-spinner loading-md text-emerald-600 mb-2"></span>
              <p className="text-xs font-medium">Loading receipt...</p>
            </div>
          ) : receipt.data ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Receipt Header Bar */}
              <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-gray-800 font-mono">
                    Receipt #{receipt.data.voucherId}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {new Date(receipt.data.soldAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {returnable.data && returnable.data.length > 0 && (
                    <button
                      onClick={() => setShowReturnModal(true)}
                      className="btn btn-warning btn-xs font-semibold"
                    >
                      ↩ Return
                    </button>
                  )}
                  <button
                    onClick={() => handlePrint(receipt.data!)}
                    className="btn btn-primary btn-xs font-bold gap-1 shadow-sm"
                    title="Print Receipt (Ctrl+P / Cmd+P)"
                  >
                    <span>🖨️</span>
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* Receipt Body (Paper Aesthetic) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Store Header & Customer Info */}
                <div className="text-center pb-3 border-b border-dashed border-gray-200">
                  <h2 className="font-black text-lg text-gray-900 tracking-tight">
                    {receipt.data.shopName || "STORE POS"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    Customer:{" "}
                    <strong>
                      {sales.data?.items.find((s) => s.voucherId === receipt.data?.voucherId)?.customerName || "Walk-in Customer"}
                    </strong>
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Payment: {receipt.data.paymentMethod}
                  </p>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between pb-1 border-b border-gray-100">
                    <span>Item</span>
                    <span>Total</span>
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
                      Total
                    </span>
                    <span className="text-xl font-black text-emerald-700">
                      {money.format(receipt.data.total)}
                    </span>
                  </div>

                  {receipt.data.change != null && receipt.data.change > 0 && (
                    <div className="flex justify-between text-emerald-800 bg-emerald-50 p-2 rounded font-semibold mt-1">
                      <span>Change Given</span>
                      <span className="font-mono">
                        {money.format(receipt.data.change)}
                      </span>
                    </div>
                  )}

                  {!!receipt.data.outstanding && (
                    <div className="flex justify-between text-amber-800 bg-amber-50 p-2 rounded font-semibold mt-1">
                      <span>Outstanding Balance</span>
                      <span className="font-mono">
                        {money.format(receipt.data.outstanding)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-center pt-4 text-[11px] text-gray-400">
                  <p>Thank you for your visit!</p>
                  <p className="font-mono mt-0.5 text-[10px]">
                    Press Cmd+P / Ctrl+P to reprint
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
              <span className="text-4xl mb-2">🧾</span>
              <p className="text-sm font-semibold text-gray-700">
                Select a transaction
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Click any sale from the left list to view its receipt breakdown and options.
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
                  Process Return / Refund
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Receipt #{voucherId}
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
                  Select items to return:
                </span>
                <button
                  type="button"
                  onClick={handleReturnAll}
                  className="btn btn-xs btn-outline font-semibold"
                >
                  Return All Items
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
                        Up to {line.returnable} {line.unit} · {money.format(line.refundPerUnit)} each
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
                  Total Refund Amount:
                </span>
                <span className="text-base font-black text-rose-700">
                  {money.format(calculatedRefundTotal)}
                </span>
              </div>

              {/* Refund Method */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Refund Payment Method
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
                    <option value="debt">Customer Credit Account</option>
                  )}
                </select>
              </div>

              {/* Return Reason Note */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Reason / Note (optional)
                  </span>
                </label>
                <input
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="e.g. Expired, damaged packaging, wrong size"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="modal-action pt-2 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowReturnModal(false)}
                >
                  Cancel
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
                    ? "Processing..."
                    : `Confirm Return · ${money.format(calculatedRefundTotal)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
