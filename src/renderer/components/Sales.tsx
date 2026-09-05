import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Receipt, SaleSummary } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Sales({ notify }: { notify: (s: string) => void }) {
  const [search, setSearch] = useState("");
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<
    Record<string, string>
  >({});
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnNote, setReturnNote] = useState("");
  const client = useQueryClient();
  const sales = useQuery({
    queryKey: ["sales", search],
    queryFn: () => window.storePos.pos.sales(search),
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
    setReturnQuantities({});
    setReturnNote("");
  };
  return (
    <section className="h-full flex flex-col">
      {/* Compact Header */}
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Sales history</h1>
        <p className="text-xs text-gray-500">
          Search sales, view details, reprint receipts, and process returns
        </p>
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

                {/* Compact Print Button */}
                <button
                  className="btn btn-primary btn-sm w-full"
                  onClick={() =>
                    window.storePos.printer
                      .printReceipt(receipt.data!)
                      .then(() => notify("Receipt sent to printer"))
                      .catch((e) => notify(e.message))
                  }
                >
                  Print receipt
                </button>

                {/* Compact Return Items Section */}
                {returnable.data?.length ? (
                  <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <h3 className="text-sm font-semibold text-orange-900 mb-2">
                      Return items
                    </h3>

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
    </section>
  );
}
