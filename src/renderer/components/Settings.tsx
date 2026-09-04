import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Settings({ notify }: { notify: (s: string) => void }) {
  const [tab, setTab] = useState<
    | "general"
    | "payment"
    | "pricing"
    | "printer"
    | "subscription"
    | "diagnostics"
  >("general");

  return (
    <section className="h-full">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">⚙️ Settings</h1>
        <p className="text-gray-600">
          Configure your store, payments, pricing, and more
        </p>
      </header>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-boxed mb-6 bg-white shadow-sm">
        <button
          role="tab"
          className={`tab ${tab === "general" ? "tab-active" : ""}`}
          onClick={() => setTab("general")}
        >
          General
        </button>
        <button
          role="tab"
          className={`tab ${tab === "payment" ? "tab-active" : ""}`}
          onClick={() => setTab("payment")}
        >
          Payment Methods
        </button>
        <button
          role="tab"
          className={`tab ${tab === "pricing" ? "tab-active" : ""}`}
          onClick={() => setTab("pricing")}
        >
          Price Levels
        </button>
        <button
          role="tab"
          className={`tab ${tab === "printer" ? "tab-active" : ""}`}
          onClick={() => setTab("printer")}
        >
          Printer
        </button>
        <button
          role="tab"
          className={`tab ${tab === "subscription" ? "tab-active" : ""}`}
          onClick={() => setTab("subscription")}
        >
          Subscription
        </button>
        <button
          role="tab"
          className={`tab ${tab === "diagnostics" ? "tab-active" : ""}`}
          onClick={() => setTab("diagnostics")}
        >
          Diagnostics
        </button>
      </div>

      {/* Tab Content */}
      {tab === "general" && <GeneralTab notify={notify} />}
      {tab === "payment" && <PaymentTab notify={notify} />}
      {tab === "pricing" && <PricingTab notify={notify} />}
      {tab === "printer" && <PrinterTab notify={notify} />}
      {tab === "subscription" && <SubscriptionTab notify={notify} />}
      {tab === "diagnostics" && <DiagnosticsTab notify={notify} />}
    </section>
  );
}

