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
    <section className="h-full">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sales history</h1>
        <p className="text-gray-600">
          Find completed sales by voucher or customer, review their items,
          reprint receipts, and safely record returns.
        </p>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions Panel */}
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <div className="mb-4">
              <input
                autoFocus
                placeholder="Search voucher or customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input input-bordered w-full"
              />
            </div>

            <h2 className="text-xl font-semibold mb-4">Recent transactions</h2>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {sales.data?.length ? (
                sales.data.map((sale: SaleSummary) => (
                  <button
                    key={sale.id}
                    className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all"
                    onClick={() => choose(sale.voucherId)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">
                          {sale.voucherId}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {new Date(sale.soldAt).toLocaleString()} ·{" "}
                          {sale.customerName ?? "Walk-in"} ·{" "}
                          {sale.paymentMethod}
                        </p>
                      </div>
                      <p
                        className={`font-bold ml-4 ${sale.type === "return" ? "text-red-600" : "text-gray-900"}`}
                      >
                        {money.format(sale.total)}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400">No transactions found.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Receipt Details Panel */}
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4">
              {receipt.data ? receipt.data.voucherId : "Receipt details"}
            </h2>

            {receipt.isFetching ? (
              <div className="flex justify-center py-12">
                <span className="loading loading-spinner loading-lg text-green-600"></span>
              </div>
            ) : receipt.data ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {new Date(receipt.data.soldAt).toLocaleString()} ·{" "}
                  {receipt.data.paymentMethod}
                </p>

                {/* Receipt Lines */}
                <div className="space-y-3 border-t border-b border-gray-200 py-4">
                  {receipt.data.lines.map((line) => (
                    <div
                      key={line.productId}
                      className="flex justify-between items-start"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{line.name}</p>
                        <p className="text-sm text-gray-500">
                          {line.quantity} {line.unit} ×{" "}
                          {money.format(line.unitPrice)}
                        </p>
                      </div>
                      <p className="font-bold ml-4">
                        {money.format(
                          line.quantity * line.unitPrice - line.discount,
                        )}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center text-xl font-bold">
                  <span>Total</span>
                  <span className="text-green-600">
                    {money.format(receipt.data.total)}
                  </span>
                </div>

                {/* Print Button */}
                <button
                  className="btn btn-primary w-full"
                  onClick={() =>
                    window.storePos.printer
                      .printReceipt(receipt.data!)
                      .then(() => notify("Receipt sent to printer"))
                      .catch((e) => notify(e.message))
                  }
                >
                  Print receipt
                </button>

                {/* Return Items Section */}
                {returnable.data?.length ? (
                  <div className="mt-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <h3 className="text-lg font-semibold text-orange-900 mb-4">
                      Return items
                    </h3>

                    <div className="space-y-4">
                      {returnable.data.map((line) => (
                        <div key={line.productId} className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">
                              {line.name}
                            </span>
                            <span className="label-text-alt text-gray-600">
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
                            className="input input-bordered"
                          />
                        </div>
                      ))}

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">
                            Refund method
                          </span>
                        </label>
                        <select
                          value={refundMethod}
                          onChange={(e) => setRefundMethod(e.target.value)}
                          className="select select-bordered w-full"
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="transfer">Transfer</option>
                          <option value="debt">Customer credit</option>
                        </select>
                      </div>

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">Note</span>
                        </label>
                        <input
                          value={returnNote}
                          onChange={(e) => setReturnNote(e.target.value)}
                          className="input input-bordered"
                          placeholder="Optional return note"
                        />
                      </div>

                      <button
                        className="btn btn-warning w-full"
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
              <div className="text-center py-12">
                <p className="text-gray-400">
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
