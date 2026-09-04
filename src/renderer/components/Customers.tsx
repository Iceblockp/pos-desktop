import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Receipt } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Customers({ notify }: { notify: (s: string) => void }) {
  const empty = { id: "", name: "", phone: "", note: "" };
  const [modal, setModal] = useState<"customer" | "collect" | null>(null);
  const [form, setForm] = useState(empty);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [debtReceipt, setDebtReceipt] = useState<Receipt | null>(null);
  const client = useQueryClient();
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => window.storePos.pos.customers(),
  });
  const debtors = useQuery({
    queryKey: ["debtors"],
    queryFn: () => window.storePos.pos.debtors(),
  });
  const ledger = useQuery({
    queryKey: ["customer-ledger", form.id],
    queryFn: () => window.storePos.pos.customerLedger(form.id),
    enabled: modal === "customer" && Boolean(form.id),
  });
  const save = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveCustomer({
        id: form.id || undefined,
        name: form.name,
        phone: form.phone || null,
        note: form.note || null,
      }),
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ["customers"] });
      notify("Customer saved");
    },
    onError: (e: Error) => notify(e.message),
  });
  const collect = useMutation({
    mutationFn: () =>
      window.storePos.pos.collectDebt(
        customerId,
        Number(amount),
        method,
        note || undefined,
      ),
    onSuccess: (receipt) => {
      setDebtReceipt(receipt);
      setAmount("");
      setNote("");
      setCustomerId("");
      setModal(null);
      void client.invalidateQueries({ queryKey: ["debtors"] });
      void client.invalidateQueries({ queryKey: ["customer-ledger"] });
      notify("Debt payment saved");
    },
    onError: (e: Error) => notify(e.message),
  });
  const remove = useMutation({
    mutationFn: () => window.storePos.pos.removeCustomer(form.id),
    onSuccess: () => {
      setModal(null);
      setForm(empty);
      void client.invalidateQueries({ queryKey: ["customers"] });
      notify("Customer removed; sales history was kept.");
    },
    onError: (e: Error) => notify(e.message),
  });
  const openCollect = (id = "") => {
    setCustomerId(id);
    setModal("collect");
  };
  const edit = (customer: {
    id: string;
    name: string;
    phone: string | null;
    note: string | null;
  }) => {
    setForm({
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? "",
      note: customer.note ?? "",
    });
    setModal("customer");
  };
  return (
    <section className="h-full">
      {/* Header */}
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Customers & debts
          </h1>
          <p className="text-gray-600">
            See who owes money first, then manage customer details only when
            needed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setForm(empty);
              setModal("customer");
            }}
          >
            Add customer
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => openCollect()}
          >
            Collect debt
          </button>
        </div>
      </header>

      {/* Print Debt Receipt Button */}
      {debtReceipt && (
        <button
          className="btn btn-success mb-4"
          onClick={() =>
            window.storePos.printer
              .printReceipt(debtReceipt)
              .catch((error) => notify(error.message))
          }
        >
          Print last debt receipt
        </button>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Debts Panel */}
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4">Open debts</h2>
            <div className="space-y-2">
              {debtors.data?.length ? (
                debtors.data.map((debtor) => (
                  <div
                    key={debtor.id}
                    className="flex justify-between items-center p-3 rounded-lg border border-gray-200 hover:border-orange-500 hover:bg-orange-50 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">
                        {debtor.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {debtor.phone ?? "No phone"} · balance{" "}
                        {money.format(debtor.debt)}
                      </p>
                    </div>
                    <button
                      className="btn btn-sm btn-warning"
                      onClick={() => openCollect(debtor.id)}
                    >
                      Collect
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400">No customer debts.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customers Panel */}
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4">Customers</h2>
            <div className="space-y-2">
              {customers.data?.length ? (
                customers.data.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex justify-between items-center p-3 rounded-lg border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">
                        {customer.name}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {customer.phone ?? "No phone"}
                        {customer.note ? ` · ${customer.note}` : ""}
                      </p>
                    </div>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => edit(customer)}
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400">No customers yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Details Modal */}
      {modal === "customer" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">
                {form.id ? "Customer details" : "Add customer"}
              </h2>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                type="button"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Name</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Phone</span>
                </label>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Note</span>
                </label>
                <input
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <button
                className="btn btn-primary w-full"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save customer"}
              </button>
            </form>

            {form.id && (
              <>
                <div className="divider"></div>
                <h3 className="text-lg font-semibold mb-3">
                  Debt ledger · {money.format(ledger.data?.balance ?? 0)}
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {ledger.data?.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex justify-between items-start p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-semibold">{sale.voucherId}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(sale.soldAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{money.format(sale.total)}</p>
                        <p className="text-sm text-gray-500">
                          Remaining {money.format(sale.remaining)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {ledger.data?.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex justify-between items-start p-3 bg-green-50 rounded-lg"
                    >
                      <div>
                        <p className="font-semibold">
                          Payment · {payment.methodName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(payment.paidAt).toLocaleString()}
                          {payment.note ? ` · ${payment.note}` : ""}
                        </p>
                      </div>
                      <p className="font-bold text-red-600">
                        −{money.format(payment.amount)}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-error btn-outline w-full mt-4"
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${form.name}? Customers with outstanding debt cannot be removed.`,
                      )
                    )
                      remove.mutate();
                  }}
                >
                  Remove customer
                </button>
              </>
            )}
          </div>
          <div className="modal-backdrop" onClick={() => setModal(null)}></div>
        </div>
      )}

      {/* Collect Debt Modal */}
      {modal === "collect" && (
        <div className="modal modal-open">
          <form
            className="modal-box"
            onSubmit={(event) => {
              event.preventDefault();
              collect.mutate();
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Collect debt</h2>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                type="button"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Customer</span>
                </label>
                <select
                  required
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="select select-bordered w-full"
                >
                  <option value="">Choose customer</option>
                  {debtors.data?.map((debtor) => (
                    <option key={debtor.id} value={debtor.id}>
                      {debtor.name} · {money.format(debtor.debt)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Amount</span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Method</span>
                </label>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="select select-bordered w-full"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Note</span>
                </label>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="input input-bordered"
                />
              </div>

              <button
                className="btn btn-primary w-full"
                disabled={collect.isPending || !customerId}
              >
                {collect.isPending ? "Saving…" : "Record payment"}
              </button>
            </div>
          </form>
          <div className="modal-backdrop" onClick={() => setModal(null)}></div>
        </div>
      )}
    </section>
  );
}
