import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Receipt, SaleSummary } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function dateRange(period: "today" | "week" | "month" | "all" | "custom"): {
  from: string;
  to: string;
} | null {
  if (period === "all" || period === "custom") return null;

  // Create separate date objects to avoid mutation issues
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  if (period === "week") from.setDate(from.getDate() - 6);
  if (period === "month") from.setDate(1);

  // Create end of day for 'to' to include all transactions today
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDateRange(
  period: string,
  customFrom?: string,
  customTo?: string,
): string {
  if (period === "all") return "All time";
  if (period === "today") return "Today";
  if (period === "week") return "Last 7 days";
  if (period === "month") return "This month";
  if (period === "custom" && customFrom && customTo) {
    const from = new Date(customFrom).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const to = new Date(customTo).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${from} - ${to}`;
  }
  return "Select range";
}

export function Sales({ notify }: { notify: (s: string) => void }) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<
    "today" | "week" | "month" | "all" | "custom"
  >("today"); // Changed default from "all" to "today"
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<
    Record<string, string>
  >({});
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnNote, setReturnNote] = useState("");
  const client = useQueryClient();

  const range = useMemo(() => {
    if (period === "custom" && customFrom && customTo) {
      const result = {
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo + "T23:59:59").toISOString(),
      };
      console.log("[Sales] Custom range:", result);
      return result;
    }
    const result = dateRange(period);
    console.log("[Sales] Period:", period, "Range:", result);
    return result;
  }, [period, customFrom, customTo]);
  const sales = useQuery({
    queryKey: ["sales", search, range?.from, range?.to],
    queryFn: async () => {
      console.log("[Sales Query] Calling backend with:", {
        search,
        from: range?.from,
        to: range?.to,
      });
      const result = await window.storePos.pos.sales(
        search,
        range?.from,
        range?.to,
      );
      console.log("[Sales Query] Backend returned:", result?.length, "sales");
      result?.forEach((sale: any, idx: number) => {
        console.log(`  [${idx}] ${sale.voucherId} - ${sale.soldAt}`);
      });
      return result;
    },
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache
  });
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
      ),
    onSuccess: (result) => {
      setShowReturn(false);
      setReturnQuantities({});
      setReturnNote("");
      setVoucherId(result.voucherId);
      void client.invalidateQueries({ queryKey: ["sales"] });
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["returnable-sale"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      notify(`Return saved: ${result.voucherId}`);
    },
    onError: (e: Error) => notify(e.message),
  });
  const choose = (id: string) => {
    setVoucherId(id);
    setShowReturn(false);
    setReturnQuantities({});
    setReturnNote("");
  };

  const handleReturnClick = () => {
    setShowReturn(true);
    setReturnQuantities({});
    setReturnNote("");
  };
  return (
    <section className="h-full flex flex-col">
      {/* Compact Header with Filter Button */}
      <header className="mb-3 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales history</h1>
          <p className="text-xs text-gray-500">
            {formatDateRange(period, customFrom, customTo)}
          </p>
        </div>
        <button
          className="btn btn-outline btn-sm gap-2"
          onClick={() => setShowFilterModal(true)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filter
        </button>
      </header>

      {/* Compact Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden">
        {/* Recent Transactions Panel */}
        <div className="card bg-white shadow-lg flex flex-col overflow-hidden">
          <div className="card-body p-3 flex flex-col overflow-hidden">
            <div className="mb-3">
              <input
                autoFocus
                placeholder="Search voucher or customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input input-bordered input-sm w-full"
              />
            </div>

            <h2 className="text-sm font-semibold mb-2 text-gray-700">
              Recent transactions
            </h2>

            <div className="space-y-1 flex-1 overflow-y-auto">
              {sales.data?.length ? (
                sales.data.map((sale: SaleSummary) => (
                  <button
                    key={sale.id}
                    className="w-full text-left p-2 rounded border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-colors"
                    onClick={() => choose(sale.voucherId)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">
                          {sale.voucherId}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {new Date(sale.soldAt).toLocaleString()} ·{" "}
                          {sale.customerName ?? "Walk-in"} ·{" "}
                          {sale.paymentMethod}
                        </p>
                      </div>
                      <p
                        className={`font-bold text-sm ${sale.type === "return" ? "text-red-600" : "text-gray-900"}`}
                      >
                        {money.format(sale.total)}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">
                    No transactions found.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Receipt Details Panel */}
        <div className="card bg-white shadow-lg flex flex-col overflow-hidden">
          <div className="card-body p-3 flex flex-col overflow-hidden">
            <h2 className="text-sm font-semibold mb-2 text-gray-700">
              {receipt.data ? receipt.data.voucherId : "Receipt details"}
            </h2>

            {receipt.isFetching ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-md text-green-600"></span>
              </div>
            ) : receipt.data ? (
              <div className="space-y-3 flex-1 overflow-y-auto">
                <p className="text-xs text-gray-600">
                  {new Date(receipt.data.soldAt).toLocaleString()} ·{" "}
                  {receipt.data.paymentMethod}
                </p>

                {/* Receipt Lines */}
                <div className="space-y-2 border-t border-b border-gray-200 py-2">
                  {receipt.data.lines.map((line) => (
                    <div
                      key={line.productId}
                      className="flex justify-between items-start gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs text-gray-900">
                          {line.name}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {line.quantity} {line.unit} ×{" "}
                          {money.format(line.unitPrice)}
                        </p>
                      </div>
                      <p className="font-bold text-sm">
                        {money.format(
                          line.quantity * line.unitPrice - line.discount,
                        )}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Compact Total */}
                <div className="flex justify-between items-center text-lg font-bold pt-2">
                  <span>Total</span>
                  <span className="text-green-600">
                    {money.format(receipt.data.total)}
                  </span>
                </div>

                {/* Compact Action Buttons */}
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary btn-sm flex-1"
                    onClick={() =>
                      window.storePos.printer
                        .printReceipt(receipt.data!)
                        .then(() => notify("Receipt sent to printer"))
                        .catch((e) => notify(e.message))
                    }
                  >
                    Print receipt
                  </button>
                  {returnable.data?.length && !showReturn ? (
                    <button
                      className="btn btn-warning btn-sm flex-1"
                      onClick={handleReturnClick}
                    >
                      Return
                    </button>
                  ) : null}
                </div>

                {/* Compact Return Items Section - Only show when button clicked */}
                {showReturn && returnable.data?.length ? (
                  <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-semibold text-orange-900">
                        Return items
                      </h3>
                      <button
                        className="btn btn-xs btn-circle btn-ghost"
                        onClick={() => setShowReturn(false)}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2">
                      {returnable.data.map((line) => (
                        <div key={line.productId} className="form-control">
                          <label className="label py-1">
                            <span className="label-text text-xs font-medium">
                              {line.name}
                            </span>
                            <span className="label-text-alt text-[10px] text-gray-600">
                              up to {line.returnable} {line.unit} ·{" "}
                              {money.format(line.refundPerUnit)} each
                            </span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={line.returnable}
                            inputMode="decimal"
                            placeholder="Return quantity"
                            value={returnQuantities[line.productId] ?? ""}
                            onChange={(e) =>
                              setReturnQuantities({
                                ...returnQuantities,
                                [line.productId]: e.target.value,
                              })
                            }
                            className="input input-bordered input-sm"
                          />
                        </div>
                      ))}

                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-xs font-medium">
                            Refund method
                          </span>
                        </label>
                        <select
                          value={refundMethod}
                          onChange={(e) => setRefundMethod(e.target.value)}
                          className="select select-bordered select-sm w-full"
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="transfer">Transfer</option>
                          <option value="debt">Customer credit</option>
                        </select>
                      </div>

                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-xs font-medium">
                            Note
                          </span>
                        </label>
                        <input
                          value={returnNote}
                          onChange={(e) => setReturnNote(e.target.value)}
                          className="input input-bordered input-sm"
                          placeholder="Optional return note"
                        />
                      </div>

                      <button
                        className="btn btn-warning btn-sm w-full mt-2"
                        disabled={returnSale.isPending}
                        onClick={() => returnSale.mutate()}
                      >
                        {returnSale.isPending
                          ? "Saving return…"
                          : "Record return"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">
                  Choose a transaction to view its receipt.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold">Filter by date</h2>
              <button
                type="button"
                className="btn btn-xs btn-circle btn-ghost"
                onClick={() => setShowFilterModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {/* Quick filter options */}
              <button
                className={`btn btn-sm w-full justify-start ${period === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setPeriod("all");
                  setShowFilterModal(false);
                }}
              >
                All time
              </button>
              <button
                className={`btn btn-sm w-full justify-start ${period === "today" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  console.log("[Filter] Setting period to: today");
                  setPeriod("today");
                  setShowFilterModal(false);
                }}
              >
                Today
              </button>
              <button
                className={`btn btn-sm w-full justify-start ${period === "week" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setPeriod("week");
                  setShowFilterModal(false);
                }}
              >
                Last 7 days
              </button>
              <button
                className={`btn btn-sm w-full justify-start ${period === "month" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setPeriod("month");
                  setShowFilterModal(false);
                }}
              >
                This month
              </button>

              <div className="divider my-2 text-xs">Custom range</div>

              {/* Custom date inputs */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">
                    From date
                  </span>
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  max={customTo || undefined}
                  className="input input-bordered input-sm"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">
                    To date
                  </span>
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  min={customFrom || undefined}
                  max={new Date().toISOString().split("T")[0]}
                  className="input input-bordered input-sm"
                />
              </div>

              <button
                className="btn btn-primary btn-sm w-full mt-3"
                disabled={!customFrom || !customTo}
                onClick={() => {
                  if (customFrom && customTo) {
                    setPeriod("custom");
                    setShowFilterModal(false);
                  }
                }}
              >
                Apply custom range
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => setShowFilterModal(false)}
          ></div>
        </div>
      )}
    </section>
  );
}
