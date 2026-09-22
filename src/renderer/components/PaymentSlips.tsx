import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const formatPlanPrice = (amount: number) => `${new Intl.NumberFormat('en-US').format(amount)} Ks`;

export function PaymentSlips({
  notify,
  tier = "cloud_pro",
  amount: packageAmount = 15000,
  packageLabel = "၁ လ",
}: {
  notify: (message: string) => void;
  tier?: "offline_plus" | "cloud_pro";
  amount?: number;
  packageLabel?: string;
}) {
  const client = useQueryClient();
  const slips = useQuery({
    queryKey: ["payment-slips"],
    queryFn: () => window.storePos.cloud.listSlips(),
  });

  const [method, setMethod] = useState("kbzpay");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      window.storePos.cloud.submitSlip({
        tier,
        method,
        amount: packageAmount,
        reference: reference.trim(),
        note: [
          `Package: ${tier} · ${packageLabel}`,
          note.trim(),
        ].filter(Boolean).join(" · "),
      }),
    onSuccess: () => {
      setReference("");
      setNote("");
      setShowForm(false);
      void client.invalidateQueries({ queryKey: ["payment-slips"] });
      notify("ငွေပေးချေမှုအထောက်အထားကို စစ်ဆေးရန် ပေးပို့ပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="badge badge-success text-white badge-sm">အတည်ပြုပြီး</span>;
      case "rejected":
        return <span className="badge badge-error text-white badge-sm">ငြင်းပယ်ထားသည်</span>;
      default:
        return <span className="badge badge-warning badge-sm">စစ်ဆေးနေသည်</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="font-semibold text-slate-800 text-base">ဘဏ် / Mobile Wallet ငွေလွှဲခြင်း</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            အစီအစဉ်ကျသင့်ငွေကို လွှဲပြီး ငွေလွှဲအမှတ်ပေးပို့ပါ။ စစ်ဆေးပြီးနောက် အစီအစဉ်ဖွင့်ပေးပါမည်။
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="btn btn-sm btn-outline"
        >
          {showForm ? "မလုပ်တော့ပါ" : "+ ငွေပေးချေမှုအထောက်အထား ပို့မည်"}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {showForm && (
          <form
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">ရွေးထားသောအစီအစဉ်</p>
                <p className="font-bold text-slate-800 capitalize">{tier.replace("_", " ")} · {packageLabel}</p>
              </div>
              <p className="text-xl font-black text-sky-700">{formatPlanPrice(packageAmount)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-600">ငွေပေးချေမှုနည်းလမ်း</span>
                </label>
                <select
                  className="select select-bordered select-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="kbzpay">KBZPay</option>
                  <option value="wavepay">WavePay</option>
                  <option value="ayapay">AYAPay</option>
                  <option value="bank">ဘဏ်ငွေလွှဲ (KBZ၊ CB၊ AYA)</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-600">ငွေလွှဲအမှတ် / ID</span>
                </label>
                <input
                  className="input input-bordered input-sm font-mono"
                  required
                  minLength={4}
                  maxLength={64}
                  placeholder="e.g. 2024090712345678"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-600">မှတ်ချက် (မဖြည့်လည်းရ)</span>
              </label>
              <input
                className="input input-bordered input-sm"
                maxLength={500}
                placeholder="အကောင့်အမည်၊ ဖုန်းနံပါတ် သို့မဟုတ် မှတ်ချက်"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setShowForm(false)}
              >
                မလုပ်တော့ပါ
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={submit.isPending}
              >
                {submit.isPending ? "ပေးပို့နေသည်…" : "အထောက်အထားပို့မည်"}
              </button>
            </div>
          </form>
        )}

        {/* History of Submitted Slips */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            ပေးပို့ထားသော ငွေပေးချေမှုမှတ်တမ်း
          </h4>

          {slips.error && (
            <p className="text-xs text-rose-600">{slips.error.message}</p>
          )}

          {slips.data && slips.data.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {slips.data.map((slip) => (
                <div
                  key={slip.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {slip.reference}
                      </span>
                      {statusBadge(slip.status)}
                    </div>
                    <p className="text-slate-500">
                      အစီအစဉ် — <strong className="capitalize">{slip.tier.replace("_", " ")}</strong> · ငွေပမာဏ —{" "}
                      <strong>{formatPlanPrice(Number(slip.amount))}</strong>
                    </p>
                    {slip.reviewNote && (
                      <p className="text-indigo-600 italic">စစ်ဆေးသူမှတ်ချက် — {slip.reviewNote}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {slip.createdAt ? new Date(slip.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
              ငွေပေးချေမှုအထောက်အထား မပေးပို့ရသေးပါ။
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