function DiagnosticsTab({ notify }: { notify: (message: string) => void }) {
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
      notify("Problem logs cleared");
    },
  });

  const syncNow = useMutation({
    mutationFn: () => window.storePos.cloud.syncNow(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cloud-state"] });
      notify("Sync completed");
    },
    onError: (e: Error) => notify(e.message),
  });

  const copy = async () => {
    const text = [
      `Store POS Desktop v${version.data ?? "?"}`,
      `Sync Status: ${cloudState.data?.status ?? "unknown"}`,
      `Pending Changes: ${cloudState.data?.pending ?? 0}`,
      `Last Synced: ${cloudState.data?.lastSyncedAt ? new Date(cloudState.data.lastSyncedAt).toLocaleString() : "Never"}`,
      "",
      "=== CRASH LOGS ===",
      "",
      ...(crashes.data ?? []).map(
        (item) =>
          `${new Date(item.occurredAt).toLocaleString()}\nSource: ${item.source}\nVersion: ${item.appVersion ?? "unknown"}\nMessage: ${item.message}`,
      ),
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      notify("Diagnostics copied to clipboard");
    } catch {
      notify("Unable to copy diagnostics");
    }
  };

  const statusBadgeClass: Record<string, string> = {
    signed_out: "badge-neutral",
    idle: "badge-success",
    syncing: "badge-info",
    offline: "badge-warning",
    error: "badge-error",
    paused: "badge-warning",
    suspended: "badge-error",
    expired: "badge-error",
  };

  const statusClass = cloudState.data?.status
    ? statusBadgeClass[cloudState.data.status]
    : "badge-neutral";

  return (
    <section>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Diagnostics</h2>
        <p className="text-gray-600">
          System information, sync status, crash logs, and troubleshooting
          tools.
        </p>
      </header>

      {/* System Info Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat bg-white shadow-lg rounded-lg">
          <div className="stat-title">App Version</div>
          <div className="stat-value text-xl">{version.data ?? "—"}</div>
        </div>
        <div className="stat bg-white shadow-lg rounded-lg">
          <div className="stat-title">Crash Logs</div>
          <div className="stat-value text-xl">{crashes.data?.length ?? 0}</div>
        </div>
        <div className="stat bg-white shadow-lg rounded-lg">
          <div className="stat-title">Stock Issues</div>
          <div
            className={`stat-value text-xl ${stock.data && stock.data.length > 0 ? "text-red-600" : ""}`}
          >
            {stock.data?.length ?? 0}
          </div>
        </div>
        <div className="stat bg-white shadow-lg rounded-lg">
          <div className="stat-title">Pending Sync</div>
          <div className="stat-value text-xl">
            {cloudState.data?.pending ?? 0}
          </div>
        </div>
      </div>

      {/* Sync Status Card */}
      <div className="card bg-white shadow-lg mb-6">
        <div className="card-body">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Sync Status</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => syncNow.mutate()}
              disabled={
                syncNow.isPending || cloudState.data?.status === "signed_out"
              }
            >
              {syncNow.isPending ? "Syncing..." : "Sync Now"}
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Status</span>
              <span className={`badge ${statusClass}`}>
                {cloudState.data?.status ?? "unknown"}
              </span>
            </div>
            {cloudState.data?.lastSyncedAt && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Last Synced</span>
                <span className="font-medium">
                  {new Date(cloudState.data.lastSyncedAt).toLocaleString()}
                </span>
              </div>
            )}
            {cloudState.data?.shopName && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Shop</span>
                <span className="font-medium">{cloudState.data.shopName}</span>
              </div>
            )}
            {cloudState.data?.deviceName && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Device</span>
                <span className="font-medium">
                  {cloudState.data.deviceName}
                </span>
              </div>
            )}
            {cloudState.data?.error && (
              <div className="alert alert-error mt-2">
                <span className="text-sm">Error: {cloudState.data.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stock Discrepancies Warning */}
      {stock.data && stock.data.length > 0 ? (
        <div className="card bg-warning bg-opacity-10 border border-warning shadow-lg mb-6">
          <div className="card-body">
            <h3 className="text-xl font-bold text-warning mb-2">
              ⚠️ Stock Discrepancies ({stock.data.length})
            </h3>
            <p className="text-gray-600 mb-4">
              The following products have negative stock and need
              reconciliation:
            </p>
            <div className="space-y-2">
              {stock.data.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-2 bg-white rounded"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="font-bold text-red-600">
                    {item.quantity} in stock
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Crash Logs */}
      <div className="card bg-white shadow-lg">
        <div className="card-body">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">
              Crash Logs ({crashes.data?.length ?? 0})
            </h3>
            {crashes.data && crashes.data.length > 0 && (
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void copy()}
                >
                  Copy All
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={clear.isPending}
                  onClick={() => {
                    if (window.confirm("Clear all crash logs?")) clear.mutate();
                  }}
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
          {crashes.data && crashes.data.length > 0 ? (
            <div className="space-y-2">
              {crashes.data.map((item) => (
                <div
                  key={item.id}
                  className="p-3 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <p className="font-medium text-gray-900">{item.message}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(item.occurredAt).toLocaleString()} · {item.source}
                    {item.appVersion ? ` · v${item.appVersion}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">
              No crash logs recorded. 🎉
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

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
      notify("Payment method saved");
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
      notify("Payment method updated");
    },
    onError: (e: Error) => notify(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removePaymentMethod(id),
    onSuccess: (result) => {
      refresh();
      notify(
        result === "deactivated"
          ? "Method has existing payments, so it was hidden instead."
          : "Payment method removed.",
      );
    },
    onError: (e: Error) => notify(e.message),
  });
  return (
    <section>
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Payment methods
          </h2>
          <p className="text-gray-600">
            Keep checkout methods clear without losing the meaning of past
            payment records.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          Add method
        </button>
      </header>
      <div className="card bg-white shadow-lg">
        <div className="card-body">
          <h3 className="text-xl font-bold mb-4">Available methods</h3>
          <div className="space-y-2">
            {methods.data?.map((method) => (
              <div
                key={method.id}
                className="flex justify-between items-center p-3 border border-gray-200 rounded hover:bg-gray-50"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{method.name}</p>
                  <p className="text-sm text-gray-500">
                    {method.code} ·{" "}
                    {method.isActive
                      ? "Active at checkout"
                      : "Hidden at checkout"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggle.mutate(method)}
                    disabled={toggle.isPending}
                  >
                    {method.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${method.name}? Methods used in sales are kept but hidden.`,
                        )
                      )
                        remove.mutate(method.id);
                    }}
                    disabled={remove.isPending}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="card bg-white shadow-xl w-full max-w-md"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="card-body">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Add payment method</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-circle"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Name</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wave Pay"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input input-bordered"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary mt-4"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Add method"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function PricingTab({ notify }: { notify: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const levels = useQuery({
    queryKey: ["price-levels"],
    queryFn: () => window.storePos.pos.priceLevels(),
  });
  useEffect(() => {
    if (levels.data)
      setDrafts(
        Object.fromEntries(levels.data.map((level) => [level.id, level.name])),
      );
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
      notify("Price level saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removePriceLevel(id),
    onSuccess: () => {
      refresh();
      notify("Price level removed");
    },
    onError: (error: Error) => notify(error.message),
  });
  const rename = (level: { id: string; name: string; sortOrder: number }) => {
    const next = (drafts[level.id] ?? "").trim();
    if (next && next !== level.name)
      save.mutate({ id: level.id, name: next, sortOrder: level.sortOrder });
  };
  const extras = levels.data?.filter((level) => !level.isDefault) ?? [];
  const move = (index: number, delta: number) => {
    const other = index + delta;
    if (other < 0 || other >= extras.length) return;
    const current = extras[index];
    const target = extras[other];
    save.mutate({
      id: current.id,
      name: current.name,
      sortOrder: target.sortOrder,
    });
    save.mutate({
      id: target.id,
      name: target.name,
      sortOrder: current.sortOrder,
    });
  };
  return (
    <section>
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Price levels
          </h2>
          <p className="text-gray-600">
            Retail is the base price. Add Wholesale, VIP, or another level to
            make its product price fields appear.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          Add price level
        </button>
      </header>
      <div className="card bg-white shadow-lg">
        <div className="card-body">
          <h3 className="text-xl font-bold mb-4">Price levels</h3>
          <div className="space-y-2">
            {levels.data?.map((level) => {
              const index = extras.findIndex((item) => item.id === level.id);
              return (
                <div
                  key={level.id}
                  className="flex justify-between items-center p-3 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <input
                      aria-label={`${level.name} name`}
                      value={drafts[level.id] ?? ""}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [level.id]: event.target.value })
                      }
                      onBlur={() => rename(level)}
                      className="input input-bordered input-sm w-full max-w-xs"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      {level.isDefault
                        ? "Default — uses the product retail price"
                        : level.productCount
                          ? `${level.productCount} product price${level.productCount === 1 ? "" : "s"} configured`
                          : "No product prices configured yet"}
                    </p>
                  </div>
                  {level.isDefault ? (
                    <span className="badge badge-neutral">Default</span>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={index === 0 || save.isPending}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={index === extras.length - 1 || save.isPending}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-red-600 hover:text-red-700"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${level.name}? Its product prices at this level will also be removed.`,
                            )
                          )
                            remove.mutate(level.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="card bg-white shadow-xl w-full max-w-md"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({ name, sortOrder: levels.data?.length ?? 0 });
            }}
          >
            <div className="card-body">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Add price level</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-circle"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Name</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Wholesale"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input input-bordered"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary mt-4"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : "Save level"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function SubscriptionTab({ notify }: { notify: (s: string) => void }) {
  const [code, setCode] = useState("");
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
  });
  const status = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => window.storePos.cloud.billingStatus(),
    enabled: cloud.data?.status !== "signed_out",
  });
  const client = useQueryClient();
  const redeem = useMutation({
    mutationFn: () => window.storePos.cloud.redeemCode(code.trim()),
    onSuccess: (result) => {
      setCode("");
      void client.invalidateQueries({ queryKey: ["billing-status"] });
      notify(
        result.daysAdded
          ? `${result.daysAdded} days added to your plan`
          : "Plan updated successfully",
      );
    },
    onError: (error: Error) => notify(error.message),
  });

  const until = status.data?.premiumUntil
    ? new Date(status.data.premiumUntil)
    : null;
  const days = until
    ? Math.max(0, Math.floor((until.getTime() - Date.now()) / 86400000))
    : 0;
  const isPremium = until && until.getTime() > Date.now();
  const isExpiringSoon = days > 0 && days < 7;

  const tierName =
    status.data?.tier === "cloud_pro"
      ? "Cloud Pro"
      : status.data?.tier === "offline_plus"
        ? "Offline Plus"
        : "Free Offline";

  if (cloud.data?.status === "signed_out") {
    return (
      <section>
        <header className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Plan & Subscription
          </h2>
        </header>
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <h3 className="text-xl font-bold mb-2">Not Connected</h3>
            <p className="text-gray-600 mb-4">
              Sign in to your shop account from Settings to view and manage your
              subscription plan.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => notify("Go to Settings → Cloud to sign in")}
            >
              Go to Settings
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Plan & Subscription
          </h2>
          <p className="text-gray-600">
            Manage your Store POS plan, redeem codes, and view available
            features.
          </p>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() =>
            void client.invalidateQueries({ queryKey: ["billing-status"] })
          }
        >
          Refresh
        </button>
      </header>

      {/* Current Plan Card */}
      <div
        className={`card shadow-lg mb-6 ${isPremium ? "bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-600" : "bg-white"}`}
      >
        <div className="card-body">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="badge badge-primary mb-2">{tierName}</span>
              <h3 className="text-xl font-bold">
                {isPremium ? "Active Subscription" : "Free Plan"}
              </h3>
            </div>
          </div>
          {isPremium ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="stat bg-white rounded-lg">
                  <div className="stat-title">Days Remaining</div>
                  <div
                    className={`stat-value text-2xl ${isExpiringSoon ? "text-warning" : "text-green-600"}`}
                  >
                    {days}
                  </div>
                </div>
                <div className="stat bg-white rounded-lg">
                  <div className="stat-title">Valid Until</div>
                  <div className="stat-value text-2xl">
                    {until.toLocaleDateString()}
                  </div>
                </div>
              </div>
              {isExpiringSoon && (
                <div className="alert alert-warning">
                  <span>
                    ⚠️ Your subscription expires in {days}{" "}
                    {days === 1 ? "day" : "days"}. Redeem a code below to renew.
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-600">
              Upgrade to a paid plan to unlock cloud sync, multi-device support,
              and advanced features.
            </p>
          )}
        </div>
      </div>

      {/* Features List */}
      <div className="card bg-white shadow-lg mb-6">
        <div className="card-body">
          <h3 className="text-xl font-bold mb-4">Features</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex items-start gap-3">
                <span className="text-green-600 text-xl">✓</span>
                <div>
                  <p className="font-medium">Offline POS</p>
                  <p className="text-sm text-gray-500">
                    Full point-of-sale system without internet
                  </p>
                </div>
              </div>
              <span className="badge badge-success">Available</span>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex items-start gap-3">
                <span className="text-green-600 text-xl">✓</span>
                <div>
                  <p className="font-medium">Receipt Printing</p>
                  <p className="text-sm text-gray-500">
                    Thermal printer support (58mm & 80mm)
                  </p>
                </div>
              </div>
              <span className="badge badge-success">Available</span>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex items-start gap-3">
                <span
                  className={`text-xl ${isPremium ? "text-green-600" : "text-gray-400"}`}
                >
                  {isPremium ? "✓" : "🔒"}
                </span>
                <div>
                  <p className="font-medium">Multi-Device Sync</p>
                  <p className="text-sm text-gray-500">
                    Real-time sync across all devices
                  </p>
                </div>
              </div>
              <span
                className={`badge ${isPremium ? "badge-success" : "badge-ghost"}`}
              >
                {isPremium ? "Available" : "Premium"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex items-start gap-3">
                <span
                  className={`text-xl ${isPremium ? "text-green-600" : "text-gray-400"}`}
                >
                  {isPremium ? "✓" : "🔒"}
                </span>
                <div>
                  <p className="font-medium">Cloud Backup</p>
                  <p className="text-sm text-gray-500">
                    Automatic cloud backup and recovery
                  </p>
                </div>
              </div>
              <span
                className={`badge ${isPremium ? "badge-success" : "badge-ghost"}`}
              >
                {isPremium ? "Available" : "Premium"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex items-start gap-3">
                <span
                  className={`text-xl ${isPremium ? "text-green-600" : "text-gray-400"}`}
                >
                  {isPremium ? "✓" : "🔒"}
                </span>
                <div>
                  <p className="font-medium">Advanced Reports</p>
                  <p className="text-sm text-gray-500">
                    Detailed analytics and insights
                  </p>
                </div>
              </div>
              <span
                className={`badge ${isPremium ? "badge-success" : "badge-ghost"}`}
              >
                {isPremium ? "Available" : "Premium"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Redeem Code Form */}
      <form
        className="card bg-white shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          redeem.mutate();
        }}
      >
        <div className="card-body">
          <h3 className="text-xl font-bold mb-2">Redeem Plan Code</h3>
          <p className="text-gray-600 mb-4">
            Enter a prepaid code to activate or extend your subscription. Codes
            are in the format{" "}
            <code className="bg-gray-100 px-2 py-1 rounded">
              XXXX-XXXX-XXXC
            </code>
            .
          </p>
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Redemption Code</span>
            </label>
            <input
              type="text"
              required
              value={code}
              placeholder="XXXX-XXXX-XXXC"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={14}
              autoFocus
              className="input input-bordered"
            />
            <label className="label">
              <span className="label-text-alt text-gray-500">
                Codes are case-insensitive and include a checksum character
              </span>
            </label>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={redeem.isPending || code.trim().length < 12}
          >
            {redeem.isPending ? "Redeeming…" : "Redeem Code"}
          </button>
        </div>
      </form>
    </section>
  );
}

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
          ? `${found.length} installed printer${found.length === 1 ? "" : "s"} found. Choose your receipt printer below.`
          : "No printers found. Pair or install the printer in Windows or macOS, then search again.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not read installed printers.",
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
        `Test receipt sent to ${printer.data?.deviceName}. Check the paper width and Burmese text.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Test print failed.";
      setStatus(message);
      notify(message);
    } finally {
      setTesting(false);
    }
  };
  return (
    <section>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Printer setup</h2>
        <p className="text-gray-600">
          Set up a thermal receipt printer once, then reprint from Sales history
          whenever needed.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <h3 className="text-xl font-bold mb-4">
              Connect through your computer
            </h3>
            <div className="space-y-3">
              <div className="p-3 border border-gray-200 rounded">
                <p className="font-medium mb-1">1. Pair or install</p>
                <p className="text-sm text-gray-500">
                  Connect USB, Bluetooth, or Wi‑Fi printers in Windows or macOS
                  first.
                </p>
              </div>
              <div className="p-3 border border-gray-200 rounded">
                <p className="font-medium mb-1">2. Find and choose it</p>
                <p className="text-sm text-gray-500">
                  Store POS uses the operating system printer driver for
                  reliable printing.
                </p>
              </div>
              <div className="p-3 border border-gray-200 rounded">
                <p className="font-medium mb-1">3. Test before selling</p>
                <p className="text-sm text-gray-500">
                  The sample includes Burmese text, a fractional quantity,
                  discount, cash, and change.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              If a test fails, check the printer’s power, paper, cover, driver,
              and 58/80 mm setting. Sales are safely saved even when printing
              fails.
            </p>
          </div>
          <div className="card bg-white shadow-lg">
            <div className="card-body">
              <h3 className="text-xl font-bold mb-4">Receipt printer</h3>
              <button
                className="btn btn-ghost w-full mb-4"
                disabled={finding}
                onClick={() => void find()}
              >
                {finding ? "Finding printers…" : "Find installed printers"}
              </button>
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Printer</span>
                </label>
                <select
                  value={printer.data?.deviceName ?? ""}
                  disabled={!printer.data}
                  onChange={(event) => {
                    if (!printer.data) return;
                    void save({
                      ...printer.data,
                      deviceName: event.target.value || null,
                    }).then(() =>
                      setStatus(
                        event.target.value
                          ? "Printer saved. Print a test receipt to verify it."
                          : "Printer selection cleared.",
                      ),
                    );
                  }}
                  className="select select-bordered"
                >
                  <option value="">Choose printer</option>
                  {printer.data?.deviceName &&
                    !printers.some(
                      (item) => item.name === printer.data.deviceName,
                    ) && (
                      <option value={printer.data.deviceName}>
                        {printer.data.deviceName} (saved)
                      </option>
                    )}
                  {printers.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Paper width</span>
                </label>
                <select
                  value={printer.data?.paperWidth ?? 80}
                  disabled={!printer.data}
                  onChange={(event) => {
                    if (printer.data)
                      void save({
                        ...printer.data,
                        paperWidth: Number(event.target.value) as 58 | 80,
                      }).then(() => setStatus("Paper width saved."));
                  }}
                  className="select select-bordered"
                >
                  <option value={58}>58 mm</option>
                  <option value={80}>80 mm</option>
                </select>
              </div>
              <div className="form-control mb-4">
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    checked={printer.data?.autoPrint ?? false}
                    disabled={!printer.data}
                    onChange={(event) => {
                      if (printer.data)
                        void save({
                          ...printer.data,
                          autoPrint: event.target.checked,
                        }).then(() =>
                          setStatus(
                            event.target.checked
                              ? "Auto-print is on."
                              : "Auto-print is off.",
                          ),
                        );
                    }}
                    className="checkbox checkbox-primary"
                  />
                  <span className="label-text">Auto-print after sale</span>
                </label>
              </div>
              <button
                className="btn btn-primary w-full mb-4"
                disabled={!printer.data?.deviceName || testing}
                onClick={() => void test()}
              >
                {testing ? "Sending test receipt…" : "Print test receipt"}
              </button>
              {status && (
                <div className="alert alert-info">
                  <span className="text-sm">{status}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GeneralTab({ notify }: { notify: (s: string) => void }) {
  const [apiUrl, setApiUrl] = useState(
    import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
  );
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Desktop counter");
  const [profile, setProfile] = useState({
    name: "",
    address: "",
    phone: "",
    receiptFooter: "",
  });
  const [printers, setPrinters] = useState<
    { name: string; displayName: string }[]
  >([]);
  const cloud = useQuery({
    queryKey: ["cloud"],
    queryFn: () => window.storePos.cloud.state(),
  });
  const printer = useQuery({
    queryKey: ["printer"],
    queryFn: () => window.storePos.printer.settings(),
  });
  const storedProfile = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => window.storePos.pos.shopProfile(),
  });
  const devices = useQuery({
    queryKey: ["cloud-devices"],
    queryFn: () => window.storePos.cloud.devices(),
    enabled: cloud.data?.status === "idle" || cloud.data?.status === "syncing",
  });
  const client = useQueryClient();
  useEffect(() => {
    if (storedProfile.data) setProfile(storedProfile.data);
  }, [storedProfile.data]);
  const refresh = () => void client.invalidateQueries({ queryKey: ["cloud"] });
  const login = useMutation({
    mutationFn: async () => {
      await window.storePos.cloud.setApiUrl(apiUrl);
      return window.storePos.cloud.login({ phone, password, deviceName });
    },
    onSuccess: () => {
      setPassword("");
      refresh();
      notify("Desktop paired and synced");
    },
    onError: (e: Error) => notify(e.message),
  });
  const saveProfile = useMutation({
    mutationFn: () => window.storePos.pos.saveShopProfile(profile),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["shop-profile"] });
      notify("Shop profile saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => window.storePos.cloud.revokeDevice(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cloud-devices"] });
      notify("Device removed");
    },
    onError: (error: Error) => notify(error.message),
  });
  const connected = cloud.data?.status !== "signed_out";
  return (
    <section>
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          General Settings
        </h2>
        <p className="text-gray-600">
          Receipt profile, cloud backup, paired devices, and desktop printing.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          className="card bg-white shadow-lg"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile.mutate();
          }}
        >
          <div className="card-body">
            <h3 className="text-xl font-bold mb-4">Shop & receipt</h3>
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Shop name</span>
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
                className="input input-bordered"
              />
            </div>
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Address</span>
              </label>
              <input
                type="text"
                value={profile.address}
                onChange={(e) =>
                  setProfile({ ...profile, address: e.target.value })
                }
                className="input input-bordered"
              />
            </div>
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Phone</span>
              </label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
                className="input input-bordered"
              />
            </div>
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Receipt footer</span>
              </label>
              <input
                type="text"
                value={profile.receiptFooter}
                onChange={(e) =>
                  setProfile({ ...profile, receiptFooter: e.target.value })
                }
                className="input input-bordered"
              />
            </div>
            <div className="p-4 bg-gray-50 rounded mb-4">
              <p className="font-medium">{profile.name.trim() || "My Shop"}</p>
              <p className="text-sm text-gray-500">
                {profile.address}
                {profile.phone ? ` · ${profile.phone}` : ""}
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={saveProfile.isPending}
            >
              {saveProfile.isPending ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
        {connected ? (
          <div className="card bg-white shadow-lg">
            <div className="card-body">
              <h3 className="text-xl font-bold mb-4">Connected to Cloud</h3>
              <div className="space-y-4">
                <div>
                  <p className="font-bold text-lg">{cloud.data?.shopName}</p>
                  <p className="text-sm text-gray-500">
                    This desktop · {cloud.data?.deviceCode} ·{" "}
                    {cloud.data?.role ?? "staff"}
                  </p>
                </div>
                <button
                  className="btn btn-primary w-full"
                  onClick={() =>
                    window.storePos.cloud
                      .syncNow()
                      .then(() => {
                        refresh();
                        notify("Sync finished");
                      })
                      .catch((e) => notify(e.message))
                  }
                >
                  Sync now
                </button>
                <p className="text-sm text-gray-500">
                  {cloud.data?.pending ?? 0} changes waiting ·{" "}
                  {cloud.data?.lastSyncedAt
                    ? `last synced ${new Date(cloud.data.lastSyncedAt).toLocaleString()}`
                    : "not synced yet"}
                </p>

                <div className="divider"></div>
                <h4 className="font-bold">Paired devices</h4>
                <div className="space-y-2">
                  {devices.data?.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-start p-3 border border-gray-200 rounded"
                    >
                      <div>
                        <p className="font-medium">
                          {item.name} ({item.deviceCode})
                        </p>
                        <p className="text-sm text-gray-500">
                          {item.isCurrent
                            ? "This desktop"
                            : item.lastSyncedAt
                              ? `Last synced ${new Date(item.lastSyncedAt).toLocaleString()}`
                              : "Never synced"}
                        </p>
                      </div>
                      {cloud.data?.role === "owner" && !item.isCurrent ? (
                        <button
                          className="btn btn-ghost btn-sm text-red-600"
                          disabled={revoke.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${item.name}? It will no longer connect to this shop.`,
                              )
                            )
                              revoke.mutate(item.id);
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-outline btn-error w-full"
                  onClick={() =>
                    window.storePos.cloud.signOut().then(() => {
                      refresh();
                      notify(
                        "Cloud disconnected; local data remains on this desktop.",
                      );
                    })
                  }
                >
                  Disconnect Cloud
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card bg-white shadow-lg">
            <div className="card-body">
              <h3 className="text-xl font-bold mb-4">Cloud backup</h3>
              <p className="text-gray-600 mb-4">
                Use POS offline first, or connect this desktop to back up and
                sync with the shop.
              </p>
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">API URL</span>
                  </label>
                  <input
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="input input-bordered"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Shop phone</span>
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input input-bordered"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Password</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input input-bordered"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">This desktop name</span>
                  </label>
                  <input
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="input input-bordered"
                  />
                </div>
                <button
                  className="btn btn-primary w-full"
                  onClick={() => login.mutate()}
                >
                  {login.isPending ? "Connecting…" : "Connect desktop"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="card bg-white shadow-lg">
          <div className="card-body">
            <h3 className="text-xl font-bold mb-4">Receipt printer</h3>
            <div className="space-y-4">
              <button
                className="btn btn-outline w-full"
                onClick={() =>
                  window.storePos.printer
                    .list()
                    .then(setPrinters)
                    .catch((e) => notify(e.message))
                }
              >
                Find installed printers
              </button>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Printer</span>
                </label>
                <select
                  value={printer.data?.deviceName ?? ""}
                  onChange={(e) =>
                    printer.data &&
                    window.storePos.printer
                      .saveSettings({
                        ...printer.data,
                        deviceName: e.target.value || null,
                      })
                      .then(() =>
                        client.invalidateQueries({ queryKey: ["printer"] }),
                      )
                  }
                  className="select select-bordered"
                >
                  <option value="">Choose printer</option>
                  {printers.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Paper width</span>
                </label>
                <select
                  value={printer.data?.paperWidth ?? 80}
                  onChange={(e) =>
                    printer.data &&
                    window.storePos.printer
                      .saveSettings({
                        ...printer.data,
                        paperWidth: Number(e.target.value) as 58 | 80,
                      })
                      .then(() =>
                        client.invalidateQueries({ queryKey: ["printer"] }),
                      )
                  }
                  className="select select-bordered"
                >
                  <option value={58}>58 mm</option>
                  <option value={80}>80 mm</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label cursor-pointer">
                  <span className="label-text">Auto-print receipts</span>
                  <input
                    type="checkbox"
                    checked={printer.data?.autoPrint ?? false}
                    onChange={(e) =>
                      printer.data &&
                      window.storePos.printer
                        .saveSettings({
                          ...printer.data,
                          autoPrint: e.target.checked,
                        })
                        .then(() =>
                          client.invalidateQueries({ queryKey: ["printer"] }),
                        )
                    }
                    className="checkbox"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
