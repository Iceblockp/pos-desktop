import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCapabilities } from "../useCapabilities";

export function FeatureSettings({ notify }: { notify: (message: string) => void }) {
  const value = useCapabilities();
  const client = useQueryClient();

  const save = useMutation({
    mutationFn: ({
      name,
      enabled,
    }: {
      name: "debt" | "expenses" | "dayEnd";
      enabled: boolean;
    }) => window.storePos.pos.setFeature(name, enabled),
    onSuccess: () => {
      void client.invalidateQueries();
    },
    onError: (e: Error) => notify(e.message),
  });

  const features: {
    key: "debt" | "expenses" | "dayEnd";
    title: string;
    description: string;
    icon: string;
  }[] = [
    {
      key: "debt",
      title: "Customer Credit & Debt",
      description: "Allow selling on account and tracking customer receivables ledger",
      icon: "👥",
    },
    {
      key: "expenses",
      title: "Petty Cash & Expenses",
      description: "Record daily shop cash payouts and operational expenses in cash drawer",
      icon: "💸",
    },
    {
      key: "dayEnd",
      title: "Day-End Register Reconciliation",
      description: "Require shift open floats and end-of-day cash reconciliation",
      icon: "🔒",
    },
  ];

  const isPaid = value.effectivePlan !== "free";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="font-semibold text-slate-800 text-base">Shop Features</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Turn operational capabilities on or off based on your store workflow
          </p>
        </div>
        <span
          className={`badge badge-sm font-semibold capitalize ${
            isPaid ? "badge-success text-white" : "badge-neutral"
          }`}
        >
          {value.effectivePlan} Plan
        </span>
      </div>

      {!isPaid && (
        <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
          <span className="text-amber-600 text-lg">💡</span>
          <p className="text-xs text-amber-800">
            Customer debt, expenses, and register shifts require an active <strong>Offline Plus</strong> or <strong>Cloud Pro</strong> plan.
          </p>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {features.map((feature) => {
          const checked = Boolean(value.flags[feature.key]);
          return (
            <div
              key={feature.key}
              className="p-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <span className="text-2xl p-2 bg-slate-100 rounded-lg">{feature.icon}</span>
                <div>
                  <h4 className="text-sm font-medium text-slate-800">{feature.title}</h4>
                  <p className="text-xs text-slate-500">{feature.description}</p>
                </div>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={checked}
                disabled={save.isPending}
                onChange={(e) =>
                  save.mutate({ name: feature.key, enabled: e.target.checked })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
