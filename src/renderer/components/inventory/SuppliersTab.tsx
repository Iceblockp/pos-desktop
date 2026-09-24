import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Supplier } from "../../../shared/models";
import { formatCurrency } from '../../../shared/currency';

const money = { format: formatCurrency };

export function SuppliersTab({ notify }: { notify: (s: string) => void }) {
  const empty = { id: "", name: "", contactName: "", phone: "", address: "" };
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"all" | "month">("month");
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"profile" | "history">("profile");

  const client = useQueryClient();

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const range = useMemo(() => {
    if (period === "all") return { from: undefined, to: undefined };
    const date = new Date();
    const from = new Date(date.getFullYear(), date.getMonth(), 1);
    return { from: from.toISOString(), to: date.toISOString() };
  }, [period]);

  const suppliers = useQuery({
    queryKey: ["suppliers", search, period],
    queryFn: async () => {
      const items = await window.storePos.pos.suppliers(search);
      return Promise.all(
        items.map(async (supplier) => ({
          supplier,
          spend: await window.storePos.pos.supplierSpend(
            supplier.id,
            range.from,
            range.to,
          ),
        })),
      );
    },
  });

  const purchases = useQuery({
    queryKey: ["supplier-purchases", form.id, period],
    queryFn: () =>
      window.storePos.pos.supplierPurchases(form.id, range.from, range.to),
    enabled: open && Boolean(form.id),
  });

  const save = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveSupplier({
        id: form.id || undefined,
        name: form.name,
        contactName: form.contactName || null,
        phone: form.phone || null,
        address: form.address || null,
      }),
    onSuccess: (supplier) => {
      setForm({
        id: supplier.id,
        name: supplier.name,
        contactName: supplier.contactName ?? "",
        phone: supplier.phone ?? "",
        address: supplier.address ?? "",
      });
      void client.invalidateQueries({ queryKey: ["suppliers"] });
      notify("ပေးသွင်းသူအချက်အလက် သိမ်းပြီးပါပြီ");
    },
    onError: (error: Error) => notify(error.message),
  });

  const remove = useMutation({
    mutationFn: () => window.storePos.pos.removeSupplier(form.id),
    onSuccess: () => {
      setOpen(false);
      setForm(empty);
      void client.invalidateQueries({ queryKey: ["suppliers"] });
      notify("ပေးသွင်းသူကို ဖယ်ရှားပြီး ယခင်ကုန်ပို့မှတ်တမ်းများကို ဆက်လက်သိမ်းထားပါသည်။");
    },
    onError: (error: Error) => notify(error.message),
  });

  const edit = (supplier: Supplier) => {
    setForm({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
    });
    setModalTab("profile");
    setOpen(true);
  };

  const add = () => {
    setForm(empty);
    setModalTab("profile");
    setOpen(true);
  };

  const totalSpend = useMemo(() => {
    if (!suppliers.data) return 0;
    return suppliers.data.reduce((sum, item) => sum + (item.spend || 0), 0);
  }, [suppliers.data]);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              ပေးသွင်းသူစုစုပေါင်း
            </p>
            <p className="text-xl font-black text-slate-800 mt-0.5">
              {suppliers.data?.length ?? 0}
            </p>
          </div>
          <span className="text-2xl">🏢</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              ကုန်ဝယ်သုံးငွေ ({period === "month" ? "ယခုလ" : "ကာလအားလုံး"})
            </p>
            <p className="text-xl font-black text-emerald-700 mt-0.5">
              {money.format(totalSpend)}
            </p>
          </div>
          <span className="text-2xl">💰</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-md">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-xs">
              🔍
            </span>
            <input
              placeholder="ပေးသွင်းသူ၊ ဆက်သွယ်ရန်အမည် သို့မဟုတ် ဖုန်းဖြင့်ရှာပါ…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input input-bordered input-sm w-full pl-9 text-xs bg-gray-50 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setPeriod("month")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                period === "month"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              ယခုလ
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                period === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              ကာလအားလုံး
            </button>
          </div>

          <button onClick={add} className="btn btn-primary btn-sm">
            + ပေးသွင်းသူအသစ်
          </button>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="card bg-white shadow-sm border border-gray-200/80 flex-1 overflow-hidden">
        <div className="card-body p-0 flex flex-col overflow-hidden">
          {suppliers.data?.length ? (
            <div className="flex-1 overflow-y-auto">
              <table className="table table-sm w-full">
                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold">ပေးသွင်းသူအမည်</th>
                    <th className="py-3 px-4 font-semibold">ဆက်သွယ်ရန်အမည်</th>
                    <th className="py-3 px-4 font-semibold">ဖုန်းနံပါတ်</th>
                    <th className="py-3 px-4 font-semibold">လိပ်စာ / နေရာ</th>
                    <th className="py-3 px-4 font-semibold text-right">
                      ဝယ်ယူငွေ ({period === "month" ? "ယခုလ" : "ကာလအားလုံး"})
                    </th>
                    <th className="py-3 px-4 font-semibold text-right">လုပ်ဆောင်ချက်</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {suppliers.data.map(({ supplier, spend }) => (
                    <tr
                      key={supplier.id}
                      className="hover:bg-gray-50/80 transition group"
                    >
                      <td className="py-3 px-4">
                        <span className="font-bold text-sm text-gray-900 block leading-tight">
                          {supplier.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {supplier.contactName || (
                          <span className="text-gray-400 italic">မသတ်မှတ်ထားပါ</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-600">
                        {supplier.phone || (
                          <span className="text-gray-400 italic">မသတ်မှတ်ထားပါ</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                        {supplier.address || (
                          <span className="text-gray-400 italic">မသတ်မှတ်ထားပါ</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-slate-800">
                          {money.format(spend)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          className="btn btn-xs btn-outline font-medium hover:bg-slate-800 hover:text-white"
                          onClick={() => edit(supplier)}
                        >
                          ကြည့်မည် / ပြင်မည်
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-gray-400">
              <span className="text-4xl mb-2">🏢</span>
              <p className="text-base font-semibold text-gray-700">
                {suppliers.isLoading ? "ပေးသွင်းသူစာရင်း ဖတ်နေသည်…" : "ပေးသွင်းသူ မတွေ့ပါ"}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                အဝယ်ဘောက်ချာနှင့် ကုန်ပို့မှုများမှတ်တမ်းတင်ရန် ပေးသွင်းသူအချက်အလက် ထည့်ပါ
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Supplier Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  {form.id ? `Supplier: ${form.name}` : "ပေးသွင်းသူအသစ် ထည့်မည်"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ပေးသွင်းသူ၊ ဆက်သွယ်ရန်အမည်နှင့် ဆက်စပ်အဝယ်မှတ်တမ်း
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle text-slate-400 hover:text-slate-700"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs if existing */}
            {form.id && (
              <div className="px-5 pt-3 border-b border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalTab("profile")}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
                    modalTab === "profile"
                      ? "border-emerald-600 text-emerald-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  ဆက်သွယ်ရန်အချက်အလက်
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("history")}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                    modalTab === "history"
                      ? "border-emerald-600 text-emerald-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>ဝယ်ယူမှုမှတ်တမ်း</span>
                  <span className="badge badge-xs badge-neutral">
                    {purchases.data?.length ?? 0}
                  </span>
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1">
              {modalTab === "profile" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    save.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold text-slate-700">
                        ပေးသွင်းသူ / လုပ်ငန်းအမည်
                      </span>
                    </label>
                    <input
                      required
                      placeholder="ဥပမာ မြို့မဖြန့်ချိရေး"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="input input-bordered input-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-bold text-slate-700">
                          ဆက်သွယ်ရန်အမည်
                        </span>
                      </label>
                      <input
                        placeholder="ဥပမာ ကိုအောင်"
                        value={form.contactName}
                        onChange={(e) =>
                          setForm({ ...form, contactName: e.target.value })
                        }
                        className="input input-bordered input-sm"
                      />
                    </div>

                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-bold text-slate-700">
                          ဖုန်းနံပါတ်
                        </span>
                      </label>
                      <input
                        placeholder="e.g. 09-12345678"
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                        className="input input-bordered input-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-bold text-slate-700">
                        ဂိုဒေါင် / ရုံးလိပ်စာ
                      </span>
                    </label>
                    <textarea
                      placeholder="ဥပမာ စက်မှုဇုန် ၁၊ လှိုင်သာယာ"
                      value={form.address}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      className="textarea textarea-bordered textarea-sm h-16"
                    />
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    {form.id ? (
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          if (
                            window.confirm(
                              `ပေးသွင်းသူ ${form.name} ကို ဖယ်ရှားမည်လား။ ယခင်ကုန်ပို့မှတ်တမ်းများ မပျက်ပါ။`,
                            )
                          )
                            remove.mutate();
                        }}
                        disabled={remove.isPending}
                      >
                        ပေးသွင်းသူဖျက်မည်
                      </button>
                    ) : (
                      <div></div>
                    )}

                    <div className="flex gap-2">
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
                        {save.isPending ? "သိမ်းနေသည်…" : "ပေးသွင်းသူသိမ်းမည်"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* Purchase History Tab */
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                    <span>ကုန်ပို့မှုနှင့် ကုန်ဝင်မှတ်တမ်း</span>
                    <span>မှတ်တမ်းကာလ — {period === "month" ? "ယခုလ" : "ကာလအားလုံး"}</span>
                  </div>

                  {purchases.data?.length ? (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {purchases.data.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="p-3 flex items-center justify-between text-xs hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-semibold text-slate-800">
                              {purchase.productName}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {new Date(purchase.occurredAt).toLocaleString()}
                              {purchase.referenceNumber
                                ? ` · Invoice: #${purchase.referenceNumber}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="badge badge-sm badge-success text-white font-mono font-bold">
                              +{purchase.quantity}
                            </span>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {purchase.unitCost == null
                                ? "ဝယ်ရင်းစျေး မမှတ်ထားပါ"
                                : `${money.format(purchase.unitCost)}/unit`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      ဤကာလအတွင်း ပေးသွင်းသူ၏ ကုန်ပို့မှတ်တမ်းမရှိပါ။
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
