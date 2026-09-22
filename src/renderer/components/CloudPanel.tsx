import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CashDrawer, ConnectResult, DeviceLimit, InactiveDevices, ShopSwitch } from "../../shared/models";

export function CloudPanel({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [view, setView] = useState<"sync" | "devices">("sync");
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
    refetchInterval: 5000,
  });

  const connected = Boolean(cloud.data?.deviceId);
  const devices = useQuery({
    queryKey: ["cloud-devices"],
    queryFn: () => window.storePos.cloud.devices(),
    enabled: connected && view === "devices",
  });
  const drawers = useQuery({ queryKey: ['cash-drawers'], queryFn: () => window.storePos.cloud.cashDrawers(), enabled: connected && view === 'devices' && cloud.data?.role === 'owner' });
  const [drawerName, setDrawerName] = useState('');
  const drawerAction = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => { setDrawerName(''); void client.invalidateQueries({ queryKey: ['cash-drawers'] }); void client.invalidateQueries({ queryKey: ['cloud-devices'] }); }, onError: (e: Error) => notify(e.message) });

  const [mode, setMode] = useState<"login" | "register" | "join">("login");
  const [url, setUrl] = useState(
    import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
  );
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [deviceName, setDeviceName] = useState("Desktop counter");
  const [pairingCode, setPairingCode] = useState("");
  const [limit, setLimit] = useState<DeviceLimit | null>(null);
  const [inactive, setInactive] = useState<InactiveDevices | null>(null);
  const [switching, setSwitching] = useState<ShopSwitch | null>(null);
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);

  useEffect(() => {
    if (cloud.data?.apiUrl) setUrl(cloud.data.apiUrl);
  }, [cloud.data?.apiUrl]);

  const action = useMutation({
    mutationFn: (fn: () => Promise<ConnectResult | void>) => fn(),
    onSuccess: (result) => {
      void client.invalidateQueries();
      if (!result) return;
      if (result.status === "device_limit") {
        setLimit(result);
        return;
      }
      if (result.status === "inactive_devices") {
        setInactive(result);
        return;
      }
      setLimit(null);
      setInactive(null);
      setPassword("");
      if (result.status === "shop_switch") {
        setSwitching(result);
        return;
      }
      setSwitching(null);
      notify(
        result.error ||
          (result.status === "signed_out"
            ? "Cloud မှဖြုတ်ပြီးပါပြီ။ စက်တွင်းဒေတာ မပျက်ပါ။"
            : `Cloud အခြေအနေ — ${result.status}`),
      );
    },
    onError: (error: Error) => notify(error.message),
  });

  const connect = async () => {
    if (url && url !== cloud.data?.apiUrl) {
      await window.storePos.cloud.setApiUrl(url);
    }
    if (mode === "join") {
      return window.storePos.cloud.join({
        pairingCode: pairingCode.trim(),
        deviceName,
      });
    }
    if (mode === "register") {
      return window.storePos.cloud.register({
        phone,
        password,
        deviceName,
        shopName: name,
      });
    }
    return window.storePos.cloud.login({ phone, password, deviceName });
  };

  const statusBadge = (status?: string) => {
    switch (status) {
      case "idle":
        return <span className="badge badge-success text-white font-medium">Sync ပြီး အသင့်ဖြစ်သည်</span>;
      case "syncing":
        return <span className="badge badge-info text-white font-medium animate-pulse">Sync လုပ်နေသည်…</span>;
      case "offline":
        return <span className="badge badge-warning text-amber-900 font-medium">အော့ဖ်လိုင်း အသုံးပြုနေသည်</span>;
      case "error":
        return <span className="badge badge-error text-white font-medium">Sync မအောင်မြင်ပါ</span>;
      default:
        return <span className="badge badge-neutral text-white font-medium">{status ?? "မချိတ်ဆက်ထားပါ"}</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
        <div>
          <h3 className="font-semibold text-slate-800 text-base flex items-center gap-2">
            <span>☁️</span> Cloud အကောင့်နှင့် စက်အများအပြား Sync
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            အရောင်းဒေတာ backup လုပ်ပြီး ငွေကိုင်စက်များနှင့် Sync လုပ်ပါ
          </p>
        </div>
        {connected && statusBadge(cloud.data?.status)}
      </div>

      <div className="p-5 space-y-6">
        {connected ? (
          <>
            <div className="flex rounded-lg bg-slate-100 p-1 w-full sm:w-fit">
              <button type="button" onClick={() => setView("sync")} className={`px-4 py-1.5 text-xs font-semibold rounded-md ${view === "sync" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>Cloud နှင့် Backup</button>
              {cloud.data?.role === "owner" ? <button type="button" onClick={() => setView("devices")} className={`px-4 py-1.5 text-xs font-semibold rounded-md ${view === "devices" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>စက်များနှင့် ဝန်ထမ်း</button> : null}
            </div>
            {view === "sync" ? <>
            {/* Active Account Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  ဆိုင်အမည်
                </span>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {cloud.data?.shopName || "—"}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  တာဝန် — <span className="font-semibold capitalize text-slate-700">{cloud.data?.role}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  ဤစက်
                </span>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {cloud.data?.deviceName || "ကွန်ပျူတာကောင်တာ"}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Sync ပို့ရန်ကျန် —{" "}
                  <strong className={cloud.data?.pending ? "text-amber-600 font-bold" : "text-slate-700"}>
                    {cloud.data?.pullProgress
                      ? `${cloud.data.pullProgress.completed} / ${cloud.data.pullProgress.total} processed`
                      : `${cloud.data?.pending ?? 0} changes`}
                  </strong>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    နောက်ဆုံး Cloud Sync
                  </span>
                  <p className="text-xs font-medium text-slate-700 mt-1">
                    {cloud.data?.lastSyncedAt
                      ? new Date(cloud.data.lastSyncedAt).toLocaleString()
                      : "တစ်ကြိမ်မျှ မလုပ်ရသေး"}
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-primary mt-2 gap-1.5"
                  disabled={action.isPending}
                  onClick={() => action.mutate(() => window.storePos.cloud.syncNow())}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className={`w-3.5 h-3.5 ${action.isPending ? "animate-spin" : ""}`}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  {action.isPending ? "Sync လုပ်နေသည်…" : "ယခု Sync လုပ်မည်"}
                </button>
              </div>
            </div>

            {cloud.data?.error && (
              <div className="alert alert-error text-sm rounded-xl py-3 flex items-center gap-2">
                <span>⚠️</span>
                <span>{cloud.data.error}</span>
              </div>
            )}
            </> : null}

            {/* Cashier Pairing Code (For Owners) */}
            {view === "devices" && cloud.data?.role === "owner" && (
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-indigo-950">ငွေကိုင် POS စက် ထပ်ချိတ်မည်</h4>
                  <p className="text-xs text-indigo-700">
                    အခြားကွန်ပျူတာ သို့မဟုတ် ဖုန်းကို ငွေကိုင်စက်အဖြစ်ချိတ်ရန် ၆ လုံးပါကုဒ် ဖန်တီးပါ
                  </p>
                  {pair && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-900">ချိတ်ဆက်ကုဒ် —</span>
                      <span className="px-3 py-1 bg-white font-mono font-black tracking-widest text-indigo-700 rounded border border-indigo-200 text-base shadow-sm">
                        {pair.code}
                      </span>
                      <span className="text-[11px] text-indigo-500">
                        (သက်တမ်းကုန်ရန် {new Date(pair.expiresAt).toLocaleTimeString()})
                      </span>
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-sm"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(async () => {
                      setPair(await window.storePos.cloud.createPairingCode());
                    })
                  }
                >
                  🔑 ချိတ်ဆက်ကုဒ် ဖန်တီးမည်
                </button>
              </div>
            )}

            {/* Connected Terminals List */}
            {view === "devices" ? <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div><h4 className="text-sm font-bold text-slate-800">ငွေရှင်းကောင်တာများ</h4><p className="text-xs text-slate-500">Main drawer သည် မူလဖြစ်သည်။ သီးခြားကောင်တာရှိမှသာ အသစ်ထည့်ပါ။</p></div>
                <div className="flex flex-wrap gap-2">{drawers.data?.map((drawer: CashDrawer) => <span key={drawer.id} className={`badge badge-lg ${drawer.activeSessionId ? 'badge-success' : 'badge-ghost'}`}>{drawer.name}{drawer.isDefault ? ' · ပင်မ' : ''}</span>)}</div>
                <div className="flex gap-2"><input className="input input-sm input-bordered flex-1" value={drawerName} onChange={e => setDrawerName(e.target.value)} placeholder="ကောင်တာ ၂" /><button className="btn btn-sm btn-primary" disabled={!drawerName.trim() || drawerAction.isPending} onClick={() => drawerAction.mutate(() => window.storePos.cloud.createCashDrawer(drawerName))}>ကောင်တာထည့်မည်</button></div>
              </div>
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-xs">
                  ချိတ်ဆက်ထားသော POS စက်များ ({devices.data?.length ?? 1})
                </h4>
                {devices.isFetching && (
                  <span className="text-xs text-slate-400">စက်စာရင်း ပြန်ဖတ်နေသည်…</span>
                )}
              </div>

              {devices.error && (
                <p className="text-xs text-rose-600">{devices.error.message}</p>
              )}

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {devices.data?.map((device) => (
                  <div
                    key={device.id}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-base">
                        {device.role === "owner" ? "👑" : "💻"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{device.name}</p>
                          {device.isCurrent && (
                            <span className="badge badge-xs badge-primary font-medium">
                              ဤစက်
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          စက်အမှတ် — {device.deviceCode} · တာဝန် —{" "}
                          <span className="capitalize">{device.role}</span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1"><button className={`btn btn-xs ${!device.assignedCashDrawerId ? 'btn-primary' : 'btn-ghost'}`} onClick={() => drawerAction.mutate(() => window.storePos.cloud.assignCashDrawer(device.id, null, Boolean(device.canManageCashDrawer)))}>မသတ်မှတ်ရသေး</button>{drawers.data?.map((drawer: CashDrawer) => <button key={drawer.id} className={`btn btn-xs ${device.assignedCashDrawerId === drawer.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => drawerAction.mutate(() => window.storePos.cloud.assignCashDrawer(device.id, drawer.id, Boolean(device.canManageCashDrawer)))}>{drawer.name}</button>)}</div>
                        {device.role === 'cashier' ? <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="toggle toggle-xs toggle-primary" checked={Boolean(device.canManageCashDrawer)} onChange={() => drawerAction.mutate(() => window.storePos.cloud.assignCashDrawer(device.id, device.assignedCashDrawerId ?? null, !device.canManageCashDrawer))} />ဤငွေစာရင်းပုံးကို ဖွင့်/ပိတ်နိုင်သည်</label> : <p className="mt-1 text-[11px] text-slate-400">ဆိုင်ပိုင်ရှင်သည် သတ်မှတ်ထားသောပုံးကို အမြဲဖွင့်/ပိတ်နိုင်သည်။</p>}
                      </div>
                    </div>

                    {!device.isCurrent && cloud.data?.role === "owner" && (
                      <button
                        className="btn btn-xs btn-outline btn-error"
                        disabled={action.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Disconnect ${device.name}? It will need to sign in or pair again.`,
                            )
                          ) {
                            action.mutate(() =>
                              window.storePos.cloud.revokeDevice(device.id),
                            );
                          }
                        }}
                      >
                        စက်ဖြုတ်မည်
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div> : null}

            {/* Sign Out / Disconnect */}
            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-slate-700">Cloud အကောင့်မှ ထွက်မည်</p>
                <p className="text-[11px] text-slate-500">
                  ဤစက်ရှိ အော့ဖ်လိုင်းအရောင်းနှင့် ကုန်လက်ကျန်ဒေတာများ မပျက်ပါ။
                </p>
              </div>
              <button
                className="btn btn-sm btn-outline btn-error"
                disabled={action.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Disconnect this desktop from cloud sync? Your local sales and inventory will remain safe.",
                    )
                  ) {
                    action.mutate(() => window.storePos.cloud.signOut());
                  }
                }}
              >
                Cloud မှဖြုတ်မည်
              </button>
            </div>
          </>
        ) : (
          /* Sign In / Register / Join Form */
          <div>
            {!limit && !switching && (
              <form
                className="max-w-xl mx-auto space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  action.mutate(connect);
                }}
              >
                <div className="flex rounded-lg bg-slate-100 p-1 mb-4">
                  {(
                    [
                      { key: "login", label: "ဆိုင်ပိုင်ရှင် ဝင်မည်" },
                      { key: "register", label: "ဆိုင်အသစ်ဖွင့်မည်" },
                      { key: "join", label: "ငွေကိုင်အဖြစ် ချိတ်မည်" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setMode(t.key)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        mode === t.key
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-bold text-slate-600">
                      စက်အမည်
                    </span>
                  </label>
                  <input
                    className="input input-bordered input-sm"
                    required
                    placeholder="ဥပမာ ကောင်တာ ၁၊ ရှေ့ကောင်တာ"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                  />
                </div>

                {mode === "register" && (
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold text-slate-600">
                        ဆိုင်အမည်
                      </span>
                    </label>
                    <input
                      className="input input-bordered input-sm"
                      required
                      placeholder="ဥပမာ မြို့မစူပါမားကတ်"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                )}

                {mode === "join" ? (
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold text-slate-600">
                        ၆ လုံးပါ ချိတ်ဆက်ကုဒ်
                      </span>
                    </label>
                    <input
                      className="input input-bordered input-sm font-mono tracking-widest text-center text-lg"
                      required
                      placeholder="123456"
                      maxLength={8}
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value)}
                    />
                    <label className="label py-0.5">
                      <span className="label-text-alt text-slate-400">
                        ဆိုင်ပိုင်ရှင်အား POS ဆက်တင်မှ ချိတ်ဆက်ကုဒ် ဖန်တီးပေးရန် ပြောပါ
                      </span>
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-bold text-slate-600">
                          ဆိုင်ဖုန်းနံပါတ်
                        </span>
                      </label>
                      <input
                        className="input input-bordered input-sm"
                        required
                        type="tel"
                        placeholder="09XXXXXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-bold text-slate-600">
                          စကားဝှက်
                        </span>
                      </label>
                      <input
                        className="input input-bordered input-sm"
                        required
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* Advanced Server URL Accordion */}
                <details className="text-xs text-slate-500 pt-2">
                  <summary className="cursor-pointer hover:text-slate-700 font-medium">
                    ⚙️ Cloud Server URL (အဆင့်မြင့်)
                  </summary>
                  <div className="form-control mt-2">
                    <input
                      className="input input-bordered input-xs font-mono"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                </details>

                <button
                  type="submit"
                  className="btn btn-primary w-full mt-4"
                  disabled={action.isPending}
                >
                  {action.isPending ? "ချိတ်ဆက်နေသည်…" : mode === "login" ? "အကောင့်ဝင်ပြီး Sync လုပ်မည်" : mode === "register" ? "ဆိုင်အကောင့် ဖန်တီးမည်" : "ဆိုင်သို့ ချိတ်ဆက်မည်"}
                </button>
              </form>
            )}

            {/* Device Limit Reached Modal */}
            {limit && (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <h4 className="font-bold text-amber-900 text-sm">
                  ချိတ်ဆက်နိုင်သော စက်အရေအတွက် ပြည့်သွားပါပြီ ({limit.limit})
                </h4>
                <p className="text-xs text-amber-800">
                  လက်ရှိအစီအစဉ်ဖြင့် အများဆုံး {limit.limit} လုံး ချိတ်နိုင်သည်။ ဖြုတ်ပြီး အစားထိုးမည့်စက်ကို ရွေးပါ —
                </p>
                <div className="space-y-2">
                  {limit.devices.map((device) => (
                    <button
                      key={device.id}
                      className="btn btn-sm btn-outline w-full justify-between"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate(() =>
                          window.storePos.cloud.completeLogin({
                            loginTicket: limit.loginTicket,
                            revokeDeviceId: device.id,
                            deviceName,
                          }),
                        )
                      }
                    >
                      <span>{device.name}</span>
                      <span className="text-xs font-normal text-slate-500">အစားထိုးမည်</span>
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-xs btn-ghost w-full"
                  disabled={action.isPending}
                  onClick={() => setLimit(null)}
                >
                  မလုပ်တော့ပါ
                </button>
              </div>
            )}

            {/* A reset terminal can explicitly revive a signed-out identity. */}
            {inactive && (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                <h4 className="font-bold text-blue-950 text-sm">ယခင်စက်တစ်လုံးကို ပြန်သုံးမည်</h4>
                <p className="text-xs text-blue-900">
                  ဤစက်များသည် အကောင့်မှထွက်ထားပြီးဖြစ်သည်။ ပြန်သုံးလျှင် မူလဘောင်ချာအမှတ်စဉ်ကို ဆက်သုံးပါမည်။
                </p>
                <div className="space-y-2">
                  {inactive.devices.map((device) => (
                    <button
                      key={device.id}
                      className="btn btn-sm btn-outline w-full justify-between"
                      disabled={action.isPending}
                      onClick={() => action.mutate(() => window.storePos.cloud.completeLogin({
                        loginTicket: inactive.loginTicket, reclaimDeviceId: device.id, deviceName,
                      }))}
                    >
                      <span>{device.name} · {device.deviceCode}</span>
                      <span className="text-xs font-normal text-slate-500">ပြန်သုံးမည်</span>
                    </button>
                  ))}
                </div>
                {inactive.canCreateNew ? <button
                  className="btn btn-xs btn-ghost w-full"
                  disabled={action.isPending}
                  onClick={() => action.mutate(() => window.storePos.cloud.completeLogin({
                    loginTicket: inactive.loginTicket, createNew: true, deviceName,
                  }))}
                >စက်အသစ်အဖြစ် သုံးမည်</button> : null}
                <button className="btn btn-xs btn-ghost w-full" disabled={action.isPending} onClick={() => setInactive(null)}>မလုပ်တော့ပါ</button>
              </div>
            )}

            {/* Shop Switch Confirmation */}
            {switching && (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <h4 className="font-bold text-amber-900 text-sm">
                  ဆိုင်ဒေတာ ပြောင်းမည် — {switching.shopName}?
                </h4>
                <p className="text-xs text-amber-800">
                  {switching.unsyncedCount > 0
                    ? `This terminal has ${switching.unsyncedCount} unsynced Shop A changes. Sync Shop A before switching.`
                    : 'ယခင်ဆိုင်၏ ဒေတာအားလုံး Sync ပြီးပါပြီ။ ဆိုင်အသစ်၏ဒေတာ မယူမီ ယခင်စက်တွင်းဒေတာကို ရှင်းပါမည်။'}
                </p>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm btn-warning flex-1"
                    disabled={action.isPending || switching.unsyncedCount > 0}
                    onClick={() =>
                      action.mutate(async () => {
                        await window.storePos.cloud.confirmSwitch();
                        window.location.reload();
                      })
                    }
                  >
                    ဤဆိုင်သို့ ပြောင်းမည်
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(async () => {
                        await window.storePos.cloud.cancelSwitch();
                        setSwitching(null);
                      })
                    }
                  >
                    မလုပ်တော့ပါ
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
