import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "../useCapabilities";
import { PeriodFilter, usePeriod } from "./PeriodFilter";
import type { CashSessionSummary } from "../../shared/models";
import { formatCurrency } from '../../shared/currency';

const money = { format: formatCurrency };

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
    <div className="flex justify-between items-center py-1.5 text-xs">
      <span className={bold ? "font-bold text-slate-800" : "font-medium text-slate-600"}>
        {label}
      </span>
      <span
        className={`font-mono ${bold ? "font-bold text-slate-900" : ""} ${
          negative ? "text-rose-600 font-semibold" : "text-slate-700"
        }`}
      >
        {plain ? value : money.format(value)}
      </span>
    </div>
  );
}

export function Reports({
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
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<"reports" | "activity">("reports");

  if (!capabilities.owner) {
    return (
      <section className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="bg-white rounded-2xl shadow-xl max-w-md p-8 border border-slate-200">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">ဆိုင်ပိုင်ရှင်သာ ကြည့်နိုင်သည်</h2>
          <p className="text-xs text-slate-500 mb-4">
            အရောင်းခွဲခြမ်းစိတ်ဖြာမှု၊ အမြတ်နှင့် စစ်ဆေးမှတ်တမ်းများကို ဆိုင်ပိုင်ရှင်သာ ကြည့်နိုင်ပါသည်။
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            📈 အစီရင်ခံစာနှင့် ငွေစာရင်းခွဲခြမ်းစိတ်ဖြာမှု
          </h1>
          <p className="text-xs text-gray-500">
            အရောင်း၊ အမြတ်၊ ပေးချေငွေနှင့် စစ်ဆေးမှတ်တမ်းများကို ကြည့်ပါ
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setTab("reports")}
            className={`px-3.5 py-1 text-xs font-semibold rounded-md transition ${
              tab === "reports"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            📊 အရောင်းခွဲခြမ်းစိတ်ဖြာမှု
          </button>
          <button
            onClick={() => setTab("activity")}
            className={`px-3.5 py-1 text-xs font-semibold rounded-md transition ${
              tab === "activity"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            📋 စစ်ဆေးမှတ်တမ်း
          </button>
        </div>
      </header>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "reports" && <ReportsTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </section>
  );
}

function ReportsTab() {
  const { range: selectedRange, label: periodLabel } = usePeriod();
  const range = selectedRange!;

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

  const grossMargin =
    data?.netSales && data.netSales > 0
      ? Math.round(((data.grossProfit ?? 0) / data.netSales) * 100)
      : 0;

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {/* Top Filter Bar */}
      <div className="flex justify-between items-center bg-white px-5 py-2.5 rounded-xl border border-gray-200/80 shadow-sm shrink-0">
        <div className="text-xs text-slate-500">
          အစီရင်ခံကာလ — <strong className="text-slate-800">{periodLabel}</strong>
        </div>
        <PeriodFilter />
      </div>

      {/* Executive Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              အသားတင်အရောင်း
            </p>
            <p className="text-xl font-black text-blue-700 mt-0.5">
              {money.format(data?.netSales ?? 0)}
            </p>
          </div>
          <span className="text-2xl">💰</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                အရောင်းအမြတ်
              </p>
              {grossMargin > 0 && (
                <span className="badge badge-xs badge-success text-white font-mono font-bold">
                  {grossMargin}%
                </span>
              )}
            </div>
            <p className="text-xl font-black text-emerald-700 mt-0.5">
              {money.format(data?.grossProfit ?? 0)}
            </p>
          </div>
          <span className="text-2xl">📈</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              အသုံးစရိတ်
            </p>
            <p className="text-xl font-black text-amber-600 mt-0.5">
              {money.format(data?.expenses ?? 0)}
            </p>
          </div>
          <span className="text-2xl">💸</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              အသားတင်အမြတ်
            </p>
            <p
              className={`text-xl font-black mt-0.5 ${
                (data?.netProfit ?? 0) >= 0 ? "text-purple-700" : "text-rose-600"
              }`}
            >
              {money.format(data?.netProfit ?? 0)}
            </p>
          </div>
          <span className="text-2xl">💎</span>
        </div>
      </div>

      {/* Reports Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1">
        {/* Sales & Margin Summary */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <span>🧾</span> အရောင်းငွေစာရင်း အသေးစိတ်
            </h3>
            <div className="divide-y divide-slate-50 mt-1">
              <ReportRow label="အကြမ်းအရောင်း" value={data?.grossSales ?? 0} />
              <ReportRow label="ပြန်သွင်းနှင့် ပြန်အမ်းငွေ" value={-(data?.refunds ?? 0)} negative />
              <ReportRow label="လျှော့စျေး" value={-(data?.discounts ?? 0)} negative />
              <div className="pt-1">
                <ReportRow label="အသားတင်အရောင်း" value={data?.netSales ?? 0} bold />
              </div>
              <ReportRow label="ရောင်းကုန်ဝယ်ရင်းတန်ဖိုး" value={-(data?.cost ?? 0)} negative />
              <div className="pt-1">
                <ReportRow label="အရောင်းအမြတ်" value={data?.grossProfit ?? 0} bold />
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
            <span className="text-slate-500">အရောင်းအမြတ်ရာခိုင်နှုန်း —</span>
            <span className="font-bold text-emerald-700 font-mono">{grossMargin}%</span>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-col">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <span>🏆</span> အရောင်းရဆုံးကုန်ပစ္စည်းများ
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 mt-2 max-h-64">
            {analytics.data?.topProducts.length ? (
              analytics.data.topProducts.map((item, index) => (
                <div
                  key={item.productName}
                  className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        index === 0
                          ? "bg-amber-400 text-amber-950 font-black"
                          : index === 1
                            ? "bg-slate-300 text-slate-800"
                            : index === 2
                              ? "bg-amber-200 text-amber-900"
                              : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-xs text-slate-800 truncate">
                        {item.productName}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {item.quantity} ယူနစ် ရောင်းပြီး
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-xs text-slate-900 shrink-0 ml-2">
                    {money.format(item.revenue)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-center py-10 text-slate-400 text-xs">
                ဤကာလအတွင်း ကုန်ပစ္စည်းအရောင်း မရှိပါ။
              </p>
            )}
          </div>
        </div>

        {/* Sales by Category */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-col">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <span>🏷️</span> အမျိုးအစားအလိုက် အရောင်း
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 mt-2 max-h-64">
            {analytics.data?.categories.length ? (
              analytics.data.categories.map((item) => (
                <ReportRow
                  key={item.categoryName}
                  label={item.categoryName}
                  value={item.revenue}
                />
              ))
            ) : (
              <p className="text-center py-10 text-slate-400 text-xs">
                ဤကာလအတွင်း အမျိုးအစားအလိုက် အရောင်းမရှိပါ။
              </p>
            )}
          </div>
        </div>

        {/* Payment Channels & Debt Intake */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <span>💳</span> ပေးချေမှုနည်းလမ်းအလိုက် လက်ခံငွေ
            </h3>
            <div className="divide-y divide-slate-50 mt-1">
              {data?.payments.length ? (
                data.payments.map((payment) => (
                  <ReportRow
                    key={payment.methodCode}
                    label={payment.methodCode.toUpperCase()}
                    value={payment.total}
                  />
                ))
              ) : (
                <p className="text-center py-6 text-slate-400 text-xs">
                  ဤကာလအတွင်း ပေးချေမှုမှတ်တမ်း မရှိပါ။
                </p>
              )}
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 mt-2">
            <ReportRow
              label="ဖောက်သည်ထံမှ ရရန်ကျန်အကြွေး"
              value={data?.outstandingDebt ?? 0}
              negative={Boolean((data?.outstandingDebt ?? 0) > 0)}
              bold
            />
          </div>
        </div>

        {/* Slow-moving Products */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-col">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <span>🐢</span> အရောင်းနှေးသော ကုန်ပစ္စည်းများ
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 mt-2 max-h-64">
            {analytics.data?.slowMoving.length ? (
              analytics.data.slowMoving.map((item) => (
                <div
                  key={item.productName}
                  className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-xs"
                >
                  <span className="font-medium text-slate-700 truncate max-w-[180px]">
                    {item.productName}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {item.quantity} ယူနစ် ရောင်းပြီး
                  </span>
                </div>
              ))
            ) : (
              <p className="text-center py-10 text-slate-400 text-xs">
                အရောင်းနှေးသော ကုန်ပစ္စည်း မတွေ့ပါ။
              </p>
            )}
          </div>
        </div>

        {/* Cash Register Shifts Audit */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-col">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <span>🔒</span> နေ့ချုပ်စာရင်းကိုက်မှု
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 mt-2 max-h-64">
            {sessions.data?.length ? (
              sessions.data.map((session: CashSessionSummary) => {
                const diff = session.difference ?? 0;
                return (
                  <div
                    key={session.id}
                    className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg hover:bg-slate-100/70 transition text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            session.status === "open" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                          }`}
                        />
                        <p className="font-semibold text-slate-800">
                          {session.status === "open" ? "ငွေတိုက် ဖွင့်ထားဆဲ" : "နေ့ချုပ် ပိတ်ပြီး"}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(session.openedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="text-right">
                      {session.difference == null ? (
                        <span className="font-mono text-slate-600">
                          အစလက်ကျန်ငွေ — {money.format(session.openingFloat)}
                        </span>
                      ) : (
                        <span
                          className={`badge badge-xs font-mono font-bold ${
                            diff === 0
                              ? "badge-success text-white"
                              : diff > 0
                                ? "badge-info text-white"
                                : "badge-error text-white"
                          }`}
                        >
                          {diff === 0 ? "စာရင်းကိုက်သည်" : diff > 0 ? `+${money.format(diff)}` : money.format(diff)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center py-10 text-slate-400 text-xs">
                ယခင်ငွေစာရင်းမှတ်တမ်း မရှိပါ။
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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
    discount: "လျှော့စျေး",
    return: "ပြန်သွင်း",
    adjustment: "လက်ကျန်ပြင်ဆင်မှု",
    waste: "ပျက်စီး / ဆုံးရှုံး",
  };

  const filtered =
    activity.data?.filter(
      (entry) => filter === "all" || entry.action === filter,
    ) ?? [];

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {/* Filter Chips Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "all", label: "လုပ်ဆောင်မှုအားလုံး" },
              { key: "discount", label: "လျှော့စျေး" },
              { key: "return", label: "ပြန်သွင်းမှု" },
              { key: "adjustment", label: "လက်ကျန်ပြင်ဆင်မှု" },
              { key: "waste", label: "ပျက်စီး / ဆုံးရှုံး" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                filter === item.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400">
          ပြထားသည် {filtered.length} မှတ်တမ်း
        </span>
      </div>

      {/* Activity Log List */}
      <div className="card bg-white shadow-sm border border-gray-200/80 flex-1 overflow-hidden">
        <div className="card-body p-0 flex flex-col overflow-hidden">
          {filtered.length > 0 ? (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm shrink-0">
                      {entry.action === "discount"
                        ? "🏷️"
                        : entry.action === "return"
                          ? "↩️"
                          : entry.action === "adjustment"
                            ? "📦"
                            : "🗑️"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {labels[entry.action]}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(entry.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        {entry.detail || "အသေးစိတ် မရှိပါ"}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    {entry.amount != null && (
                      <span
                        className={`font-mono font-bold ${
                          entry.action === "discount" || entry.action === "return"
                            ? "text-rose-600"
                            : entry.amount < 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                        }`}
                      >
                        {entry.action === "discount" || entry.action === "return"
                          ? `−${money.format(Math.abs(entry.amount))}`
                          : `${entry.amount > 0 ? "+" : ""}${entry.amount}`}
                      </span>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      လုပ်ဆောင်သူ — {entry.actor || "စနစ်"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <span className="text-4xl mb-2">📋</span>
              <p className="text-sm font-semibold text-slate-700">လုပ်ဆောင်မှုမှတ်တမ်း မရှိပါ</p>
              <p className="text-xs text-slate-400 mt-0.5">
                လျှော့စျေး၊ ပြန်အမ်းမှုနှင့် လက်ကျန်ပြင်ဆင်မှုများကို ဤနေရာတွင် ပြပါမည်။
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
