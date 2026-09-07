import { useCapabilities } from '../useCapabilities';
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer, Receipt } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Customers({ notify }: { notify: (s: string, type?: "success" | "error" | "info") => void }) {
  const capabilities = useCapabilities();
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => window.storePos.pos.paymentMethods(),
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "debt" | "clear">("all");

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

  const client = useQueryClient();

  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => window.storePos.pos.customers(),
  });

  const debtors = useQuery({
    queryKey: ["debtors"],
    queryFn: () => window.storePos.pos.debtors(),
  });

  const activeCustomer = useMemo(
    () => customers.data?.find((c) => c.id === selectedCustomerId) ?? null,
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
      void client.invalidateQueries({ queryKey: ["customers"] });
      void client.invalidateQueries({ queryKey: ["debtors"] });
      notify(`Customer ${saved.name} saved`, "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const removeCustomer = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeCustomer(id),
    onSuccess: () => {
      setModal(null);
      setSelectedCustomerId("");
      setCustomerForm(emptyCustomer);
      void client.invalidateQueries({ queryKey: ["customers"] });
      void client.invalidateQueries({ queryKey: ["debtors"] });
      notify("Customer profile removed; sales history preserved.", "success");
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
      notify("Debt payment recorded successfully", "success");
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
      notify("Customer debt requires an active plan and Debt feature", "error");
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
  const rawCustomers = customers.data ?? [];
  const totalCustomerCount = rawCustomers.length;
  const debtorCount = debtors.data?.length ?? 0;
  const totalReceivables = debtors.data?.reduce((sum, d) => sum + d.debt, 0) ?? 0;

  // Filtered List
  const filteredCustomers = useMemo(() => {
    return rawCustomers.filter((c) => {
      const debt = debtMap.get(c.id) ?? 0;
      if (filter === "debt" && debt <= 0) return false;
      if (filter === "clear" && debt > 0) return false;

      if (search) {
        const term = search.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(term);
        const matchesPhone = c.phone?.toLowerCase().includes(term);
        const matchesNote = c.note?.toLowerCase().includes(term);
        if (!matchesName && !matchesPhone && !matchesNote) return false;
      }
      return true;
    });
  }, [rawCustomers, debtMap, filter, search]);

  return (
    <section className="h-full flex flex-col gap-3">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            👥 Customers & Credit Accounts
          </h1>
          <p className="text-xs text-gray-500">
            Manage customer directories, track outstanding balances, and collect debt
          </p>
        </div>

        <div className="flex items-center gap-2">
          {debtReceipt && (
            <button
              onClick={() => {
                window.storePos.printer
                  .printReceipt(debtReceipt)
                  .then(() => notify("Debt receipt sent to printer", "success"))
                  .catch((e) => notify(e.message, "error"));
              }}
              className="btn btn-outline btn-xs font-semibold gap-1 text-emerald-700 hover:bg-emerald-50"
            >
              <span>🖨️</span>
              <span>Reprint Last Debt Receipt</span>
            </button>
          )}
          <button onClick={openNewCustomer} className="btn btn-primary btn-sm">
            + New Customer
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
              Total Customers
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
              Active Debtors
            </p>
            <p className="text-xl font-black mt-0.5">{debtorCount}</p>
          </div>
          <span className="text-2xl">⚠️</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">
              Total Outstanding Receivables
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
              placeholder="Search customer by name, phone, or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-bordered input-sm w-full pl-9 text-xs bg-gray-50 focus:bg-white"
              autoFocus
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setFilter("all")}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                filter === "all"
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              All ({totalCustomerCount})
            </button>
            <button
              onClick={() => setFilter("debt")}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                filter === "debt"
                  ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              With Debt ({debtorCount})
            </button>
            <button
              onClick={() => setFilter("clear")}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                filter === "clear"
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              Zero Balance ({totalCustomerCount - debtorCount})
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
                    <th className="py-3 px-4 font-semibold">Customer Name</th>
                    <th className="py-3 px-4 font-semibold">Phone Number</th>
                    <th className="py-3 px-4 font-semibold">Outstanding Debt</th>
                    <th className="py-3 px-4 font-semibold">Note / Remarks</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredCustomers.map((c) => {
                    const debt = debtMap.get(c.id) ?? 0;
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
                              Owes {money.format(debt)}
                            </span>
                          ) : (
                            <span className="badge badge-ghost badge-sm text-gray-400 bg-gray-50">
                              Clear (0.00)
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
                                Collect
                              </button>
                            )}
                            <button
                              className="btn btn-xs btn-outline border-gray-300 text-gray-700 hover:bg-gray-100"
                              onClick={() => openLedger(c.id)}
                            >
                              Ledger
                            </button>
                            <button
                              className="btn btn-xs btn-ghost text-gray-600 hover:bg-gray-100"
                              onClick={() => openEditCustomer(c)}
                            >
                              Edit
                            </button>
                            {!hasDebt && (
                              <button
                                className="btn btn-xs btn-ghost text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Remove customer "${c.name}"? Past sales will remain preserved.`,
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
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400">
              <span className="text-4xl mb-2">👥</span>
              <p className="text-base font-bold text-gray-700">
                No customers found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Try searching a different name/phone or clear your filters.
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
                {customerForm.id ? "Edit Customer" : "New Customer"}
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
                    Customer Name *
                  </span>
                </label>
                <input
                  required
                  value={customerForm.name}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, name: e.target.value })
                  }
                  placeholder="e.g. Daw Khin, Ko Aung"
                  className="input input-bordered input-sm w-full"
                  autoFocus
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Phone Number
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
                    Note / Address
                  </span>
                </label>
                <textarea
                  value={customerForm.note}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, note: e.target.value })
                  }
                  placeholder="Optional delivery address or remarks..."
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={saveCustomer.isPending || !customerForm.name.trim()}
                >
                  {saveCustomer.isPending ? "Saving..." : "Save Customer"}
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
                  {activeCustomer.phone || "No phone recorded"}
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
                  Current Account Balance
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
                  Collect Debt Payment
                </button>
              )}
            </div>

            {/* Ledger Transactions: Credit Purchases vs Repayments */}
            <div className="flex-1 overflow-y-auto space-y-3">
              <div>
                <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2">
                  Unpaid / Credit Sales
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
                            Total: {money.format(sale.total)}
                          </p>
                          <p className="text-[11px] font-semibold text-amber-700">
                            Remaining: {money.format(sale.remaining)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-2">
                    No credit sales on record.
                  </p>
                )}
              </div>

              <div className="divider my-1"></div>

              <div>
                <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2">
                  Repayment History
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
                            Repayment ({p.methodName})
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
                    No debt repayments recorded yet.
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
                Close
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => openEditCustomer(activeCustomer)}
              >
                Edit Profile
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
                Collect Debt Payment
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
                    Debtor Customer *
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
                  <option value="">Select a customer...</option>
                  {debtors.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Owes {money.format(d.debt)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Outstanding Debt Info & Full Balance Chip */}
              {selectedCustomerId && (debtMap.get(selectedCustomerId) ?? 0) > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-amber-800">Total Owed:</span>{" "}
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
                    Pay Full Balance
                  </button>
                </div>
              )}

              {/* Payment Amount */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Amount Received *
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
                    Payment Method *
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
                    Allocation
                  </span>
                </label>
                <select
                  className="select select-bordered select-sm w-full text-xs"
                  value={collectSaleId}
                  onChange={(e) => setCollectSaleId(e.target.value)}
                >
                  <option value="">Apply to oldest unpaid debt first</option>
                  {ledger.data?.sales
                    .filter((s) => s.remaining > 0)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Voucher #{s.voucherId} ({money.format(s.remaining)} remaining)
                      </option>
                    ))}
                </select>
              </div>

              {/* Note */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Note / Receipt Remarks
                  </span>
                </label>
                <input
                  value={collectNote}
                  onChange={(e) => setCollectNote(e.target.value)}
                  placeholder="e.g. Settled via cash / transfer reference"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="modal-action pt-2 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setModal(null)}
                >
                  Cancel
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
                    ? "Recording..."
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
