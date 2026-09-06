import { useCapabilities } from '../useCapabilities';
import { PeriodFilter, usePeriod } from "./PeriodFilter";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });


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
  notify: (s: string) => void;
}) {
  const {range: selectedRange,label: periodLabel}=usePeriod();
  const range=selectedRange!;
  const capabilities=useCapabilities();
  const [modal, setModal] = useState<"cash" | "expense" | null>(null);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const emptyExpense={id:'',name:'',amount:'',note:'',categoryId:'',spentAt:''};
  const [expense,setExpense]=useState(emptyExpense);
  const categories=useQuery({queryKey:['expense-categories'],queryFn:()=>window.storePos.pos.expenseCategories()});
  const client = useQueryClient();


  const report = useQuery({
    queryKey: ["report", range.from, range.to],
    queryFn: () => window.storePos.pos.report(range.from, range.to),
    enabled:capabilities.owner,
  });
  const analytics = useQuery({
    queryKey: ["report-analytics", range.from, range.to],
    queryFn: () => window.storePos.pos.reportAnalytics(range.from, range.to),
    enabled:capabilities.owner,
  });
  const session = useQuery({
    queryKey: ["cash-session"],
    queryFn: () => window.storePos.pos.cashSession(),
  });
  const expenses = useQuery({
    queryKey: ["expenses",range.from,range.to],
    queryFn: () => window.storePos.pos.expenses(range.from,range.to),
  });
  const stock = useQuery({
    queryKey: ["stock-discrepancies"],
    queryFn: () => window.storePos.pos.stockDiscrepancies(),
  });
  const debtors = useQuery({
    queryKey: ["debtors"],
    queryFn: () => window.storePos.pos.debtors(),
  });

  const data = report.data;
  const revenue = data?.netSales ?? 0;
  const profit = data?.grossProfit ?? 0;
  const expenseTotal = data?.expenses ?? 0;
  const net = profit - expenseTotal;
  const saleCount = data?.saleCount ?? 0;
  const avgSale = saleCount > 0 ? revenue / saleCount : 0;
  const debt = debtors.data?.reduce((sum, debtor) => sum + debtor.debt, 0) ?? 0;
  const debtorCount = debtors.data?.length ?? 0;

  const current = session.data;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["cash-session"] });
    void client.invalidateQueries({ queryKey: ["expenses"] });
    void client.invalidateQueries({ queryKey: ["report"] });
    void client.invalidateQueries({ queryKey: ["dashboard"] });
    void client.invalidateQueries({ queryKey: ["debtors"] });
  };

  const openSession = useMutation({
    mutationFn: () => window.storePos.pos.openCashSession(Number(opening || 0)),
    onSuccess: () => {
      setModal(null);
      setOpening("");
      refresh();
      notify("Cash session opened");
    },
    onError: (e: Error) => notify(e.message),
  });

  const closeSession = useMutation({
    mutationFn: () => window.storePos.pos.closeCashSession(Number(counted)),
    onSuccess: (result) => {
      setModal(null);
      setCounted("");
      refresh();
      notify(
        `Cash session closed. Difference: ${money.format(result.difference)}`,
      );
    },
    onError: (e: Error) => notify(e.message),
  });

  const saveExpense = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveExpense(
        expense.name,
        Number(expense.amount),
        expense.note || undefined,
        {id:expense.id||undefined,categoryId:expense.categoryId||null,spentAt:expense.spentAt?new Date(expense.spentAt).toISOString():undefined},
      ),
    onSuccess: () => {
      setModal(null);
      setExpense(emptyExpense);
      refresh();
      notify("Expense saved");
    },
    onError: (e: Error) => notify(e.message),
  });

  return (
    <section className="flex-1 overflow-hidden flex flex-col">
      {/* Compact Header */}
      <header className="mb-3 flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Money & Reports</h2>
          <p className="text-xs text-gray-500">
            Financial overview · {periodLabel}
          </p>
        </div>
        <PeriodFilter/>
      </header>

      <div className="flex-1 overflow-y-auto space-y-3">
        {capabilities.owner && <>
        {/* Compact Revenue Card */}
        <div className="card bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg">
          <div className="card-body p-3">
            <p className="text-green-100 text-xs">Revenue · {periodLabel}</p>
            <p className="text-3xl font-bold">{money.format(revenue)}</p>
          </div>
        </div>

        {/* Compact Profit & Expenses Row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="stat bg-white shadow-lg rounded-lg p-3">
            <div className="stat-title text-xs">Profit</div>
            <div className="stat-value text-lg text-green-600">
              {money.format(profit)}
            </div>
          </div>
          <div
            className="stat bg-white shadow-lg rounded-lg p-3 cursor-pointer hover:shadow-xl transition-shadow"
            onClick={() => {if(capabilities.expenses){setExpense(emptyExpense);setModal("expense");}}}
          >
            <div className="stat-title text-xs">Expenses</div>
            <div className="stat-value text-lg text-orange-600">
              {money.format(expenseTotal)}
            </div>
            <div className="stat-desc text-[10px]">Click to add</div>
          </div>
        </div>

        {/* Compact Net Profit Card */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3 text-center">
            <p className="text-xs text-gray-600">Net Profit</p>
            <p
              className={`text-2xl font-bold ${net < 0 ? "text-red-600" : "text-green-600"}`}
            >
              {money.format(net)}
            </p>
            <p className="text-[10px] text-gray-500">After expenses</p>
          </div>
        </div>

        {/* Compact Payment Methods Breakdown */}
        {data?.payments && data.payments.length > 0 ? (
          <div className="card bg-white shadow-lg">
            <div className="card-body p-3">
              <h3 className="text-sm font-semibold mb-2 text-gray-700">
                Takings by method
              </h3>
              <div className="space-y-1">
                {data.payments.map((payment) => (
                  <div
                    key={payment.methodCode}
                    className="flex justify-between items-center py-1"
                  >
                    <span className="text-xs font-medium">
                      {payment.methodCode}
                    </span>
                    <span className="text-xs font-bold">
                      {money.format(payment.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Compact Outstanding Debt Card */}
        {debt > 0 ? (
          <div className="card bg-orange-50 border border-orange-300 shadow-lg">
            <div className="card-body p-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-orange-900">
                  Outstanding Debt
                </span>
                <span className="text-lg font-bold text-orange-600">
                  {money.format(debt)}
                </span>
              </div>
              <p className="text-[10px] text-orange-700 mt-1">
                {debtorCount} customer{debtorCount !== 1 ? "s" : ""} with debt
              </p>
            </div>
          </div>
        ) : null}

        {/* Compact Sale Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="stat bg-white shadow-lg rounded-lg p-2">
            <div className="stat-title text-[10px]">Sales Count</div>
            <div className="stat-value text-base">{saleCount}</div>
          </div>
          <div className="stat bg-white shadow-lg rounded-lg p-2">
            <div className="stat-title text-[10px]">Average Sale</div>
            <div className="stat-value text-base">{money.format(avgSale)}</div>
          </div>
        </div>

        {/* Compact Stock Discrepancies Warning */}
        {stock.data && stock.data.length > 0 ? (
          <div className="alert alert-warning shadow-lg py-2">
            <div className="w-full">
              <h3 className="font-bold text-sm mb-1">⚠️ Stock Discrepancies</h3>
              <p className="text-xs mb-2">
                Products with negative stock levels:
              </p>
              <div className="space-y-1">
                {stock.data.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center py-1 px-2 bg-white rounded"
                  >
                    <span className="text-xs font-medium">{item.name}</span>
                    <span className="text-xs font-bold text-red-600">
                      {item.quantity} in stock
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Compact Top Products */}
        {analytics.data?.topProducts &&
        analytics.data.topProducts.length > 0 ? (
          <div className="card bg-white shadow-lg">
            <div className="card-body p-3">
              <h3 className="text-sm font-semibold mb-2 text-gray-700">
                Top Selling Products
              </h3>
              <div className="space-y-1">
                {analytics.data.topProducts.map((product, index) => (
                  <div
                    key={product.productName}
                    className="flex items-start py-1 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-base font-bold text-gray-400 mr-2">
                      #{index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {product.productName}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {product.quantity} sold ·{" "}
                        {money.format(product.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        </>}
        {/* Compact Cash Session Card */}
        {capabilities.dayEnd && <>
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Cash Session
              </h3>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => setModal("cash")}
              >
                {current ? "Close" : "Open"}
              </button>
            </div>
            {current ? (
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500">
                  Opened {new Date(current.openedAt).toLocaleString()}
                </p>
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs">Opening float</span>
                  <span className="text-xs font-bold">
                    {money.format(current.openingFloat)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs">Expected cash</span>
                  <span className="text-xs font-bold">
                    {money.format(current.expectedCash)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-gray-400">
                  No cash session is currently open.
                </p>
              </div>
            )}
          </div>
        </div>

        </>}
        {/* Compact Recent Expenses */}
        {capabilities.expenses && <>
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Recent Expenses
              </h3>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => {setExpense(emptyExpense);setModal("expense");}}
              >
                Add
              </button>
            </div>
            {expenses.data && expenses.data.length > 0 ? (
              <div className="space-y-1">
                {expenses.data
                  .slice(0)
                  .map(
                    (item: {
                      id: string;
                      name: string;
                      amount: number;
                      note: string | null;
                      spentAt: string;
                      categoryId?: string | null;
                    }) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-start py-1 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {item.note ??
                              new Date(item.spentAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="text-xs font-bold ml-2">
                          {money.format(item.amount)}
                          <button className="btn btn-xs ml-2" onClick={()=>{setExpense({id:item.id,name:item.name,amount:String(item.amount),note:item.note??'',categoryId:item.categoryId??'',spentAt:localDateTime(item.spentAt)});setModal('expense');}}>Edit</button>
                          <button className="btn btn-xs ml-1" onClick={()=>{if(window.confirm('Remove this expense?'))void window.storePos.pos.removeExpense(item.id).then(refresh).catch(e=>notify(e.message));}}>Remove</button>
                        </span>
                      </div>
                    ),
                  )}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-gray-400">
                  No expenses recorded in this period.
                </p>
              </div>
            )}
          </div>
        </div>
        </>}
      </div>

      {/* Compact Cash Session Modal */}
      {modal === "cash" && capabilities.dayEnd && (
        <div className="modal modal-open">
          <form
            className="modal-box max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              current ? closeSession.mutate() : openSession.mutate();
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold">
                {current ? "Close Cash Session" : "Open Cash Session"}
              </h2>
              <button
                type="button"
                className="btn btn-xs btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {current ? (
                <>
                  <div className="alert alert-info py-2">
                    <span className="text-xs">
                      Expected cash:{" "}
                      <strong>{money.format(current.expectedCash)}</strong>
                    </span>
                  </div>
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-medium">
                        Counted cash
                      </span>
                    </label>
                    <input
                      required
                      type="number"
                      inputMode="decimal"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                      autoFocus
                      className="input input-bordered input-sm"
                    />
                  </div>
                </>
              ) : (
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-medium">
                      Opening float
                    </span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={opening}
                    onChange={(e) => setOpening(e.target.value)}
                    autoFocus
                    className="input input-bordered input-sm"
                  />
                </div>
              )}
              <button
                className="btn btn-primary btn-sm w-full"
                disabled={openSession.isPending || closeSession.isPending}
              >
                {current ? "Close Session" : "Open Session"}
              </button>
            </div>
          </form>
          <div className="modal-backdrop" onClick={() => setModal(null)}></div>
        </div>
      )}

      {/* Compact Expense Modal */}
      {modal === "expense" && capabilities.expenses && (
        <div className="modal modal-open">
          <form
            className="modal-box max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              saveExpense.mutate();
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold">Add Expense</h2>
              <button
                type="button"
                className="btn btn-xs btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Name</span>
                </label>
                <input
                  required
                  value={expense.name}
                  onChange={(e) =>
                    setExpense({ ...expense, name: e.target.value })
                  }
                  autoFocus
                  className="input input-bordered input-sm"
                />
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Amount</span>
                </label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  value={expense.amount}
                  onChange={(e) =>
                    setExpense({ ...expense, amount: e.target.value })
                  }
                  className="input input-bordered input-sm"
                />
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Note</span>
                </label>
                <input
                  value={expense.note}
                  onChange={(e) =>
                    setExpense({ ...expense, note: e.target.value })
                  }
                  className="input input-bordered input-sm"
                />
              </div>
              <label className="form-control text-xs">Date<input type="datetime-local" className="input input-bordered input-sm" value={expense.spentAt} onChange={e=>setExpense({...expense,spentAt:e.target.value})}/></label>
              <label className="form-control text-xs">Category<select className="select select-bordered select-sm" value={expense.categoryId} onChange={e=>setExpense({...expense,categoryId:e.target.value})}><option value="">Uncategorized</option>{categories.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <button
                className="btn btn-primary btn-sm w-full"
                disabled={saveExpense.isPending}
              >
                {saveExpense.isPending ? "Saving…" : "Save Expense"}
              </button>
            </div>
          </form>
          <div className="modal-backdrop" onClick={() => setModal(null)}></div>
        </div>
      )}
    </section>
  );
}

function localDateTime(value:string):string {const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16);}
