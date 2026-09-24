import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudPanel } from "./CloudPanel";
import { FeatureSettings } from "./FeatureSettings";
import { PaymentSlips } from "./PaymentSlips";
import { NotificationSettings } from "./NotificationSettings";
import { PlanBadge } from "./PlanBadge";
import { useCapabilities } from "../useCapabilities";
import { CURRENCY_PRESETS, DEFAULT_CURRENCY, cacheCurrency, formatCurrency, parseCurrency, type CurrencyConfig } from '../../shared/currency';
import { myanmarMessage } from '../myanmar';

export function Settings({ notify }: { notify: (s: string) => void }) {
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<
    | "store"
    | "printer"
    | "cloud"
    | "payments"
    | "pricing"
    | "subscription"
    | "diagnostics"
    | "data"
  >("store");

  const tabs: {
    key: typeof tab;
    label: string;
    icon: string;
    badge?: React.ReactNode;
  }[] = [
    { key: "store", label: "ဆိုင်နှင့် ဘောက်ချာ", icon: "🏪" },
    { key: "printer", label: "ပရင်တာနှင့် စက်ပစ္စည်း", icon: "🖨️" },
    {
      key: "cloud",
      label: "Cloud နှင့် Sync",
      icon: "☁️",
      badge: (
        <PlanBadge
          plan="cloud_pro"
          variant="micro"
          locked={capabilities.effectivePlan !== "cloud_pro"}
        />
      ),
    },
    { key: "payments", label: "ပေးချေမှုနည်းလမ်း", icon: "💳" },
    {
      key: "pricing",
      label: "စျေးနှုန်းနှင့် လုပ်ဆောင်ချက်",
      icon: "🏷️",
      badge: (
        <PlanBadge
          plan="offline_plus"
          variant="micro"
          locked={capabilities.effectivePlan === "free"}
        />
      ),
    },
    { key: "subscription", label: "ပလန်နှင့် သက်တမ်း", icon: "💎" },
    { key: "diagnostics", label: "စနစ်စစ်ဆေးမှု", icon: "🩺" },
    { key: "data", label: "ဒေတာနှင့် အကောင့်", icon: "⚠️" },
  ];

  if (!capabilities.owner) {
    return <CashierSettings notify={notify} />;
  }

  return (
    <section className="h-full space-y-5 overflow-y-auto pr-1 pb-10">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            ဆက်တင်နှင့် စနစ်
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ဆိုင်အချက်အလက်၊ ဘောက်ချာ၊ ပရင်တာ၊ စျေးနှုန်းနှင့် Cloud Sync ကို စီမံပါ
          </p>
        </div>
      </header>

      {/* Modern Tab Bar */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-200/90 shadow-inner">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.badge}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {tab === "store" && <StoreProfileTab notify={notify} />}
        {tab === "printer" && <PrinterTab notify={notify} />}
        {tab === "cloud" && <CloudPanel notify={notify} />}
        {tab === "payments" && <PaymentTab notify={notify} />}
        {tab === "pricing" && <PricingAndFeaturesTab notify={notify} />}
        {tab === "subscription" && <SubscriptionTab notify={notify} />}
        {tab === "diagnostics" && <DiagnosticsTab notify={notify} />}
        {tab === "data" && <DataAndAccountTab notify={notify} />}
      </div>
    </section>
  );
}

/** Cashiers operate a terminal, but never alter shop-wide business policy. */
function CashierSettings({ notify }: { notify: (s: string) => void }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<'sync' | 'printer' | 'notifications' | 'diagnostics'>('sync');
  const cloud = useQuery({ queryKey: ['cashier-cloud'], queryFn: () => window.storePos.cloud.state(), refetchInterval: 5_000 });
  const retry = useMutation({ mutationFn: () => window.storePos.cloud.syncNow(), onSuccess: () => { void client.invalidateQueries({ queryKey: ['cashier-cloud'] }); notify('Sync စတင်နေပါပြီ'); }, onError: (e: Error) => notify(e.message) });
  const removeStation = useMutation({ mutationFn: () => window.storePos.cloud.removeLocalData(), onSuccess: () => { void client.invalidateQueries(); notify('ဤစက်ကို Cloud မှဖြုတ်ပြီး စက်တွင်းဆိုင်ဒေတာ ရှင်းပြီးပါပြီ'); }, onError: (e: Error) => notify(e.message) });
  const tabs = [{ key: 'sync' as const, icon: '☁️', label: 'Cloud Sync' }, { key: 'printer' as const, icon: '🖨️', label: 'Printer' }, { key: 'notifications' as const, icon: '🔔', label: 'Notifications' }, { key: 'diagnostics' as const, icon: '🩺', label: 'စနစ်စစ်ဆေးမှု' }];
  return <section className="h-full space-y-5 overflow-y-auto pr-1 pb-10">
    <header className="border-b border-slate-200 pb-4"><h2 className="text-xl font-black text-slate-800 tracking-tight">ငွေကိုင်ဆက်တင်</h2><p className="text-xs text-slate-500 mt-1">ဤစက်အတွက် ဆက်တင်များ</p></header>
    <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-200/90 shadow-inner">{tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${tab === item.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'}`}><span>{item.icon}</span>{item.label}</button>)}</div>
    <div className="mt-4">
      {tab === 'sync' ? <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-800">Cloud Sync</p><p className="text-xs text-slate-500 mt-1">{cloud.data?.shopName ?? 'မချိတ်ဆက်ရသေးပါ'} · {cloud.data?.status ?? 'မသိရသေး'} · {cloud.data?.pending ?? 0} ပို့ရန်ကျန်</p></div><button className="btn btn-sm btn-primary" disabled={retry.isPending || cloud.data?.status === 'signed_out'} onClick={() => retry.mutate()}>{retry.isPending ? 'Sync လုပ်နေသည်…' : 'ယခု Sync လုပ်မည်'}</button></div><div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-rose-800">ဤစက်ကို လုံခြုံစွာ ဖြုတ်မည်</p><p className="text-[11px] text-slate-500 mt-0.5">ဤစက်ကိုသာ Cloud မှဖြုတ်ပြီး စက်တွင်းဆိုင်ဒေတာကို ရှင်းပါမည်။ Cloud ဒေတာ မပျက်ပါ။</p></div><button className="btn btn-sm btn-outline btn-error" disabled={removeStation.isPending || (cloud.data?.pending ?? 0) > 0} onClick={() => { if ((cloud.data?.pending ?? 0) > 0) { notify('ဤစက်ကို မဖြုတ်မီ ပို့ရန်ကျန်ဒေတာအားလုံးကို Sync လုပ်ပါ'); return; } if (window.confirm('ဤစက်ကို ဆိုင်မှဖြုတ်မည်လား။ စက်တွင်းဆိုင်ဒေတာကို ရှင်းမည်ဖြစ်ပြီး Cloud ဒေတာနှင့် အခြားစက်များ မပျက်ပါ။')) removeStation.mutate(); }}>{removeStation.isPending ? 'ဖြုတ်နေသည်…' : 'ဤစက်ကို ဖြုတ်မည်'}</button></div></div> : null}
      {tab === 'printer' ? <PrinterTab notify={notify} /> : null}
      {tab === 'notifications' ? <NotificationSettings notify={notify} /> : null}
      {tab === 'diagnostics' ? <DiagnosticsTab notify={notify} readOnly /> : null}
    </div>
  </section>;
}

/* ==========================================================================
   1. STORE & RECEIPT BRANDING TAB
   ========================================================================== */
function StoreProfileTab({ notify }: { notify: (message: string) => void }) {
  const capabilities = useCapabilities();
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => window.storePos.pos.shopProfile(),
  });
  const [value, setValue] = useState({
    name: "",
    address: "",
    phone: "",
    receiptFooter: "",
    currency: JSON.stringify(DEFAULT_CURRENCY),
  });

  useEffect(() => {
    if (profile.data) setValue({ ...profile.data, currency: profile.data.currency ?? JSON.stringify(DEFAULT_CURRENCY) });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => {
      const next = parseCurrency(value.currency);
      if (
        profile.data?.currency &&
        profile.data.currency !== value.currency &&
        !window.confirm(
          `ဆိုင်သုံးငွေကြေးကို ${next.code} သို့ ပြောင်းမည်လား။\n\nယခင်ကုန်စျေး၊ အရောင်းမှတ်တမ်းနှင့် ဖောက်သည်အကြွေးများကို ငွေလဲနှုန်းဖြင့် ပြောင်းလဲမည်မဟုတ်ပါ။ ဂဏန်းတန်ဖိုးများ မပြောင်းဘဲ ငွေကြေးသင်္ကေတနှင့် ပုံစံသာ ပြောင်းပါမည်။`,
        )
      )
        throw new Error('ငွေကြေးပြောင်းခြင်းကို မလုပ်တော့ပါ');
      cacheCurrency(next);
      return window.storePos.pos.saveShopProfile(value);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["shop-profile"] });
      notify("ဆိုင်နှင့် ဘောက်ချာဆက်တင် သိမ်းပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Store Profile Form */}
      <div className="lg:col-span-7 space-y-6">
        <form
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-800 text-base">ဆိုင်အချက်အလက်</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ဤအချက်အလက်များကို ဖောက်သည်ဘောက်ချာတွင် ထုတ်ပေးပါမည်
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={save.isPending}
            >
              {save.isPending ? "သိမ်းနေသည်…" : "ပြင်ဆင်ချက်သိမ်းမည်"}
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  ဆိုင် / လုပ်ငန်းအမည်
                </span>
              </label>
              <input
                className="input input-bordered input-sm"
                required
                placeholder="ဥပမာ ABC မီနီမတ်"
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  ဖုန်းနံပါတ်များ
                </span>
              </label>
              <input
                className="input input-bordered input-sm"
                placeholder="ဥပမာ 09-123456789၊ 09-987654321"
                value={value.phone}
                onChange={(e) => setValue({ ...value, phone: e.target.value })}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  ဆိုင်လိပ်စာ
                </span>
              </label>
              <textarea
                className="textarea textarea-bordered textarea-sm h-20"
                placeholder="ဥပမာ အမှတ် ၁၂၊ ဗိုလ်ချုပ်လမ်း၊ ဗဟန်း၊ ရန်ကုန်"
                value={value.address}
                onChange={(e) => setValue({ ...value, address: e.target.value })}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  ဘောက်ချာအောက်ခြေစာသား
                </span>
              </label>
              <input
                className="input input-bordered input-sm"
                placeholder="ဥပမာ အားပေးမှုအတွက် ကျေးဇူးတင်ပါသည်။ ၃ ရက်ကျော် ပစ္စည်းပြန်မလဲပါ။"
                value={value.receiptFooter}
                onChange={(e) =>
                  setValue({ ...value, receiptFooter: e.target.value })
                }
              />
              <label className="label py-0.5">
                <span className="label-text-alt text-slate-400">
                  ပရင့်ထုတ်သော ဘောက်ချာအောက်ဆုံးတွင် ပေါ်ပါမည်
                </span>
              </label>
            </div>

            <CurrencyFields
              value={parseCurrency(value.currency)}
              disabled={!capabilities.owner}
              onChange={(currency) =>
                setValue({ ...value, currency: JSON.stringify(currency) })
              }
            />
          </div>
          <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex justify-end items-center">
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={save.isPending}
            >
              {save.isPending ? "သိမ်းနေသည်…" : "ပြင်ဆင်ချက်သိမ်းမည်"}
            </button>
          </div>
        </form>

        <NotificationSettings notify={notify} />
      </div>

      {/* Right: Live Thermal Receipt Preview */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              ဘောက်ချာနမူနာ
            </h4>
            <span className="badge badge-sm badge-neutral font-mono text-[10px]">
              အပူပရင်တာ 80mm
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            ပြင်ဆင်ချက်များကို ဤဘောက်ချာနမူနာတွင် ချက်ချင်းကြည့်နိုင်သည် —
          </p>

          {/* Thermal Receipt Paper Mockup */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-dashed border-slate-300 font-mono text-xs text-slate-700 max-w-sm mx-auto space-y-3">
            {/* Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                {value.name || "သင့်ဆိုင်အမည်"}
              </h2>
              {value.phone && <p className="text-[11px] text-slate-600">ဖုန်း — {value.phone}</p>}
              {value.address && (
                <p className="text-[11px] text-slate-500 leading-tight">
                  {value.address}
                </p>
              )}
            </div>

            {/* Receipt Meta */}
            <div className="text-[11px] text-slate-500 flex justify-between py-1 border-b border-dashed border-slate-200">
              <span>ဘောက်ချာ — #POS-10024</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>

            {/* Sample Items */}
            <div className="space-y-1.5 py-1 text-[11px]">
              <div className="flex justify-between">
                <span>၁ ခု  နမူနာကုန်ပစ္စည်း A</span>
                <span className="font-semibold">3,500</span>
              </div>
              <div className="flex justify-between">
                <span>၂ ဘူး  အချိုရည်</span>
                <span className="font-semibold">2,400</span>
              </div>
            </div>

            {/* Totals */}
            <div className="pt-2 border-t border-dashed border-slate-300 space-y-1 text-right">
              <div className="flex justify-between font-bold text-sm text-slate-900">
                <span>စုစုပေါင်း</span>
                <span>{formatCurrency(5900, parseCurrency(value.currency))}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>လက်ခံငွေသား</span>
                <span>10,000</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
                <span>ပြန်အမ်းငွေ</span>
                <span>4,100</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-500 italic">
              <p>{value.receiptFooter || "ကျေးဇူးတင်ပါသည်။ နောက်လည်းလာခဲ့ပါ။"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrencyFields({
  value,
  disabled,
  onChange,
}: {
  value: CurrencyConfig;
  disabled: boolean;
  onChange: (currency: CurrencyConfig) => void;
}) {
  const isPreset = CURRENCY_PRESETS.some(
    (entry) =>
      entry.code === value.code &&
      entry.symbol === value.symbol &&
      entry.decimalPlaces === value.decimalPlaces &&
      entry.symbolPosition === value.symbolPosition,
  );
  const presetKey = isPreset ? value.code : 'CUSTOM';

  return (
    <div className="pt-3 border-t border-slate-100 space-y-3">
      <div className="form-control">
        <label className="label py-1">
          <span className="label-text text-xs font-bold text-slate-700">
            အသုံးပြုမည့် ငွေကြေး
          </span>
          <span className="label-text-alt font-mono font-bold text-xs text-primary">
            နမူနာ — {formatCurrency(12500, value)}
          </span>
        </label>
        <select
          className="select select-bordered select-sm w-full"
          disabled={disabled}
          value={presetKey}
          onChange={(e) => {
            const key = e.target.value;
            if (key === 'CUSTOM') {
              onChange({
                ...value,
                name: value.name || 'Custom currency',
              });
            } else {
              const selected = CURRENCY_PRESETS.find((entry) => entry.code === key);
              if (selected) onChange(selected);
            }
          }}
        >
          {CURRENCY_PRESETS.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.code} — {entry.name} ({entry.symbol})
            </option>
          ))}
          <option value="CUSTOM">⚙️ စိတ်ကြိုက်ငွေကြေး သတ်မှတ်မည်…</option>
        </select>
        <label className="label py-0.5">
          <span className="label-text-alt text-slate-400">
            {disabled
              ? 'ဆိုင်ပိုင်ရှင်သာ ဆိုင်သုံးငွေကြေးကို ပြောင်းနိုင်သည်။'
              : 'ကောင်တာစက်အားလုံးနှင့် ဘောက်ချာများတွင် ပြောင်းလဲအသုံးပြုပါမည်။'}
          </span>
        </label>
      </div>

      {presetKey === 'CUSTOM' && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
          <p className="font-bold text-slate-700">စိတ်ကြိုက်ငွေကြေး ဆက်တင်</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label py-0.5">
                <span className="label-text text-[10px] text-slate-500 font-semibold">ကုဒ်</span>
              </label>
              <input
                className="input input-bordered input-xs w-full font-mono"
                disabled={disabled}
                value={value.code}
                maxLength={8}
                placeholder="EUR"
                onChange={(e) =>
                  onChange({
                    ...value,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                  })
                }
              />
            </div>
            <div>
              <label className="label py-0.5">
                <span className="label-text text-[10px] text-slate-500 font-semibold">အမည်</span>
              </label>
              <input
                className="input input-bordered input-xs w-full"
                disabled={disabled}
                value={value.name}
                maxLength={64}
                placeholder="Euro"
                onChange={(e) => onChange({ ...value, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label py-0.5">
                <span className="label-text text-[10px] text-slate-500 font-semibold">သင်္ကေတ</span>
              </label>
              <input
                className="input input-bordered input-xs w-full"
                disabled={disabled}
                value={value.symbol}
                maxLength={8}
                placeholder="€"
                onChange={(e) => onChange({ ...value, symbol: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label py-0.5">
                <span className="label-text text-[10px] text-slate-500 font-semibold">သင်္ကေတနေရာ</span>
              </label>
              <select
                className="select select-bordered select-xs w-full"
                disabled={disabled}
                value={value.symbolPosition}
                onChange={(e) =>
                  onChange({
                    ...value,
                    symbolPosition: e.target.value as 'before' | 'after',
                  })
                }
              >
                <option value="before">ရှေ့တွင် ($100)</option>
                <option value="after">နောက်တွင် (100 MMK)</option>
              </select>
            </div>
            <div>
              <label className="label py-0.5">
                <span className="label-text text-[10px] text-slate-500 font-semibold">ဒဿမအရေအတွက်</span>
              </label>
              <select
                className="select select-bordered select-xs w-full"
                disabled={disabled}
                value={value.decimalPlaces}
                onChange={(e) =>
                  onChange({
                    ...value,
                    decimalPlaces: Number(e.target.value) as CurrencyConfig['decimalPlaces'],
                  })
                }
              >
                <option value={0}>ဒဿမ မပါ</option>
                <option value={1}>ဒဿမ ၁ လုံး</option>
                <option value={2}>ဒဿမ ၂ လုံး</option>
                <option value={3}>ဒဿမ ၃ လုံး</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   2. PRINTER & HARDWARE TAB
   ========================================================================== */
function PrinterTab({ notify }: { notify: (s: string) => void }) {
  const [printers, setPrinters] = useState<
    { name: string; displayName: string }[]
  >([]);
  const [status, setStatus] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [testing, setTesting] = useState(false);
  const client = useQueryClient();
  const printer = useQuery({
    queryKey: ["printer"],
    queryFn: () => window.storePos.printer.settings(),
  });

  const save = async (next: NonNullable<typeof printer.data>) => {
    await window.storePos.printer.saveSettings(next);
    await client.invalidateQueries({ queryKey: ["printer"] });
  };

  const find = async () => {
    setFinding(true);
    setStatus(null);
    try {
      const found = await window.storePos.printer.list();
      setPrinters(found);
      setStatus(
        found.length
          ? `ပရင်တာ ${found.length} လုံး တွေ့ပါသည်။ စာရင်းမှ ဘောက်ချာပရင်တာကို ရွေးပါ။`
          : "ပရင်တာ မတွေ့ပါ။ USB ကြိုး သို့မဟုတ် Bluetooth ချိတ်ဆက်မှုကို စစ်ပြီး ထပ်စမ်းပါ။",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? myanmarMessage(error.message) : "ပရင်တာများကို ရှာမရပါ။",
      );
    } finally {
      setFinding(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await window.storePos.printer.test();
      setStatus(
        `✓ စမ်းသပ်ဘောက်ချာကို ${printer.data?.deviceName} သို့ ပို့ပြီးပါပြီ။ စာရွက်ဖြတ်မှုနှင့် မြန်မာစာကို စစ်ပါ။`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? myanmarMessage(error.message) : "စမ်းသပ်ပရင့် မအောင်မြင်ပါ။";
      setStatus(`✕ ပြဿနာ — ${message}`);
      notify(message);
    } finally {
      setTesting(false);
    }
  };

  const activeDevice = printer.data?.deviceName;
  const isRawEscPos = activeDevice?.startsWith("usb-raw:") || activeDevice?.startsWith("serial:");

  return (
    <div className="space-y-6">
      {/* Active Printer Status Banner */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
              activeDevice ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            🖨️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">
                {activeDevice ? activeDevice : "ဘောက်ချာပရင်တာ မသတ်မှတ်ရသေးပါ"}
              </h3>
              {activeDevice ? (
                <span className="badge badge-success text-white badge-xs font-semibold">
                  အသုံးပြုနေသည်
                </span>
              ) : (
                <span className="badge badge-neutral badge-xs">မသတ်မှတ်ထားပါ</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeDevice
                ? `စာရွက်အကျယ် — ${printer.data?.paperWidth ?? 80}mm · ပုံစံ — ${isRawEscPos ? "တိုက်ရိုက် ESC/POS" : "စနစ်ပရင်တာ Driver"}`
                : "ငွေရှင်းပြီးနောက် ဘောက်ချာအလိုအလျောက်ထုတ်ရန် အောက်တွင် ပရင်တာရွေးပါ"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-outline"
            disabled={finding}
            onClick={() => void find()}
          >
            {finding ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "🔍 ပရင်တာရှာမည်"
            )}
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={!activeDevice || testing}
            onClick={() => void test()}
          >
            {testing ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              "📄 စမ်းသပ်ဘောက်ချာထုတ်မည်"
            )}
          </button>
        </div>
      </div>

      {status && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
            status.startsWith("✓")
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : status.startsWith("✕")
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          <span>{status}</span>
        </div>
      )}

      {/* Printer Configuration Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
          <h4 className="font-semibold text-slate-800 text-sm border-b pb-3">
            ဘောက်ချာပရင်တာ ဆက်တင်
          </h4>

          {/* Printer Selector */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-bold text-slate-700">
                ရွေးထားသော ပရင်တာ
              </span>
            </label>
            <select
              value={printer.data?.deviceName ?? ""}
              disabled={!printer.data}
              onChange={(event) => {
                if (!printer.data) return;
                const nextVal = event.target.value || null;
                const isRaw = nextVal?.startsWith("serial:") || nextVal?.startsWith("usb-raw:");
                void save({
                  ...printer.data,
                  deviceName: nextVal,
                  paperWidth: isRaw ? 58 : printer.data.paperWidth,
                }).then(() =>
                  setStatus(
                    nextVal
                      ? "Printer selected and saved. Click 'Print Test Receipt' to verify."
                      : "Printer selection cleared.",
                  ),
                );
              }}
              className="select select-bordered select-sm w-full"
            >
              <option value="">-- ပရင်တာရွေးပါ --</option>
              {printer.data?.deviceName &&
                !printers.some((item) => item.name === printer.data.deviceName) && (
                  <option value={printer.data.deviceName}>
                    {printer.data.deviceName} (လက်ရှိသိမ်းထားသည်)
                  </option>
                )}
              {printers.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Paper Width Visual Buttons */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-bold text-slate-700">
                ဘောက်ချာစာရွက်အကျယ်
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (printer.data) void save({ ...printer.data, paperWidth: 58 });
                }}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                  printer.data?.paperWidth === 58
                    ? "border-primary bg-primary/5 text-primary font-bold shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">58 mm</p>
                  <p className="text-[11px] opacity-75 font-normal">အသေးစား အပူပရင်တာစာရွက်</p>
                </div>
                {printer.data?.paperWidth === 58 && <span>✓</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (printer.data) void save({ ...printer.data, paperWidth: 80 });
                }}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                  printer.data?.paperWidth === 80
                    ? "border-primary bg-primary/5 text-primary font-bold shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">80 mm</p>
                  <p className="text-[11px] opacity-75 font-normal">ပုံမှန် POS အပူပရင်တာစာရွက်</p>
                </div>
                {printer.data?.paperWidth === 80 && <span>✓</span>}
              </button>
            </div>
          </div>

          {/* Auto-Print Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                အရောင်းပြီးလျှင် ဘောက်ချာအလိုအလျောက်ထုတ်မည်
              </p>
              <p className="text-xs text-slate-500">
                ငွေရှင်းပြီးသည်နှင့် ဘောက်ချာကို အလိုအလျောက်ထုတ်ပါမည်
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={printer.data?.autoPrint ?? false}
              disabled={!printer.data}
              onChange={(event) => {
                if (printer.data)
                  void save({ ...printer.data, autoPrint: event.target.checked });
              }}
            />
          </div>
        </div>

        {/* Quick Connection Guide */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4 text-xs text-slate-600">
          <h4 className="font-semibold text-slate-800 text-sm border-b pb-3">
            အပူပရင်တာ ချိတ်ဆက်နည်း
          </h4>
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p className="font-bold text-slate-800">USB နှင့် Wi-Fi ပရင်တာ</p>
                <p className="text-slate-500 mt-0.5">
                  USB ကြိုးချိတ်ပြီး ထုတ်လုပ်သူ၏ driver (ဥပမာ Xprinter၊ Epson၊ Rongta) ကို ထည့်သွင်းပါ။ macOS တွင် <em>USB thermal (ESC/POS)</em> ကိုရွေးပါ။
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p className="font-bold text-slate-800">Bluetooth ပရင်တာ</p>
                <p className="text-slate-500 mt-0.5">
                  ဦးစွာ Windows / macOS Bluetooth ဆက်တင်တွင် ပရင်တာကို ချိတ်ပါ။ ပြီးလျှင် “ပရင်တာရှာမည်” ကိုနှိပ်ပါ။
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <p className="font-bold text-slate-800">မြန်မာစာ ပံ့ပိုးမှု</p>
                <p className="text-slate-500 mt-0.5">
                  စမ်းသပ်ပရင့်ဖြင့် Unicode မြန်မာစာနှင့် ငွေကြေးပုံစံကို စစ်နိုင်သည်။
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. PAYMENT METHODS TAB
   ========================================================================== */
function PaymentTab({ notify }: { notify: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const client = useQueryClient();
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => window.storePos.pos.paymentMethods(),
  });

  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["payment-methods"] });

  const save = useMutation({
    mutationFn: () => window.storePos.pos.savePaymentMethod({ name }),
    onSuccess: () => {
      setName("");
      setOpen(false);
      refresh();
      notify("ပေးချေမှုနည်းလမ်း သိမ်းပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const toggle = useMutation({
    mutationFn: (method: {
      id: string;
      name: string;
      code: string;
      sortOrder: number;
      isActive: boolean;
    }) =>
      window.storePos.pos.savePaymentMethod({
        ...method,
        isActive: !method.isActive,
      }),
    onSuccess: () => {
      refresh();
      notify("ပေးချေမှုနည်းလမ်း ပြင်ပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removePaymentMethod(id),
    onSuccess: (result) => {
      refresh();
      notify(
        result === "deactivated"
          ? "ယခင်အရောင်းမှတ်တမ်းရှိသောကြောင့် မဖျက်ဘဲ ကောင်တာမှ ဖျောက်ထားပါသည်။"
          : "ပေးချေမှုနည်းလမ်း ဖယ်ရှားပြီးပါပြီ။",
      );
    },
    onError: (e: Error) => notify(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">ငွေပေးချေမှုနည်းလမ်းများ</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            ကောင်တာတွင် အသုံးပြုမည့် ငွေသား၊ KBZPay၊ WavePay၊ ကတ် စသည်တို့ကို စီမံပါ
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
          + ပေးချေမှုနည်းလမ်းအသစ်
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {methods.data?.map((method) => (
          <div
            key={method.id}
            className="p-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-base">
                💳
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-800">
                    {method.name}
                  </span>
                  <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {method.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {method.isActive ? (
                    <span className="text-emerald-600 font-medium">● ကောင်တာတွင် ပြမည်</span>
                  ) : (
                    <span className="text-slate-400">○ ကောင်တာတွင် မပြပါ</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn btn-xs btn-outline"
                onClick={() => toggle.mutate(method)}
                disabled={toggle.isPending}
              >
                {method.isActive ? "ကောင်တာတွင် မပြပါ" : "ကောင်တာတွင် ပြမည်"}
              </button>
              <button
                className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${method.name}? If used in past sales, it will be safely disabled without breaking reports.`,
                    )
                  )
                    remove.mutate(method.id);
                }}
                disabled={remove.isPending}
              >
                ဖယ်ရှားမည်
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-base">ပေးချေမှုနည်းလမ်းအသစ် ထည့်မည်</h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">
                    ပေးချေမှုနည်းလမ်းအမည်
                  </span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="ဥပမာ Wave Pay၊ AYA Pay၊ Credit Card"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-bordered input-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={save.isPending}
                >
                  {save.isPending ? "သိမ်းနေသည်…" : "ပေးချေမှုနည်းလမ်း သိမ်းမည်"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   4. PRICE LEVELS & FEATURES TAB
   ========================================================================== */
function PricingAndFeaturesTab({ notify }: { notify: (s: string) => void }) {
  const capabilities = useCapabilities();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const levels = useQuery({
    queryKey: ["price-levels"],
    queryFn: () => window.storePos.pos.priceLevels(),
  });

  useEffect(() => {
    if (levels.data) {
      setDrafts(Object.fromEntries(levels.data.map((l) => [l.id, l.name])));
    }
  }, [levels.data]);

  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["price-levels"] });

  const save = useMutation({
    mutationFn: (input: { id?: string; name: string; sortOrder?: number }) =>
      window.storePos.pos.savePriceLevel(input),
    onSuccess: () => {
      setName("");
      setOpen(false);
      refresh();
      notify("စျေးနှုန်းအဆင့် သိမ်းပြီးပါပြီ");
    },
    onError: (error: Error) => notify(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removePriceLevel(id),
    onSuccess: () => {
      refresh();
      notify("စျေးနှုန်းအဆင့် ဖယ်ရှားပြီးပါပြီ");
    },
    onError: (error: Error) => notify(error.message),
  });

  const rename = (level: { id: string; name: string; sortOrder: number }) => {
    const next = (drafts[level.id] ?? "").trim();
    if (next && next !== level.name) {
      save.mutate({ id: level.id, name: next, sortOrder: level.sortOrder });
    }
  };

  const extras = levels.data?.filter((l) => !l.isDefault) ?? [];

  const move = (index: number, delta: number) => {
    const other = index + delta;
    if (other < 0 || other >= extras.length) return;
    const current = extras[index];
    const target = extras[other];
    save.mutate({ id: current.id, name: current.name, sortOrder: target.sortOrder });
    save.mutate({ id: target.id, name: target.name, sortOrder: current.sortOrder });
  };

  return (
    <div className="space-y-6">
      {/* Feature Settings Toggles */}
      <FeatureSettings notify={notify} />

      {/* Price Levels Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-800 text-base">စျေးနှုန်းအဆင့်များ</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              လက်လီစျေးသည် မူလစျေးဖြစ်သည်။ လက်ကား၊ VIP သို့မဟုတ် အရေအတွက်လိုက်စျေး ထည့်နိုင်သည်
            </p>
          </div>
          {capabilities.effectivePlan !== "free" && (
            <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
              + စျေးနှုန်းအဆင့်အသစ်
            </button>
          )}
        </div>

        {capabilities.effectivePlan === "free" ? (
          <div className="p-6 text-center text-xs text-slate-500">
            စျေးနှုန်းအဆင့်များ အသုံးပြုရန် <strong>Offline Plus</strong> သို့မဟုတ် <strong>Cloud Pro</strong> အစီအစဉ် လိုအပ်သည်။
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {levels.data?.map((level) => {
              const index = extras.findIndex((item) => item.id === level.id);
              return (
                <div
                  key={level.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex-1 max-w-sm">
                    {level.isDefault ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">
                            {level.name}
                          </span>
                          <span className="badge badge-neutral badge-xs font-semibold">
                            မူလလက်လီစျေး
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ကုန်ပစ္စည်းတွင် သတ်မှတ်ထားသော ပုံမှန်လက်လီစျေး
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          aria-label={`${level.name} name`}
                          value={drafts[level.id] ?? ""}
                          onChange={(e) =>
                            setDrafts({ ...drafts, [level.id]: e.target.value })
                          }
                          onBlur={() => rename(level)}
                          className="input input-bordered input-xs font-medium w-full max-w-xs"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {level.productCount
                            ? `${level.productCount} item price${level.productCount === 1 ? "" : "s"} set`
                            : "ဤစျေးနှုန်းသတ်မှတ်ထားသော ကုန်ပစ္စည်းမရှိသေးပါ"}
                        </p>
                      </div>
                    )}
                  </div>

                  {!level.isDefault && (
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-xs btn-ghost btn-square"
                        disabled={index === 0 || save.isPending}
                        onClick={() => move(index, -1)}
                        title="အပေါ်သို့ရွှေ့မည်"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-xs btn-ghost btn-square"
                        disabled={index === extras.length - 1 || save.isPending}
                        onClick={() => move(index, 1)}
                        title="အောက်သို့ရွှေ့မည်"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${level.name}? Associated prices on products will also be removed.`,
                            )
                          )
                            remove.mutate(level.id);
                        }}
                      >
                        ဖယ်ရှားမည်
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ name, sortOrder: levels.data?.length ?? 0 });
            }}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-base">စျေးနှုန်းအဆင့် ထည့်မည်</h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">အဆင့်အမည်</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="ဥပမာ လက်ကား၊ VIP၊ အရေအတွက်များ"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-bordered input-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={save.isPending}
                >
                  {save.isPending ? "သိမ်းနေသည်…" : "စျေးနှုန်းအဆင့် သိမ်းမည်"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   5. PLAN & BILLING TAB
   ========================================================================== */
function SubscriptionTab({ notify }: { notify: (s: string) => void }) {
  const [code, setCode] = useState("");
  const [selectedTier, setSelectedTier] = useState<"offline_plus" | "cloud_pro">("cloud_pro");
  const [selectedMonths, setSelectedMonths] = useState<1 | 3 | 12>(1);
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
  });
  const status = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => window.storePos.cloud.billingStatus(),
    enabled: Boolean(cloud.data?.deviceId),
  });
  const client = useQueryClient();

  const redeem = useMutation({
    mutationFn: () => window.storePos.cloud.redeemCode(code.trim()),
    onSuccess: (result) => {
      setCode("");
      void client.invalidateQueries();
      notify(
        result.daysAdded
          ? `✓ အစီအစဉ်သက်တမ်း ${result.daysAdded} ရက် တိုးပြီးပါပြီ။`
          : "အစီအစဉ် ပြင်ပြီးပါပြီ",
      );
    },
    onError: (error: Error) => notify(error.message),
  });

  const until = status.data?.premiumUntil ? new Date(status.data.premiumUntil) : null;
  const days = until ? Math.max(0, Math.floor((until.getTime() - Date.now()) / 86400000)) : 0;
  const isPremium = until && until.getTime() > Date.now();
  const isExpiringSoon = Boolean(isPremium && days <= 7);

  const tierName =
    status.data?.tier === "cloud_pro"
      ? "Cloud Pro"
      : status.data?.tier === "offline_plus"
        ? "Offline Plus"
        : "Free Offline";
  const packages = {
    offline_plus: [
      { months: 1 as const, amount: 8000, label: "၁ လ" },
      { months: 3 as const, amount: 22000, label: "၃ လ" },
      { months: 12 as const, amount: 80000, label: "၁ နှစ်", saving: "၂ လ အခမဲ့" },
    ],
    cloud_pro: [
      { months: 1 as const, amount: 15000, label: "၁ လ" },
      { months: 3 as const, amount: 42000, label: "၃ လ" },
      { months: 12 as const, amount: 150000, label: "၁ နှစ်", saving: "၂ လ အခမဲ့" },
    ],
  };
  const selectedPackage = packages[selectedTier].find((item) => item.months === selectedMonths)!;

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          isPremium
            ? status.data?.tier === "cloud_pro"
              ? "bg-gradient-to-br from-sky-50/70 to-blue-50/40 border-sky-300"
              : "bg-gradient-to-br from-amber-50/70 to-orange-50/40 border-amber-300"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
          <div>
            <div className="mb-2">
              <PlanBadge plan={isPremium ? status.data?.tier : "free"} variant="pill" />
            </div>
            <h3 className="text-2xl font-black text-slate-800">
              {isPremium ? "လက်ရှိအသုံးပြုနေသော အစီအစဉ်" : "အခမဲ့ အော့ဖ်လိုင်းအစီအစဉ်"}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isPremium
                ? status.data?.tier === "cloud_pro"
                  ? "အော့ဖ်လိုင်းလုပ်ဆောင်ချက်အားလုံးနှင့် စက် ၅ လုံးအထိ Cloud Sync အသုံးပြုနိုင်သည်"
                  : "ဤစက်တွင် ဖောက်သည်အကြွေး၊ နေ့ချုပ်စာရင်းနှင့် စိတ်ကြိုက်စျေးနှုန်းများ အသုံးပြုနိုင်သည်"
                : "အခြေခံအော့ဖ်လိုင်းအရောင်း၊ ဘောက်ချာထုတ်ခြင်းနှင့် အသုံးစရိတ် မှတ်တမ်းတင်နိုင်သည်။ အကြွေး၊ နေ့ချုပ်စာရင်းနှင့် Cloud Sync အတွက် အစီအစဉ်မြှင့်ပါ။"}
            </p>
          </div>

          <button
            className="btn btn-sm btn-ghost"
            onClick={() =>
              void client.invalidateQueries({ queryKey: ["billing-status"] })
            }
          >
            ↻ အခြေအနေပြန်စစ်မည်
          </button>
        </div>

        {isPremium && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200/80">
            <div className="p-3 bg-white/80 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                သက်တမ်းကျန်ရက်
              </span>
              <p
                className={`text-2xl font-black mt-1 ${
                  isExpiringSoon ? "text-amber-600" : "text-emerald-700"
                }`}
              >
                {days} ရက်
              </p>
            </div>
            <div className="p-3 bg-white/80 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                သက်တမ်းကုန်ရက်
              </span>
              <p className="text-base font-bold text-slate-800 mt-1">
                {until?.toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-slate-800">၁။ ဆိုင်အတွက်လိုအပ်သော အစီအစဉ်ကိုရွေးပါ</p>
        <p className="text-xs text-slate-500 mt-1">ဆိုင်အသုံးပြုပုံနှင့် ကိုက်ညီသောအစီအစဉ်ကို ရွေးပါ။</p>
      </div>
      {/* Signature Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Offline Plus Card */}
        <button type="button" onClick={() => { setSelectedTier("offline_plus"); setSelectedMonths(1); }} className={`text-left rounded-2xl border-2 bg-gradient-to-br from-amber-50/50 to-orange-50/20 p-5 space-y-4 shadow-xs transition ${selectedTier === "offline_plus" ? "border-amber-500 ring-2 ring-amber-100" : "border-amber-200 hover:border-amber-400"}`}>
          <div className="flex items-center justify-between">
            <PlanBadge plan="offline_plus" variant="pill" />
            <span className="badge badge-sm bg-amber-100 text-amber-800 border-amber-300 font-bold">
              စက် ၁ လုံး
            </span>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-base">Offline Plus</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              အကြွေးရောင်းခြင်း သို့မဟုတ် လက်ကား / VIP စျေး သုံးသောဆိုင်များအတွက်
            </p>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✓</span>
              <span>ဖောက်သည်အကြွေးစာရင်း</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✓</span>
              <span>နေ့ချုပ်စာရင်း (Day-End)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✓</span>
              <span>လက်လီ၊ လက်ကား၊ VIP စျေးနှုန်းအဆင့်များ</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">✓</span>
              <span>စက်တစ်လုံး · အင်တာနက်မလို</span>
            </li>
          </ul>
          <p className="text-lg font-black text-amber-700">တစ်လ ၈,၀၀၀ ကျပ်</p>
        </button>

        {/* Cloud Pro Card */}
        <button type="button" onClick={() => { setSelectedTier("cloud_pro"); setSelectedMonths(1); }} className={`text-left rounded-2xl border-2 bg-gradient-to-br from-sky-50/50 to-blue-50/20 p-5 space-y-4 shadow-xs transition ${selectedTier === "cloud_pro" ? "border-sky-500 ring-2 ring-sky-100" : "border-sky-200 hover:border-sky-400"}`}>
          <div className="flex items-center justify-between">
            <PlanBadge plan="cloud_pro" variant="pill" />
            <span className="badge badge-sm bg-sky-100 text-sky-800 border-sky-300 font-bold">
              စက် ၅ လုံးအထိ
            </span>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-base">Cloud Pro</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              စက်နှစ်လုံးနှင့်အထက် သုံးပြီး Cloud backup လိုသောဆိုင်များအတွက်
            </p>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            <li className="flex items-center gap-2">
              <span className="text-sky-600 font-bold">✓</span>
              <span>Offline Plus လုပ်ဆောင်ချက်အားလုံး ပါဝင်သည်</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-sky-600 font-bold">✓</span>
              <span>စက်အများအပြား အချိန်နှင့်တပြေးညီ Sync</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-sky-600 font-bold">✓</span>
              <span>နောက်ကွယ်မှ အလိုအလျောက် Cloud backup</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-sky-600 font-bold">✓</span>
              <span>စက်တိုင်းမှ ကုန်လက်ကျန်နှင့် အရောင်းကို ကြည့်နိုင်သည်</span>
            </li>
          </ul>
          <p className="text-lg font-black text-sky-700">တစ်လ ၁၅,၀၀၀ ကျပ်</p>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div><p className="text-sm font-bold text-slate-800">၂။ သက်တမ်းကိုရွေးပါ</p><p className="text-xs text-slate-500 mt-1">တစ်နှစ်စာတွင် နှစ်လ အခမဲ့ပါဝင်သည်။</p></div>
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          {packages[selectedTier].map((item) => <button key={item.months} type="button" onClick={() => setSelectedMonths(item.months)} className={`rounded-xl border p-3 text-center transition ${selectedMonths === item.months ? "border-sky-500 bg-sky-50 ring-1 ring-sky-200" : "border-slate-200 hover:border-slate-300"}`}>
            <p className="font-bold text-slate-800">{item.label}</p><p className="text-sm font-black text-sky-700 mt-1">{new Intl.NumberFormat("en-US").format(item.amount)} Ks</p>{"saving" in item && item.saving ? <p className="text-[11px] text-emerald-700 font-bold mt-1">{item.saving}</p> : null}
          </button>)}
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-bold text-indigo-950">ငွေမပေးမီ မေးမြန်းလိုပါသလား။</p><p className="text-xs text-indigo-800 mt-1">ရွေးထားသောအစီအစဉ်နှင့် ပေးချေမှုအတွက် ကျွန်ုပ်တို့ကို ဆက်သွယ်နိုင်ပါသည်။</p></div>
        <div className="flex gap-2"><a className="btn btn-sm btn-outline" href="tel:09425743536">☎ 09425743536 သို့ ဖုန်းခေါ်မည်</a><a className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none" href="https://viber.me/959425743536" target="_blank" rel="noreferrer">▣ Viber</a></div>
      </div>

      {/* Detail is available, but does not get in the way of buying. */}
      <details className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <summary className="p-4 cursor-pointer font-semibold text-slate-800 text-sm bg-slate-50/50">အစီအစဉ်အားလုံး နှိုင်းယှဉ်ကြည့်မည်</summary>
        <div className="divide-y divide-slate-100 text-xs">
          {[
            {
              feature: "အော့ဖ်လိုင်း POS နှင့် ဘောက်ချာထုတ်ခြင်း",
              planReq: "free",
              available: true,
            },
            {
              feature: "ငွေသားနှင့် ဆိုင်အသုံးစရိတ်",
              planReq: "free",
              available: true,
            },
            {
              feature: "ဖောက်သည်အကြွေးစာရင်း",
              planReq: "offline_plus",
              available: isPremium,
            },
            {
              feature: "နေ့ချုပ်စာရင်း ပိတ်ခြင်း",
              planReq: "offline_plus",
              available: isPremium,
            },
            {
              feature: "လက်ကား / VIP စျေးနှုန်းအဆင့်များ",
              planReq: "offline_plus",
              available: isPremium,
            },
            {
              feature: "အလိုအလျောက် Cloud backup နှင့် စက်အများအပြား Sync",
              planReq: "cloud_pro",
              available: status.data?.tier === "cloud_pro",
            },
          ].map((item) => (
            <div key={item.feature} className="p-3.5 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{item.feature}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-slate-400">လိုအပ်သောအစီအစဉ် —</span>
                  <PlanBadge plan={item.planReq} variant="micro" />
                </div>
              </div>
              <span
                className={`badge badge-sm font-semibold ${
                  item.available ? "badge-success text-white" : "badge-neutral"
                }`}
              >
                {item.available ? "အသုံးပြုနေသည်" : "မရနိုင်သေး"}
              </span>
            </div>
          ))}
        </div>
      </details>

      {/* Redeem Voucher / Code */}
      <form
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          redeem.mutate();
        }}
      >
        <div>
          <h4 className="font-semibold text-slate-800 text-sm">ကြိုတင်ဝယ်ယူထားသော ကုဒ်သုံးမည်</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            အစီအစဉ်ဖွင့်ရန် သို့မဟုတ် သက်တမ်းတိုးရန် ၁၄ လုံးပါကုဒ်ကို ထည့်ပါ
          </p>
        </div>

        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            required
            value={code}
            placeholder="XXXX-XXXX-XXXC"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={14}
            className="input input-bordered input-sm font-mono tracking-wider font-bold flex-1"
          />
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={redeem.isPending || code.trim().length < 12}
          >
            {redeem.isPending ? "ကုဒ်စစ်နေသည်…" : "ကုဒ်အသုံးပြုမည်"}
          </button>
        </div>
      </form>

      {/* Manual Payment Slips */}
      <PaymentSlips notify={notify} tier={selectedTier} amount={selectedPackage.amount} packageLabel={selectedPackage.label} />
    </div>
  );
}

/* ==========================================================================
   6. DIAGNOSTICS & SYSTEM TAB
   ========================================================================== */
function DiagnosticsTab({ notify, readOnly = false }: { notify: (message: string) => void; readOnly?: boolean }) {
  const client = useQueryClient();
  const version = useQuery({
    queryKey: ["app-version"],
    queryFn: () => window.storePos.app.version(),
  });
  const crashes = useQuery({
    queryKey: ["crashes"],
    queryFn: () => window.storePos.pos.crashes(),
  });
  const stock = useQuery({
    queryKey: ["stock-discrepancies"],
    queryFn: () => window.storePos.pos.stockDiscrepancies(),
  });
  const cloudState = useQuery({
    queryKey: ["cloud-state"],
    queryFn: () => window.storePos.cloud.state(),
  });

  const clear = useMutation({
    mutationFn: () => window.storePos.pos.clearCrashes(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["crashes"] });
      notify("App ပြဿနာမှတ်တမ်း ရှင်းပြီးပါပြီ");
    },
  });

  const copy = async () => {
    const text = [
      `Store POS Desktop v${version.data ?? "?"}`,
      `Sync Status: ${cloudState.data?.status ?? "မသိရသေး"}`,
      `Pending Changes: ${cloudState.data?.pending ?? 0}`,
      `Last Synced: ${cloudState.data?.lastSyncedAt ? new Date(cloudState.data.lastSyncedAt).toLocaleString() : "တစ်ကြိမ်မျှ မလုပ်ရသေး"}`,
      "",
      "=== CRASH LOGS ===",
      "",
      ...(crashes.data ?? []).map(
        (item) =>
          `${new Date(item.occurredAt).toLocaleString()}\nSource: ${item.source}\nVersion: ${item.appVersion ?? "မသိရသေး"}\nMessage: ${item.message}`,
      ),
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      notify("စနစ်စစ်ဆေးချက်ကို ကူးယူပြီးပါပြီ");
    } catch {
      notify("စနစ်စစ်ဆေးချက်ကို မကူးနိုင်ပါ");
    }
  };

  return (
    <div className="space-y-6">
      {/* System Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            App ဗားရှင်း
          </span>
          <p className="text-xl font-mono font-black text-slate-800 mt-1">
            v{version.data ?? "0.1.0"}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Cloud Sync
          </span>
          <p className="text-xl font-bold text-slate-800 mt-1 capitalize">
            {cloudState.data?.status ?? "အော့ဖ်လိုင်း"}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            အနုတ်ဖြစ်နေသော ကုန်လက်ကျန်
          </span>
          <p
            className={`text-xl font-black mt-1 ${
              stock.data && stock.data.length > 0 ? "text-rose-600" : "text-slate-800"
            }`}
          >
            {stock.data?.length ?? 0}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            App ပြဿနာမှတ်တမ်း
          </span>
          <p className="text-xl font-black text-slate-800 mt-1">
            {crashes.data?.length ?? 0}
          </p>
        </div>
      </div>

      {/* Negative Stock Warning */}
      {stock.data && stock.data.length > 0 && (
        <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <span>⚠️</span>
            <span>ကုန်လက်ကျန်ကွာဟမှု ({stock.data.length} ခု လက်ကျန်အနုတ်ဖြစ်နေသည်)</span>
          </div>
          <div className="divide-y divide-amber-200/60 max-h-48 overflow-y-auto">
            {stock.data.map((item) => (
              <div key={item.id} className="py-2 flex justify-between text-xs text-amber-900">
                <span className="font-medium">{item.name}</span>
                <span className="font-mono font-bold text-rose-600">
                  {item.quantity} လက်ကျန်
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crash Logs Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h4 className="font-semibold text-slate-800 text-sm">
              App ပြဿနာမှတ်တမ်း ({crashes.data?.length ?? 0})
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              ပြဿနာရှာဖွေရန် သိမ်းထားသော error မှတ်တမ်းများ
            </p>
          </div>
          {crashes.data && crashes.data.length > 0 && (
            <div className="flex gap-2">
              <button className="btn btn-xs btn-outline" onClick={() => void copy()}>
                စစ်ဆေးချက်ကို ကူးမည်
              </button>
              {!readOnly ? <button
                className="btn btn-xs btn-ghost text-rose-600"
                disabled={clear.isPending}
                onClick={() => {
                  if (window.confirm("App ပြဿနာမှတ်တမ်းအားလုံး ရှင်းမည်လား။")) clear.mutate();
                }}
              >
                မှတ်တမ်းရှင်းမည်
              </button> : null}
            </div>
          )}
        </div>

        <div className="p-4">
          {crashes.data && crashes.data.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {crashes.data.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono space-y-1"
                >
                  <p className="font-semibold text-rose-700">{item.message}</p>
                  <p className="text-slate-400 text-[11px]">
                    {new Date(item.occurredAt).toLocaleString()} · ဖြစ်ပွားရာ — {item.source}
                    {item.appVersion ? ` · v${item.appVersion}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              App ပြဿနာမှတ်တမ်း မရှိပါ။ ကောင်းမွန်စွာ လည်ပတ်နေပါသည်။ 🎉
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   8. DATA & ACCOUNT MANAGEMENT TAB (DANGER ZONE)
   ========================================================================== */
function DataAndAccountTab({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const capabilities = useCapabilities();

  const cloudState = useQuery({
    queryKey: ["cloud-state"],
    queryFn: () => window.storePos.cloud.state(),
  });

  const shopProfile = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => window.storePos.pos.shopProfile(),
  });

  const storageAction = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      void client.invalidateQueries();
      notify("ဒေတာလုပ်ဆောင်မှု ပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteShopName, setDeleteShopName] = useState("");

  const deleteAccount = useMutation({
    mutationFn: () =>
      window.storePos.cloud.deleteCloudAccount({
        shopName: deleteShopName.trim(),
        password: deletePassword,
      }),
    onSuccess: () => {
      setShowDeleteModal(false);
      setDeletePassword("");
      setDeleteShopName("");
      void client.invalidateQueries();
      notify("Cloud အကောင့်အပြီးဖျက်ပြီး ဤစက်ကို ပြန်လည်သတ်မှတ်ပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const shopDisplayName = cloudState.data?.shopName || shopProfile.data?.name || "YOUR SHOP";
  const pendingCount = cloudState.data?.pending ?? 0;

  return (
    <div className="max-w-4xl space-y-6">
      <header className="mb-2">
        <h3 className="text-lg font-bold text-slate-800">
          ⚠️ ဒေတာနှင့် အကောင့် စီမံမှု
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          စက်တွင်းဒေတာ ပြန်ပြင်ခြင်း၊ ရှင်းခြင်းနှင့် Cloud အကောင့်ဖျက်ခြင်း
        </p>
      </header>

      {/* 1. Local Station Maintenance */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-semibold text-slate-800 text-sm">
            စက်တွင်းဒေတာ ထိန်းသိမ်းမှု
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            ဤကွန်ပျူတာ၏ စက်တွင်းဒေတာကို ပြန်တည်ဆောက်နိုင်သည်။ Cloud ဒေတာ မပျက်ပါ။
          </p>
        </div>

        <div className="p-5 space-y-4">
          {pendingCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>
                မှတ်ချက် — စက်တွင်းဒေတာပြင်ဆင်ရန် ပို့ရန်ကျန်ဒေတာ ၀ ဖြစ်ရပါမည်။ လက်ရှိ {pendingCount} ခု ကျန်နေသည်။
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <p className="text-xs font-semibold text-slate-800">
                Cloud မှ စက်တွင်းဒေတာ ပြန်လည်ရယူမည်
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ဤစက်ရှိဒေတာကို ရှင်းပြီး Cloud မှ ဒေတာအသစ် ပြန်လည်ရယူပါမည်။
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={storageAction.isPending || pendingCount > 0 || cloudState.data?.status === "signed_out"}
              onClick={() => {
                if (window.confirm("ဤစက်ရှိဒေတာကိုရှင်းပြီး လက်ရှိဆိုင်ဒေတာကို Cloud မှ ပြန်ယူမည်လား။")) {
                  storageAction.mutate(() => window.storePos.cloud.rebuildLocalData());
                }
              }}
            >
              {storageAction.isPending ? "ပြန်လည်ရယူနေသည်…" : "စက်တွင်းဒေတာ ပြန်လည်ရယူမည်"}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-rose-50/50 rounded-lg border border-rose-100">
            <div>
              <p className="text-xs font-semibold text-rose-800">
                ဤစက်မှ ဆိုင်ဒေတာအားလုံး ရှင်းမည်
              </p>
              <p className="text-[11px] text-rose-600 mt-0.5">
                ဤစက်ကို Cloud မှဖြုတ်ပြီး စက်တွင်းဆိုင်ဒေတာအားလုံးကို ရှင်းပါမည်။
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline btn-error"
              disabled={storageAction.isPending || pendingCount > 0}
              onClick={() => {
                if (pendingCount > 0) {
                  alert("စက်တွင်းဒေတာမရှင်းမီ ပို့ရန်ကျန်ဒေတာအားလုံးကို Sync လုပ်ပါ။");
                  return;
                }
                if (
                  window.confirm(
                    "သတိပေးချက် — ဤကွန်ပျူတာရှိ ဆိုင်ဒေတာအားလုံးကို ရှင်းပြီး Cloud မှ ဖြုတ်ပါမည်။ Cloud ဒေတာ မပျက်ပါ။\n\nဆက်လုပ်မည်လား။"
                  )
                ) {
                  storageAction.mutate(() => window.storePos.cloud.removeLocalData());
                }
              }}
            >
              {storageAction.isPending ? "ဒေတာရှင်းနေသည်…" : "ဤစက်ဒေတာ ရှင်းမည်"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Danger Zone: Cloud Account Deletion */}
      {capabilities.owner && cloudState.data?.status !== "signed_out" && (
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="badge badge-error badge-sm text-white font-bold">အန္တရာယ်ရှိသော လုပ်ဆောင်ချက်</span>
            <h4 className="font-bold text-rose-900 text-sm">
              Cloud အကောင့် အပြီးဖျက်မည်
            </h4>
          </div>
          <p className="text-xs text-rose-700 leading-relaxed">
            ဤဆိုင်၏ Cloud ဒေတာ၊ Sync မှတ်တမ်းနှင့် အကောင့်ကို အပြီးဖျက်ပြီး ချိတ်ထားသောစက်အားလုံးကို ဖြုတ်ပါမည်။ ပြန်ယူ၍မရပါ။
          </p>
          <button
            type="button"
            className="btn btn-sm btn-outline btn-error"
            onClick={() => {
              setDeletePassword("");
              setDeleteShopName("");
              setShowDeleteModal(true);
            }}
          >
            Cloud အကောင့်ဖျက်မည်…
          </button>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h3 className="font-bold text-base text-rose-700">
                  Cloud အကောင့် အပြီးဖျက်မည်
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost"
                disabled={deleteAccount.isPending}
                onClick={() => setShowDeleteModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
              <p className="font-bold">ဤလုပ်ဆောင်ချက်ကို ပြန်ပြင်၍မရပါ။</p>
              <p>
                Cloud ပေါ်ရှိ ကုန်ပစ္စည်း၊ အရောင်း၊ အကြွေးစာရင်းနှင့် ချိတ်ထားသောစက်အားလုံး ပျက်သွားပါမည်။
              </p>
            </div>

            <div className="space-y-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">
                    ဆိုင်ပိုင်ရှင် စကားဝှက်
                  </span>
                </label>
                <input
                  type="password"
                  className="input input-bordered input-sm"
                  placeholder="ဆိုင်ပိုင်ရှင် စကားဝှက်ထည့်ပါ"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  disabled={deleteAccount.isPending}
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">
                    ဆိုင်အမည်ကို အတည်ပြုပါ — <span className="font-mono text-rose-700 font-semibold">{shopDisplayName}</span>
                  </span>
                </label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder={`“${shopDisplayName}” ဟု ရိုက်ထည့်ပါ`}
                  value={deleteShopName}
                  onChange={(e) => setDeleteShopName(e.target.value)}
                  disabled={deleteAccount.isPending}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={deleteAccount.isPending}
                onClick={() => setShowDeleteModal(false)}
              >
                မလုပ်တော့ပါ
              </button>
              <button
                type="button"
                className="btn btn-sm btn-error"
                disabled={
                  deleteAccount.isPending ||
                  !deletePassword ||
                  deleteShopName.trim() !== shopDisplayName.trim()
                }
                onClick={() => deleteAccount.mutate()}
              >
                {deleteAccount.isPending ? "ဖျက်နေသည်…" : "အကောင့် အပြီးဖျက်မည်"}
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop bg-black/40"
            onClick={() => {
              if (!deleteAccount.isPending) setShowDeleteModal(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
