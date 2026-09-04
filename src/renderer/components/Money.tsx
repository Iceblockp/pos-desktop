import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function reportRange(period: 'today' | 'week' | 'month'): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'week') from.setDate(from.getDate() - 6);
  if (period === 'month') from.setDate(1);
  return { from: from.toISOString(), to: now.toISOString() };
}

export function Money({ dashboard, notify }: { dashboard?: { salesToday: number; revenueToday: number; lowStock: number; pendingSync: number }; notify: (s: string) => void }) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [modal, setModal] = useState<'cash' | 'expense' | null>(null);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [expense, setExpense] = useState({ name: '', amount: '', note: '' });
  const client = useQueryClient();
  
  const range = useMemo(() => reportRange(period), [period]);
  const report = useQuery({ queryKey: ['report', range.from, range.to], queryFn: () => window.storePos.pos.report(range.from, range.to) });
  const analytics = useQuery({ queryKey: ['report-analytics', range.from, range.to], queryFn: () => window.storePos.pos.reportAnalytics(range.from, range.to) });
  const session = useQuery({ queryKey: ['cash-session'], queryFn: () => window.storePos.pos.cashSession() });
  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => window.storePos.pos.expenses() });
  const stock = useQuery({ queryKey: ['stock-discrepancies'], queryFn: () => window.storePos.pos.stockDiscrepancies() });
  const debtors = useQuery({ queryKey: ['debtors'], queryFn: () => window.storePos.pos.debtors() });
  
  const data = report.data;
  const revenue = data?.grossSales ?? 0;
  const profit = data?.grossProfit ?? 0;
  const expenseTotal = data?.expenses ?? 0;
  const net = profit - expenseTotal;
  const saleCount = data?.saleCount ?? 0;
  const avgSale = saleCount > 0 ? revenue / saleCount : 0;
  const debt = debtors.data?.reduce((sum, debtor) => sum + debtor.debt, 0) ?? 0;
  const debtorCount = debtors.data?.length ?? 0;
  
  const periodLabel = period === 'today' ? 'Today' : period === 'week' ? 'Last 7 days' : 'This month';
  const current = session.data;
  
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['cash-session'] });
    void client.invalidateQueries({ queryKey: ['expenses'] });
    void client.invalidateQueries({ queryKey: ['report'] });
    void client.invalidateQueries({ queryKey: ['dashboard'] });
    void client.invalidateQueries({ queryKey: ['debtors'] });
  };
  
  const openSession = useMutation({
    mutationFn: () => window.storePos.pos.openCashSession(Number(opening || 0)),
    onSuccess: () => { setModal(null); setOpening(''); refresh(); notify('Cash session opened'); },
    onError: (e: Error) => notify(e.message)
  });
  
  const closeSession = useMutation({
    mutationFn: () => window.storePos.pos.closeCashSession(Number(counted)),
    onSuccess: (result) => { setModal(null); setCounted(''); refresh(); notify(`Cash session closed. Difference: ${money.format(result.difference)}`); },
    onError: (e: Error) => notify(e.message)
  });
  
  const saveExpense = useMutation({
    mutationFn: () => window.storePos.pos.saveExpense(expense.name, Number(expense.amount), expense.note || undefined),
    onSuccess: () => { setModal(null); setExpense({ name: '', amount: '', note: '' }); refresh(); notify('Expense saved'); },
    onError: (e: Error) => notify(e.message)
  });
  
  return (
    <section>
      <header>
        <div>
          <h1>Money & Reports</h1>
          <p>Financial overview with expenses, profits, payment breakdowns, and key metrics for the selected period.</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">This month</option>
        </select>
      </header>
      
      {/* Hero Revenue Card */}
      <div className="panel hero-card">
        <span>Revenue · {periodLabel}</span>
        <b className="hero-amount">{money.format(revenue)}</b>
      </div>
      
      {/* Profit & Expenses Row */}
      <div className="metrics">
        <div className="metric">
          <span>Profit</span>
          <b>{money.format(profit)}</b>
        </div>
        <div className="metric clickable" onClick={() => setModal('expense')}>
          <span>Expenses</span>
          <b>{money.format(expenseTotal)}</b>
          <small className="hint">Click to add</small>
        </div>
      </div>
      
      {/* Net Profit Card */}
      <div className="panel net-card">
        <span>Net Profit</span>
        <b className={net < 0 ? 'negative hero-amount' : 'hero-amount'}>{money.format(net)}</b>
        <small>After expenses</small>
      </div>
      
      {/* Payment Methods Breakdown */}
      {data?.payments && data.payments.length > 0 ? (
        <div className="panel table">
          <h2>Takings by method</h2>
          {data.payments.map((payment) => (
            <div className="row" key={payment.methodCode}>
              <b>{payment.methodCode}</b>
              <b>{money.format(payment.total)}</b>
            </div>
          ))}
        </div>
      ) : null}
      
      {/* Outstanding Debt Card */}
      {debt > 0 ? (
        <div className="panel debt-card">
          <div className="row">
            <span>Outstanding Debt</span>
            <b className="debt-amount">{money.format(debt)}</b>
          </div>
          <small>{debtorCount} customer{debtorCount !== 1 ? 's' : ''} with debt</small>
        </div>
      ) : null}
      
      {/* Sale Stats */}
      <div className="metrics">
        <div className="metric">
          <span>Sales Count</span>
          <b>{saleCount}</b>
        </div>
        <div className="metric">
          <span>Average Sale</span>
          <b>{money.format(avgSale)}</b>
        </div>
      </div>
      
      {/* Stock Discrepancies Warning */}
      {stock.data && stock.data.length > 0 ? (
        <div className="panel warning-card">
          <h3>⚠️ Stock Discrepancies</h3>
          <p>The following products have negative stock levels and need reconciliation:</p>
          {stock.data.map((item) => (
            <div className="row" key={item.id}>
              <b>{item.name}</b>
              <b className="negative">{item.quantity} in stock</b>
            </div>
          ))}
        </div>
      ) : null}
      
      {/* Top Products */}
      {analytics.data?.topProducts && analytics.data.topProducts.length > 0 ? (
        <div className="panel table">
          <h2>Top Selling Products</h2>
          {analytics.data.topProducts.map((product, index) => (
            <div className="row" key={product.productName}>
              <span>
                <b>#{index + 1} {product.productName}</b>
                <small>{product.quantity} sold · {money.format(product.revenue)}</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      
      {/* Cash Session Card */}
      <div className="panel">
        <div className="panel-header">
          <h2>Cash Session</h2>
          <button className="secondary" onClick={() => setModal('cash')}>
            {current ? 'Close Session' : 'Open Session'}
          </button>
        </div>
        {current ? (
          <>
            <p><small>Opened {new Date(current.openedAt).toLocaleString()}</small></p>
            <div className="row">
              <span>Opening float</span>
              <b>{money.format(current.openingFloat)}</b>
            </div>
            <div className="row">
              <span>Expected cash</span>
              <b>{money.format(current.expectedCash)}</b>
            </div>
          </>
        ) : (
          <p className="empty">No cash session is currently open.</p>
        )}
      </div>
      
      {/* Recent Expenses */}
      <div className="panel table">
        <div className="panel-header">
          <h2>Recent Expenses</h2>
          <button className="secondary" onClick={() => setModal('expense')}>Add Expense</button>
        </div>
        {expenses.data && expenses.data.length > 0 ? (
          expenses.data.slice(0, 5).map((item: { id: string; name: string; amount: number; note: string | null; spentAt: string }) => (
            <div className="row" key={item.id}>
              <span>
                <b>{item.name}</b>
                <small>{item.note ?? new Date(item.spentAt).toLocaleString()}</small>
              </span>
              <b>{money.format(item.amount)}</b>
            </div>
          ))
        ) : (
          <p className="empty">No expenses recorded in this period.</p>
        )}
      </div>
      
      {/* Cash Session Modal */}
      {modal === 'cash' && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <form
            className="modal-card form"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              current ? closeSession.mutate() : openSession.mutate();
            }}
          >
            <header>
              <h2>{current ? 'Close Cash Session' : 'Open Cash Session'}</h2>
              <button type="button" className="icon" onClick={() => setModal(null)}>×</button>
            </header>
            {current ? (
              <>
                <p>Expected cash: <b>{money.format(current.expectedCash)}</b></p>
                <label>
                  Counted cash
                  <input
                    required
                    inputMode="decimal"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    autoFocus
                  />
                </label>
              </>
            ) : (
              <label>
                Opening float
                <input
                  inputMode="decimal"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  autoFocus
                />
              </label>
            )}
            <button
              className="primary"
              disabled={openSession.isPending || closeSession.isPending}
            >
              {current ? 'Close Session' : 'Open Session'}
            </button>
          </form>
        </div>
      )}
      
      {/* Expense Modal */}
      {modal === 'expense' && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <form
            className="modal-card form"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveExpense.mutate();
            }}
          >
            <header>
              <h2>Add Expense</h2>
              <button type="button" className="icon" onClick={() => setModal(null)}>×</button>
            </header>
            <label>
              Name
              <input
                required
                value={expense.name}
                onChange={(e) => setExpense({ ...expense, name: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              Amount
              <input
                required
                inputMode="decimal"
                value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
              />
            </label>
            <label>
              Note
              <input
                value={expense.note}
                onChange={(e) => setExpense({ ...expense, note: e.target.value })}
              />
            </label>
            <button className="primary" disabled={saveExpense.isPending}>
              {saveExpense.isPending ? 'Saving…' : 'Save Expense'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
