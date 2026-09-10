import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectResult, DeviceLimit, InactiveDevices, ShopSwitch } from "../../shared/models";

export function CloudPanel({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
    refetchInterval: 5000,
  });

  const connected = Boolean(cloud.data?.deviceId);
  const devices = useQuery({
    queryKey: ["cloud-devices"],
    queryFn: () => window.storePos.cloud.devices(),
    enabled: connected,
  });

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
            ? "Disconnected. Local database was kept safe."
            : `Cloud status: ${result.status}`),
      );
    },
    onError: (error: Error) => notify(error.message),
  });

  const connect = async () => {
    await window.storePos.cloud.setApiUrl(url);
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
        return <span className="badge badge-success text-white font-medium">Synced & Ready</span>;
      case "syncing":
        return <span className="badge badge-info text-white font-medium animate-pulse">Syncing…</span>;
      case "offline":
        return <span className="badge badge-warning text-amber-900 font-medium">Offline Mode</span>;
      case "error":
        return <span className="badge badge-error text-white font-medium">Sync Error</span>;
      default:
        return <span className="badge badge-neutral text-white font-medium">{status ?? "Disconnected"}</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
        <div>
          <h3 className="font-semibold text-slate-800 text-base flex items-center gap-2">
            <span>☁️</span> Cloud Account & Multi-Device Sync
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Backup transactions, sync multiple cashier terminals, and access reports remotely
          </p>
        </div>
        {connected && statusBadge(cloud.data?.status)}
      </div>

      <div className="p-5 space-y-6">
        {connected ? (
          <>
            {/* Active Account Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  Shop Name
                </span>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {cloud.data?.shopName || "—"}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  Role: <span className="font-semibold capitalize text-slate-700">{cloud.data?.role}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  This Terminal
                </span>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {cloud.data?.deviceName || "Desktop Counter"}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Pending Sync:{" "}
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
                    Last Cloud Sync
                  </span>
                  <p className="text-xs font-medium text-slate-700 mt-1">
                    {cloud.data?.lastSyncedAt
                      ? new Date(cloud.data.lastSyncedAt).toLocaleString()
                      : "Never"}
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
                  {action.isPending ? "Syncing…" : "Sync Now"}
                </button>
              </div>
            </div>

            {cloud.data?.error && (
              <div className="alert alert-error text-sm rounded-xl py-3 flex items-center gap-2">
                <span>⚠️</span>
                <span>{cloud.data.error}</span>
              </div>
            )}

            {/* Cashier Pairing Code (For Owners) */}
            {cloud.data?.role === "owner" && (
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-indigo-950">Add Cashier POS Devices</h4>
                  <p className="text-xs text-indigo-700">
                    Generate a 6-digit temporary pairing code to link other laptops, desktops, or phones as cashiers
                  </p>
                  {pair && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-900">Pairing Code:</span>
                      <span className="px-3 py-1 bg-white font-mono font-black tracking-widest text-indigo-700 rounded border border-indigo-200 text-base shadow-sm">
                        {pair.code}
                      </span>
                      <span className="text-[11px] text-indigo-500">
                        (Expires {new Date(pair.expiresAt).toLocaleTimeString()})
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
                  🔑 Create Pairing Code
                </button>
              </div>
            )}

            {/* Connected Terminals List */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-xs">
                  Connected POS Terminals ({devices.data?.length ?? 1})
                </h4>
                {devices.isFetching && (
                  <span className="text-xs text-slate-400">Refreshing devices…</span>
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
                              This Device
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          ID: {device.deviceCode} · Role:{" "}
                          <span className="capitalize">{device.role}</span>
                        </p>
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
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Disconnect Danger Zone */}
            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-slate-700">Sign Out of Cloud Account</p>
                <p className="text-[11px] text-slate-500">
                  Local offline sales and inventory data will remain intact on this machine.
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
                Disconnect Cloud
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
                      { key: "login", label: "Owner Sign In" },
                      { key: "register", label: "Create Shop" },
                      { key: "join", label: "Join as Cashier" },
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
                      Terminal Name
                    </span>
                  </label>
                  <input
                    className="input input-bordered input-sm"
                    required
                    placeholder="e.g. Counter 1, Front Desk"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                  />
                </div>

                {mode === "register" && (
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold text-slate-600">
                        Shop Name
                      </span>
                    </label>
                    <input
                      className="input input-bordered input-sm"
                      required
                      placeholder="e.g. City Supermarket"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                )}

                {mode === "join" ? (
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold text-slate-600">
                        6-Digit Pairing Code
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
                        Ask your shop owner to generate a pairing code from their POS Settings
                      </span>
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-bold text-slate-600">
                          Shop Phone Number
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
                          Password
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
                    ⚙️ Cloud Server URL (Advanced)
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
                  {action.isPending ? "Connecting…" : mode === "login" ? "Sign In & Sync" : mode === "register" ? "Create Shop Account" : "Join Shop"}
                </button>
              </form>
            )}

            {/* Device Limit Reached Modal */}
            {limit && (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <h4 className="font-bold text-amber-900 text-sm">
                  Device Limit Reached ({limit.limit})
                </h4>
                <p className="text-xs text-amber-800">
                  Your current subscription allows up to {limit.limit} active devices. Select an existing device to disconnect and replace:
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
                      <span className="text-xs font-normal text-slate-500">Replace</span>
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-xs btn-ghost w-full"
                  disabled={action.isPending}
                  onClick={() => setLimit(null)}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* A reset terminal can explicitly revive a signed-out identity. */}
            {inactive && (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                <h4 className="font-bold text-blue-950 text-sm">Reuse a previous device</h4>
                <p className="text-xs text-blue-900">
                  These devices are already signed out. Reusing one keeps its receipt namespace; active devices are never shown here.
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
                      <span className="text-xs font-normal text-slate-500">Reuse</span>
                    </button>
                  ))}
                </div>
                {inactive.canCreateNew ? <button
                  className="btn btn-xs btn-ghost w-full"
                  disabled={action.isPending}
                  onClick={() => action.mutate(() => window.storePos.cloud.completeLogin({
                    loginTicket: inactive.loginTicket, createNew: true, deviceName,
                  }))}
                >Use as a new device</button> : null}
                <button className="btn btn-xs btn-ghost w-full" disabled={action.isPending} onClick={() => setInactive(null)}>Cancel</button>
              </div>
            )}

            {/* Shop Switch Confirmation */}
            {switching && (
              <div className="max-w-md mx-auto p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <h4 className="font-bold text-amber-900 text-sm">
                  Switch Shop Data to {switching.shopName}?
                </h4>
                <p className="text-xs text-amber-800">
                  This terminal has {switching.unsyncedCount} unsynced local changes. An automatic database backup will be created before switching shops.
                </p>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm btn-warning flex-1"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(async () => {
                        await window.storePos.cloud.confirmSwitch();
                        window.location.reload();
                      })
                    }
                  >
                    Backup & Switch
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
                    Cancel
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
