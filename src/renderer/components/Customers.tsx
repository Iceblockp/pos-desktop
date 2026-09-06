import { useCapabilities } from '../useCapabilities';
import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Receipt } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Customers({ notify }: { notify: (s: string) => void }) {
  const capabilities=useCapabilities();
  const methods=useQuery({queryKey:['payment-methods'],queryFn:()=>window.storePos.pos.paymentMethods()});
  const [saleId,setSaleId]=useState(''),[paidAt,setPaidAt]=useState('');
  const empty = { id: "", name: "", phone: "", note: "" };
  const [modal, setModal] = useState<"customer" | "collect" | null>(null);
  const [form, setForm] = useState(empty);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [debtReceipt, setDebtReceipt] = useState<Receipt | null>(null);
  useEffect(() => {
    const active = methods.data?.filter(m => m.isActive && m.code !== 'debt');
    if (method !== 'debt' && active?.length && !active.some(m => m.code === method)) setMethod(active[0].code);
  }, [methods.data, method]);
  useEffect(() => { setSaleId(''); }, [customerId]);
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
  const collectionLedger=useQuery({queryKey:['customer-ledger',customerId],queryFn:()=>window.storePos.pos.customerLedger(customerId),enabled:modal==='collect'&&!!customerId});
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
        saleId || undefined, paidAt ? new Date(paidAt).toISOString() : undefined,
      ),
    onSuccess: (receipt) => {
      setDebtReceipt(receipt);
      setSaleId("");setPaidAt("");
      void client.invalidateQueries();
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
    if(!capabilities.debt){notify("Customer debt requires an active paid plan and an enabled Debt feature");return;}
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
    <section className="h-full flex flex-col">
      {/* Compact Header */}
      <header className="mb-3 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Customers & debts
          </h1>
          <p className="text-xs text-gray-500">
            Track outstanding debts and manage customer records
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-xs"
            onClick={() => {
              setForm(empty);
              setModal("customer");
            }}
          >
            Add customer
          </button>
          <button
            className="btn btn-primary btn-xs"
            onClick={() => openCollect()}
          >
            Collect debt
          </button>
        </div>
      </header>

      {/* Compact Print Debt Receipt Button */}
      {debtReceipt && (
        <button
          className="btn btn-success btn-sm mb-3"
          onClick={() =>
            window.storePos.printer
              .printReceipt(debtReceipt)
              .catch((error) => notify(error.message))
          }
        >
          Print last debt receipt
        </button>
      )}

      {/* Compact Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden">
        {/* Open Debts Panel */}
        <div className="card bg-white shadow-lg flex flex-col overflow-hidden">
          <div className="card-body p-3 flex flex-col overflow-hidden">
            <h2 className="text-sm font-semibold mb-2 text-gray-700">
              Open debts
            </h2>
            <div className="space-y-1 flex-1 overflow-y-auto">
              {debtors.data?.length ? (
                debtors.data.map((debtor) => (
                  <div
                    key={debtor.id}
                    className="flex justify-between items-center p-2 rounded border border-gray-200 hover:border-orange-500 hover:bg-orange-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900">
                        {debtor.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {debtor.phone ?? "No phone"} · balance{" "}
                        {money.format(debtor.debt)}
                      </p>
                    </div>
                    <button
                      className="btn btn-xs btn-warning"
                      onClick={() => openCollect(debtor.id)}
                    >
                      Collect
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">No customer debts.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customers Panel */}
        <div className="card bg-white shadow-lg flex flex-col overflow-hidden">
          <div className="card-body p-3 flex flex-col overflow-hidden">
            <h2 className="text-sm font-semibold mb-2 text-gray-700">
              Customers
            </h2>
            <div className="space-y-1 flex-1 overflow-y-auto">
              {customers.data?.length ? (
                customers.data.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex justify-between items-center p-2 rounded border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900">
                        {customer.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {customer.phone ?? "No phone"}
                        {customer.note ? ` · ${customer.note}` : ""}
                      </p>
                    </div>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => edit(customer)}
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">No customers yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Compact Customer Details Modal */}
      {modal === "customer" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">
              {form.id ? "Customer details" : "Add customer"}
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              type="button"
              onClick={() => setModal(null)}
            >
              ✕
            </button>

            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Name</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="input input-bordered input-sm"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Phone</span>
                </label>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="input input-bordered input-sm"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Note</span>
                </label>
                <input
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                  className="input input-bordered input-sm"
                />
              </div>

              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save customer"}
                </button>
              </div>
            </form>

            {form.id && (
              <>
                <div className="divider my-2"></div>
                <h3 className="text-sm font-semibold mb-2">
                  Debt ledger · {money.format(ledger.data?.balance ?? 0)}
                </h3>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {ledger.data?.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex justify-between items-start p-2 bg-gray-50 rounded"
                    >
                      <div>
                        <p className="font-semibold text-xs">
                          {sale.voucherId}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {new Date(sale.soldAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-xs">
                          {money.format(sale.total)}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Remaining {money.format(sale.remaining)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {ledger.data?.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex justify-between items-start p-2 bg-green-50 rounded"
                    >
                      <div>
                        <p className="font-semibold text-xs">
                          Payment · {payment.methodName}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {new Date(payment.paidAt).toLocaleString()}
                          {payment.note ? ` · ${payment.note}` : ""}
                        </p>
                      </div>
                      <p className="font-bold text-xs text-red-600">
                        −{money.format(payment.amount)}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-error btn-outline btn-sm w-full mt-3"
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

      {/* Compact Collect Debt Modal */}
      {modal === "collect" && capabilities.debt && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Collect debt</h3>
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              type="button"
              onClick={() => setModal(null)}
            >
              ✕
            </button>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                collect.mutate();
              }}
              className="space-y-3"
            >
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">
                    Customer
                  </span>
                </label>
                <select
                  required
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="select select-bordered select-sm w-full"
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
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Amount</span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="input input-bordered input-sm"
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Method</span>
                </label>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="select select-bordered select-sm w-full"
                >
                  {methods.data?.filter(m=>m.isActive&&m.code!=='debt').map(m=><option key={m.id} value={m.code}>{m.name}</option>)}
                </select>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Note</span>
                </label>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="input input-bordered input-sm"
                />
              </div>

              <label className="form-control text-xs">Apply to<select className="select select-bordered select-sm" value={saleId} onChange={e=>setSaleId(e.target.value)}><option value="">Customer balance (oldest first)</option>{collectionLedger.data?.sales.filter(s=>s.remaining>0).map(s=><option key={s.id} value={s.id}>{s.voucherId} · {s.remaining} due</option>)}</select></label>
              <label className="form-control text-xs">Payment date (optional)<input className="input input-bordered input-sm" type="datetime-local" value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></label>
              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={collect.isPending || !customerId}
                >
                  {collect.isPending ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
