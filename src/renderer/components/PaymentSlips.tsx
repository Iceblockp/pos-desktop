import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currentCurrency, formatCurrency } from '../../shared/currency';

export function PaymentSlips({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const slips = useQuery({
    queryKey: ["payment-slips"],
    queryFn: () => window.storePos.cloud.listSlips(),
  });

  const [tier, setTier] = useState<"offline_plus" | "cloud_pro">("cloud_pro");
  const [method, setMethod] = useState("kbzpay");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      window.storePos.cloud.submitSlip({
        tier,
        method,
        amount: Number(amount),
        reference: reference.trim(),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setReference("");
      setNote("");
      setAmount("");
      setShowForm(false);
      void client.invalidateQueries({ queryKey: ["payment-slips"] });
      notify("Payment slip submitted for review");
    },
    onError: (e: Error) => notify(e.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="badge badge-success text-white badge-sm">Approved</span>;
      case "rejected":
        return <span className="badge badge-error text-white badge-sm">Rejected</span>;
      default:
        return <span className="badge badge-warning badge-sm">Under Review</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="font-semibold text-slate-800 text-base">Bank / Mobile Wallet Transfers</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Paid directly via KBZPay or WavePay? Submit transaction reference for manual plan renewal
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="btn btn-sm btn-outline"
        >
          {showForm ? "Cancel" : "+ Submit Payment Slip"}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-600">Plan Tier</span>
                </label>
                <select
                  className="select select-bordered select-sm"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as typeof tier)}
                >
                  <option value="offline_plus">Offline Plus</option>
                  <option value="cloud_pro">Cloud Pro</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-600">Payment Channel</span>
                </label>
                <select
                  className="select select-bordered select-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="kbzpay">KBZPay</option>
                  <option value="wavepay">WavePay</option>
                  <option value="ayapay">AYAPay</option>
                  <option value="bank">Bank Transfer (KBZ, CB, AYA)</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-600">Amount Paid ({currentCurrency().code})</span>
                </label>
                <input
                  className="input input-bordered input-sm"
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-600">Transaction Ref / ID</span>
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
                <span className="label-text text-xs font-bold text-slate-600">Notes / Remarks (Optional)</span>
              </label>
              <input
                className="input input-bordered input-sm"
                maxLength={500}
                placeholder="Account name, phone number or remarks"
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
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={submit.isPending}
              >
                {submit.isPending ? "Submitting…" : "Submit Slip"}
              </button>
            </div>
          </form>
        )}

        {/* History of Submitted Slips */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Submitted Payment History
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
                      Tier: <strong className="capitalize">{slip.tier.replace("_", " ")}</strong> · Amount:{" "}
                      <strong>{formatCurrency(Number(slip.amount))}</strong>
                    </p>
                    {slip.reviewNote && (
                      <p className="text-indigo-600 italic">Reviewer note: {slip.reviewNote}</p>
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
              No manual payment slips submitted yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
