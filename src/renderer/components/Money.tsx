import { useCapabilities } from '../useCapabilities';
import { PeriodFilter, usePeriod } from "./PeriodFilter";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CashSessionSummary } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function localDateTime(value: string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const COMMON_FLOATS = [10000, 20000, 50000, 100000];

export function Money({
  dashboard,
  notify,
}: {
  dashboard?: {
    salesToday: number;
    revenueToday: number;
    lowStock: number;
    pendingSync: number;
  };
  notify: (s: string, type?: "success" | "error" | "info") => void;
}) {
  const { range: selectedRange, label: periodLabel } = usePeriod();
  const range = selectedRange!;
  const capabilities = useCapabilities();

  const [activeTab, setActiveTab] = useState<"register" | "expenses" | "shifts">("register");

  // Modals
  const [modal, setModal] = useState<"open-session" | "close-session" | "expense" | null>(null);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");

  const emptyExpense = {
    id: "",
    name: "",
    amount: "",
    note: "",
    categoryId: "",
    spentAt: "",
  };
  const [expense, setExpense] = useState(emptyExpense);

  const client = useQueryClient();

  const session = useQuery({
    queryKey: ["cash-session"],
    queryFn: () => window.storePos.pos.cashSession(),
    refetchInterval: 10000,
  });

  const sessions = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: () => window.storePos.pos.cashSessions(),
  });

  const expenses = useQuery({
    queryKey: ["expenses", range.from, range.to],
    queryFn: () => window.storePos.pos.expenses(range.from, range.to),
  });

  const categories = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => window.storePos.pos.expenseCategories(),
  });

  const current = session.data;
  const isDrawerOpen = current?.status === "open";

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["cash-session"] });
    void client.invalidateQueries({ queryKey: ["cash-sessions"] });
    void client.invalidateQueries({ queryKey: ["expenses"] });
    void client.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const openSession = useMutation({
    mutationFn: () =>
      window.storePos.pos.openCashSession(Number(opening || 0)),
    onSuccess: () => {
      setModal(null);
      setOpening("");
      refresh();
      notify("Cash drawer session opened successfully", "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const closeSession = useMutation({
    mutationFn: () =>
      window.storePos.pos.closeCashSession(Number(counted)),
    onSuccess: (result) => {
      setModal(null);
      setCounted("");
      refresh();
      const diff = result.difference ?? 0;
      const diffText =
        diff === 0
          ? "Exact match"
          : diff > 0
            ? `Overage: +${money.format(diff)}`
            : `Shortage: -${money.format(Math.abs(diff))}`;
      notify(`Cash session closed. ${diffText}`, diff < 0 ? "error" : "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const saveExpense = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveExpense(
        expense.name.trim(),
        Number(expense.amount),
        expense.note.trim() || undefined,
        {
          id: expense.id || undefined,
          categoryId: expense.categoryId || null,
          spentAt: expense.spentAt ? new Date(expense.spentAt).toISOString() : undefined,
        },
      ),
    onSuccess: () => {
      setModal(null);
      setExpense(emptyExpense);
      refresh();
      notify("Expense recorded successfully", "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  const removeExpense = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeExpense(id),
    onSuccess: () => {
      refresh();
      notify("Expense removed", "success");
    },
    onError: (e: Error) => notify(e.message, "error"),
  });

  // Calculate live closing difference
  const expectedCash = current?.expectedCash ?? 0;
  const countedNum = Number(counted);
  const closingDifference = counted ? countedNum - expectedCash : null;

  // Expense totals for the period
  const totalExpenses =
    expenses.data?.reduce((sum, item) => sum + item.amount, 0) ?? 0;

  return (
    <section className="h-full flex flex-col gap-3">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            💵 Cash Register & Shift Reconciliation
          </h1>
          <p className="text-xs text-gray-500">
            Opening floats, physical cash counting, petty cash expenses, and shift audits
          </p>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" className="tabs tabs-boxed bg-gray-100 p-1 rounded-lg">
          <button
            role="tab"
            className={`tab tab-sm font-medium ${
              activeTab === "register"
                ? "tab-active bg-white shadow-sm font-semibold text-gray-900"
                : "text-gray-600"
            }`}
            onClick={() => setActiveTab("register")}
          >
            Live Register
          </button>
          <button
            role="tab"
            className={`tab tab-sm font-medium ${
              activeTab === "expenses"
                ? "tab-active bg-white shadow-sm font-semibold text-gray-900"
                : "text-gray-600"
            }`}
            onClick={() => setActiveTab("expenses")}
          >
            Petty Expenses ({expenses.data?.length ?? 0})
          </button>
          <button
            role="tab"
            className={`tab tab-sm font-medium ${
              activeTab === "shifts"
                ? "tab-active bg-white shadow-sm font-semibold text-gray-900"
                : "text-gray-600"
            }`}
            onClick={() => setActiveTab("shifts")}
          >
            Past Shifts Log
          </button>
        </div>
      </header>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* TAB 1: LIVE REGISTER */}
        {activeTab === "register" && (
          <div className="space-y-3">
            {/* Active Shift Status Banner */}
            <div
              className={`p-6 rounded-2xl border shadow-sm transition-all ${
                isDrawerOpen
                  ? "bg-gradient-to-br from-emerald-900 to-slate-900 text-white border-emerald-800"
                  : "bg-white border-gray-200 text-gray-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        isDrawerOpen
                          ? "bg-emerald-400 animate-pulse"
                          : "bg-gray-400"
                      }`}
                    />
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        isDrawerOpen ? "text-emerald-300" : "text-gray-500"
                      }`}
                    >
                      {isDrawerOpen ? "Drawer Session Active" : "Drawer Closed"}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {isDrawerOpen
                      ? "Cash Register is Open"
                      : "No Active Cash Session"}
                  </h2>
                  <p
                    className={`text-xs ${
                      isDrawerOpen ? "text-slate-300" : "text-gray-500"
                    }`}
                  >
                    {isDrawerOpen
                      ? `Shift opened on ${new Date(current!.openedAt).toLocaleString()}`
                      : "Start your cashier shift by counting and entering the opening float."}
                  </p>
                </div>

                <div>
                  {isDrawerOpen ? (
                    <button
                      onClick={() => {
                        setCounted("");
                        setModal("close-session");
                      }}
                      className="btn btn-warning btn-md font-bold shadow-md"
                    >
                      Close Drawer & Reconcile
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setOpening("");
                        setModal("open-session");
                      }}
                      className="btn btn-primary btn-md font-bold shadow-md"
                    >
                      + Open Cash Shift
                    </button>
                  )}
                </div>
              </div>

              {/* Cash Balances in Active Shift */}
              {isDrawerOpen && current && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 pt-5 border-t border-slate-700/80">
                  <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                    <span className="text-xs text-slate-300 font-medium">
                      Opening Float (Start of shift)
                    </span>
                    <p className="text-2xl font-black text-white mt-1">
                      {money.format(current.openingFloat)}
                    </p>
                  </div>

                  <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                    <span className="text-xs text-slate-300 font-medium">
                      Expected Cash in Drawer (Live)
                    </span>
                    <p className="text-2xl font-black text-emerald-400 mt-1">
                      {money.format(current.expectedCash ?? current.openingFloat)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Includes opening float + cash sales − cash refunds − cash expenses
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => {
                  setExpense(emptyExpense);
                  setModal("expense");
                }}
                className="p-4 rounded-xl border border-gray-200/80 bg-white shadow-sm hover:shadow-md hover:border-emerald-400 transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-sm text-gray-900">
                    Log Petty Cash Expense
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Record minor cash payouts (cleaning, ice, deliveries, supplies)
                  </p>
                </div>
                <button className="btn btn-sm btn-outline text-emerald-700 hover:bg-emerald-50">
                  + Add Expense
                </button>
              </div>

              <div
                onClick={() => setActiveTab("shifts")}
                className="p-4 rounded-xl border border-gray-200/80 bg-white shadow-sm hover:shadow-md hover:border-emerald-400 transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-sm text-gray-900">
                    Shift Audit History
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    View previous closed shifts and cash discrepancy logs
                  </p>
                </div>
                <button className="btn btn-sm btn-ghost text-gray-600">
                  View Log →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PETTY EXPENSES */}
        {activeTab === "expenses" && (
          <div className="space-y-3">
            <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                  Total Expenses ({periodLabel})
                </p>
                <p className="text-2xl font-black text-rose-700 mt-0.5">
                  {money.format(totalExpenses)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <PeriodFilter />
                <button
                  onClick={() => {
                    setExpense(emptyExpense);
                    setModal("expense");
                  }}
                  className="btn btn-primary btn-sm"
                >
                  + Record Expense
                </button>
              </div>
            </div>

            {/* Expense Table */}
            <div className="card bg-white shadow-sm border border-gray-200/80 overflow-hidden">
              <div className="card-body p-0 flex flex-col overflow-hidden">
                {expenses.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="table table-sm w-full">
                      <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Expense Name</th>
                          <th className="py-3 px-4 font-semibold">Category</th>
                          <th className="py-3 px-4 font-semibold">Date & Time</th>
                          <th className="py-3 px-4 font-semibold text-right">Amount</th>
                          <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {expenses.data.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition">
                            <td className="py-3 px-4">
                              <span className="font-bold text-sm text-gray-900 block">
                                {item.name}
                              </span>
                              {item.note && (
                                <span className="text-[11px] text-gray-500">
                                  {item.note}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="badge badge-ghost badge-sm text-[11px]">
                                {categories.data?.find((c) => c.id === item.categoryId)?.name ?? "Uncategorized"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                              {new Date(item.spentAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-sm text-rose-700 font-mono">
                              -{money.format(item.amount)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  className="btn btn-xs btn-ghost text-gray-600"
                                  onClick={() => {
                                    setExpense({
                                      id: item.id,
                                      name: item.name,
                                      amount: String(item.amount),
                                      note: item.note ?? "",
                                      categoryId: item.categoryId ?? "",
                                      spentAt: localDateTime(item.spentAt),
                                    });
                                    setModal("expense");
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-xs btn-ghost text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                  onClick={() => {
                                    if (window.confirm(`Delete expense "${item.name}"?`)) {
                                      removeExpense.mutate(item.id);
                                    }
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <span className="text-4xl mb-2">🧾</span>
                    <p className="text-base font-bold text-gray-700">No expenses logged</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Click "+ Record Expense" above to log store cash payouts.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PAST SHIFTS LOG */}
        {activeTab === "shifts" && (
          <div className="card bg-white shadow-sm border border-gray-200/80 overflow-hidden">
            <div className="card-body p-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-gray-900">
                    Previous Shift Audits
                  </h3>
                  <p className="text-xs text-gray-500">
                    History of closed cash sessions and register counts
                  </p>
                </div>
              </div>

              {sessions.data?.length ? (
                <div className="overflow-x-auto">
                  <table className="table table-sm w-full">
                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 text-xs">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Shift Dates</th>
                        <th className="py-3 px-4 font-semibold text-right">Opening Float</th>
                        <th className="py-3 px-4 font-semibold text-right">Expected Cash</th>
                        <th className="py-3 px-4 font-semibold text-right">Counted Cash</th>
                        <th className="py-3 px-4 font-semibold text-right">Discrepancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {sessions.data.map((s: CashSessionSummary) => {
                        const diff = s.difference ?? 0;
                        const isExact = diff === 0;
                        const isOver = diff > 0;
                        const isShort = diff < 0;

                        return (
                          <tr key={s.id} className="hover:bg-gray-50 transition">
                            <td className="py-3 px-4">
                              <p className="font-semibold text-gray-900">
                                Opened: {new Date(s.openedAt).toLocaleString()}
                              </p>
                              {s.closedAt && (
                                <p className="text-[11px] text-gray-500">
                                  Closed: {new Date(s.closedAt).toLocaleString()}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium text-gray-700">
                              {money.format(s.openingFloat)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium text-gray-700">
                              {s.expectedCash != null ? money.format(s.expectedCash) : "—"}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                              {s.countedCash != null ? money.format(s.countedCash) : "—"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {s.difference != null ? (
                                isExact ? (
                                  <span className="badge badge-success badge-sm text-white font-semibold">
                                    Exact (0.00)
                                  </span>
                                ) : isShort ? (
                                  <span className="badge badge-error badge-sm text-white font-bold">
                                    Short -{money.format(Math.abs(diff))}
                                  </span>
                                ) : (
                                  <span className="badge badge-info badge-sm text-white font-bold">
                                    Over +{money.format(diff)}
                                  </span>
                                )
                              ) : (
                                <span className="badge badge-ghost badge-sm">Open</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <span className="text-4xl mb-2">📋</span>
                  <p className="text-base font-bold text-gray-700">No shift history yet</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Closed drawer sessions will appear here with full count audits.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: OPEN CASH SHIFT */}
      {modal === "open-session" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                Open Cash Shift
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
                openSession.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Opening Float Amount *
                  </span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="e.g. 50,000"
                  className="input input-bordered input-sm font-bold text-base text-emerald-700"
                  autoFocus
                />
              </div>

              {/* Common Float Quick Chips */}
              <div>
                <span className="text-[11px] text-gray-500 font-medium mb-1.5 block">
                  Quick Float Presets:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {COMMON_FLOATS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setOpening(String(amt))}
                      className="btn btn-xs btn-outline border-gray-300 hover:bg-emerald-50 hover:border-emerald-400 font-medium"
                    >
                      {money.format(amt)}
                    </button>
                  ))}
                </div>
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
                  disabled={openSession.isPending}
                >
                  {openSession.isPending ? "Opening..." : "Confirm & Open"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CLOSE CASH SHIFT & RECONCILE */}
      {modal === "close-session" && current && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  Close Cash Drawer
                </h3>
                <p className="text-xs text-gray-500">
                  Count physical cash and reconcile the shift
                </p>
              </div>
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
                if (counted === "") return;
                closeSession.mutate();
              }}
              className="mt-4 space-y-4"
            >
              {/* Expected Cash Box */}
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                    Expected Cash in Drawer
                  </p>
                  <p className="text-2xl font-black mt-0.5 text-blue-900">
                    {money.format(expectedCash)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCounted(String(expectedCash))}
                  className="btn btn-xs btn-outline border-blue-400 text-blue-800 hover:bg-blue-200"
                >
                  Set Counted = Expected
                </button>
              </div>

              {/* Physical Counted Cash Input */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Physical Cash Counted *
                  </span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  placeholder="Enter total counted notes & coins..."
                  className="input input-bordered input-sm font-bold text-base"
                  autoFocus
                />
              </div>

              {/* Live Discrepancy Indicator */}
              {closingDifference !== null && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                    closingDifference === 0
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : closingDifference > 0
                        ? "bg-blue-50 border-blue-300 text-blue-900"
                        : "bg-rose-50 border-rose-300 text-rose-900"
                  }`}
                >
                  <span>Reconciliation Status:</span>
                  <span className="text-sm font-black">
                    {closingDifference === 0
                      ? "✓ Exact Match (0.00 difference)"
                      : closingDifference > 0
                        ? `+${money.format(closingDifference)} (Overage)`
                        : `-${money.format(Math.abs(closingDifference))} (Shortage)`}
                  </span>
                </div>
              )}

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
                  className="btn btn-sm btn-warning font-bold px-5"
                  disabled={closeSession.isPending || counted === ""}
                >
                  {closeSession.isPending ? "Reconciling..." : "Confirm & Close Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PETTY EXPENSE */}
      {modal === "expense" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                {expense.id ? "Edit Expense" : "Record Petty Expense"}
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
                if (!expense.name.trim() || Number(expense.amount) <= 0) return;
                saveExpense.mutate();
              }}
              className="mt-4 space-y-3"
            >
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Expense Title *
                  </span>
                </label>
                <input
                  required
                  value={expense.name}
                  onChange={(e) =>
                    setExpense({ ...expense, name: e.target.value })
                  }
                  placeholder="e.g. Ice bag, Shop cleaning, Delivery fee"
                  className="input input-bordered input-sm w-full"
                  autoFocus
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Amount Paid *
                  </span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.001"
                  value={expense.amount}
                  onChange={(e) =>
                    setExpense({ ...expense, amount: e.target.value })
                  }
                  placeholder="0.00"
                  className="input input-bordered input-sm font-bold text-sm text-rose-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">
                      Category
                    </span>
                  </label>
                  <select
                    className="select select-bordered select-sm w-full text-xs"
                    value={expense.categoryId}
                    onChange={(e) =>
                      setExpense({ ...expense, categoryId: e.target.value })
                    }
                  >
                    <option value="">Uncategorized</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">
                      Date & Time
                    </span>
                  </label>
                  <input
                    type="datetime-local"
                    className="input input-bordered input-sm w-full text-xs"
                    value={expense.spentAt}
                    onChange={(e) =>
                      setExpense({ ...expense, spentAt: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    Note / Receipt Remarks
                  </span>
                </label>
                <input
                  value={expense.note}
                  onChange={(e) =>
                    setExpense({ ...expense, note: e.target.value })
                  }
                  placeholder="Optional supplier or receipt details..."
                  className="input input-bordered input-sm w-full text-xs"
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
                    saveExpense.isPending ||
                    !expense.name.trim() ||
                    Number(expense.amount) <= 0
                  }
                >
                  {saveExpense.isPending ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
