import { useCapabilities } from '../useCapabilities';
import { PeriodFilter, usePeriod } from "./PeriodFilter";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CashSessionSummary,
  ReportSummary,
  StockMovement,
} from "../../shared/models";
import { Money as MoneyPage } from "./Money";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function ReportRow({
  label,
  value,
  negative = false,
  bold = false,
  plain = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
  plain?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className={`text-xs ${bold ? "font-bold" : "font-medium"}`}>
        {label}
      </span>
      <span
        className={`text-xs ${bold ? "font-bold" : ""} ${negative ? "text-red-600" : ""}`}
      >
        {plain ? value : money.format(value)}
      </span>
    </div>
  );
}


export function Reports({
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
  const capabilities=useCapabilities();
  const [tab, setTab] = useState<"money" | "reports" | "activity">("money");

  if(!capabilities.owner)return <MoneyPage notify={notify}/>;
  return (
    <section className="h-full flex flex-col">
      {/* Compact Header */}
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">
          💰 Reports & Analytics
        </h1>
        <p className="text-xs text-gray-500">
          Track money, sales performance, and activity
        </p>
      </header>

      {/* Compact Tabs */}
      <div role="tablist" className="tabs tabs-boxed mb-3 bg-white shadow-sm">
        <button
          role="tab"
          className={`tab tab-sm ${tab === "money" ? "tab-active" : ""}`}
          onClick={() => setTab("money")}
        >
          Money & Cash
        </button>
        <button
          role="tab"
          className={`tab tab-sm ${tab === "reports" ? "tab-active" : ""}`}
          onClick={() => setTab("reports")}
        >
          Sales Reports
        </button>
        <button
          role="tab"
          className={`tab tab-sm ${tab === "activity" ? "tab-active" : ""}`}
          onClick={() => setTab("activity")}
        >
          Activity Log
        </button>
      </div>

      {/* Tab Content */}
      {tab === "money" && <MoneyPage dashboard={dashboard} notify={notify} />}
      {tab === "reports" && <ReportsTab />}
      {tab === "activity" && <ActivityTab />}
    </section>
  );
}

function ReportsTab() {
  const {range: selectedRange,label: periodLabel}=usePeriod();
  const range=selectedRange!;

  const report = useQuery({
    queryKey: ["report", range.from, range.to],
    queryFn: () => window.storePos.pos.report(range.from, range.to),
  });
  const analytics = useQuery({
    queryKey: ["report-analytics", range.from, range.to],
    queryFn: () => window.storePos.pos.reportAnalytics(range.from, range.to),
  });
  const sessions = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: () => window.storePos.pos.cashSessions(),
  });
  const data = report.data;
  return (
    <section>
      {/* Header */}
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Reports & day end
          </h2>
          <p className="text-gray-600">
            Review net sales, profitability, payment intake, and what is
            actually moving.
          </p>
        </div>
        <PeriodFilter/>
      </header>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          ["Net sales", money.format(data?.netSales ?? 0), "text-blue-600"],
          [
            "Gross profit",
            money.format(data?.grossProfit ?? 0),
            "text-green-600",
          ],
          ["Expenses", money.format(data?.expenses ?? 0), "text-orange-600"],
          ["Net profit", money.format(data?.netProfit ?? 0), "text-purple-600"],
        ].map(([label, value, color]) => (
          <div
            className="stat bg-white shadow-lg rounded-lg"
            key={String(label)}
          >
            <div className="stat-title">{label}</div>
            <div className={`stat-value text-2xl ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto">
        {/* Sales Summary */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">
              Sales summary
            </h3>
            <div className="space-y-1">
              <ReportRow label="Sales" value={data?.grossSales ?? 0} />
              <ReportRow
                label="Returns"
                value={-(data?.refunds ?? 0)}
                negative
              />
              <ReportRow
                label="Discounts"
                value={-(data?.discounts ?? 0)}
                negative
              />
              <div className="divider my-2"></div>
              <ReportRow label="Net sales" value={data?.netSales ?? 0} bold />
              <ReportRow
                label="Cost of goods"
                value={-(data?.cost ?? 0)}
                negative
              />
              <div className="divider my-2"></div>
              <ReportRow
                label="Gross profit"
                value={data?.grossProfit ?? 0}
                bold
              />
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">
              Top products
            </h3>
            <div className="space-y-2">
              {analytics.data?.topProducts.length ? (
                analytics.data.topProducts.map((item) => (
                  <div
                    key={item.productName}
                    className="flex justify-between items-start p-2 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-gray-500">
                        {item.quantity} sold
                      </p>
                    </div>
                    <p className="font-bold">{money.format(item.revenue)}</p>
                  </div>
                ))
              ) : (
                <p className="text-center py-6 text-gray-400">
                  No product sales in this period.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Slow-moving Products */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">
              Slow-moving products
            </h3>
            <div className="space-y-2">
              {analytics.data?.slowMoving.map((item) => (
                <div
                  key={item.productName}
                  className="flex justify-between items-center p-2 bg-gray-50 rounded"
                >
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-gray-500">{item.quantity} sold</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sales by Category */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">
              Sales by category
            </h3>
            <div className="space-y-1">
              {analytics.data?.categories.map((item) => (
                <ReportRow
                  key={item.categoryName}
                  label={item.categoryName}
                  value={item.revenue}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Payments & Debt */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">
              Payments & debt
            </h3>
            <div className="space-y-1">
              {data?.payments.length ? (
                data.payments.map((payment) => (
                  <ReportRow
                    key={payment.methodCode}
                    label={payment.methodCode}
                    value={payment.total}
                  />
                ))
              ) : (
                <p className="text-center py-4 text-gray-400">
                  No payments in this period.
                </p>
              )}
              <div className="divider my-2"></div>
              <ReportRow
                label="Outstanding debt"
                value={data?.outstandingDebt ?? 0}
                bold
              />
            </div>
          </div>
        </div>

        {/* Cash-session History */}
        <div className="card bg-white shadow-lg">
          <div className="card-body p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">
              Cash-session history
            </h3>
            <div className="space-y-2">
              {sessions.data?.length ? (
                sessions.data.map((session: CashSessionSummary) => (
                  <div
                    key={session.id}
                    className="flex justify-between items-start p-2 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">
                        {session.status === "open"
                          ? "Open till"
                          : "Closed till"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(session.openedAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="font-bold">
                      {session.difference == null
                        ? money.format(session.openingFloat)
                        : money.format(session.difference)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-center py-6 text-gray-400">
                  No cash sessions yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActivityTab() {
  const [filter, setFilter] = useState<
    "all" | "discount" | "return" | "adjustment" | "waste"
  >("all");
  const activity = useQuery({
    queryKey: ["activity"],
    queryFn: () => window.storePos.pos.activity(),
  });

  const labels = {
    discount: "Discount",
    return: "Return",
    adjustment: "Stock adjustment",
    waste: "Waste / damaged",
  };

  const badges = {
    discount: "badge-warning",
    return: "badge-info",
    adjustment: "badge-primary",
    waste: "badge-danger",
  };

  const filtered =
    activity.data?.filter(
      (entry) => filter === "all" || entry.action === filter,
    ) ?? [];

  return (
    <section>
      {/* Header */}
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Activity Log</h2>
        <p className="text-gray-600">
          Track all notable actions: discounts, returns, stock adjustments, and
          waste across all devices.
        </p>
      </header>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setFilter("all")}
        >
          All Actions
        </button>
        <button
          className={`btn btn-sm ${filter === "discount" ? "btn-warning" : "btn-ghost"}`}
          onClick={() => setFilter("discount")}
        >
          Discounts
        </button>
        <button
          className={`btn btn-sm ${filter === "return" ? "btn-info" : "btn-ghost"}`}
          onClick={() => setFilter("return")}
        >
          Returns
        </button>
        <button
          className={`btn btn-sm ${filter === "adjustment" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setFilter("adjustment")}
        >
          Adjustments
        </button>
        <button
          className={`btn btn-sm ${filter === "waste" ? "btn-error" : "btn-ghost"}`}
          onClick={() => setFilter("waste")}
        >
          Waste
        </button>
      </div>

      {/* Activity List */}
      <div className="card bg-white shadow-lg flex-1 overflow-hidden">
        <div className="card-body p-3 flex flex-col overflow-hidden">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">
            Recent Activity ({filtered.length})
          </h3>
          <div className="space-y-2">
            {filtered.length > 0 ? (
              filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-start p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <span
                      className={`badge ${badges[entry.action]} badge-sm mb-2`}
                    >
                      {labels[entry.action]}
                    </span>
                    <p className="font-medium">
                      {entry.detail || "No details"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(entry.occurredAt).toLocaleString()}
                      {entry.actor ? ` · ${entry.actor}` : " · System"}
                    </p>
                  </div>
                  {entry.amount != null && (
                    <div className="ml-4">
                      {entry.action === "discount" ||
                      entry.action === "return" ? (
                        <span className="font-bold text-red-600">
                          −{money.format(Math.abs(entry.amount))}
                        </span>
                      ) : (
                        <span
                          className={`font-bold ${entry.amount < 0 ? "text-red-600" : "text-green-600"}`}
                        >
                          {entry.amount > 0 ? "+" : ""}
                          {entry.amount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">
                  {filter === "all"
                    ? "No activity recorded yet."
                    : `No ${labels[filter].toLowerCase()} activities found.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
