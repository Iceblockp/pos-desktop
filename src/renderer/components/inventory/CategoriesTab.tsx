import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCapabilities } from "../../useCapabilities";

export function CategoriesTab({ notify }: { notify: (s: string) => void }) {
  const { owner } = useCapabilities();
  const [modal, setModal] = useState<"edit" | "new" | null>(null);
  const [editingId, setEditingId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const client = useQueryClient();

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => window.storePos.pos.categories(),
  });

  const productCounts = useQuery({ queryKey: ['category-product-counts'], queryFn: () => window.storePos.pos.categoryProductCounts() });

  const saveCategory = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveCategory({
        id: editingId || undefined,
        name: categoryName.trim(),
      }),
    onSuccess: () => {
      setModal(null);
      setCategoryName("");
      setEditingId("");
      void client.invalidateQueries({ queryKey: ["categories"] });
      void client.invalidateQueries({ queryKey: ["product-page"] });
      void client.invalidateQueries({ queryKey: ["category-product-counts"] });
      notify("အမျိုးအစား သိမ်းပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const removeCategory = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeCategory(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["categories"] });
      void client.invalidateQueries({ queryKey: ["product-page"] });
      void client.invalidateQueries({ queryKey: ["category-product-counts"] });
      notify("အမျိုးအစား ဖယ်ရှားပြီးပါပြီ။ သက်ဆိုင်ရာကုန်ပစ္စည်းများကို အမျိုးအစားမရှိအဖြစ် ထားပါမည်။");
    },
    onError: (e: Error) => notify(e.message),
  });

  const openNew = () => {
    setEditingId("");
    setCategoryName("");
    setModal("new");
  };

  const openEdit = (id: string, name: string) => {
    setEditingId(id);
    setCategoryName(name);
    setModal("edit");
  };

  const categoryCounts = productCounts.data?.byCategory ?? {};
  const uncategorizedCount = productCounts.data?.uncategorized ?? 0;

  return (
    <section className="flex-1 overflow-hidden flex flex-col gap-3">
      {/* Header */}
      <header className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            ကုန်ပစ္စည်းအမျိုးအစားများ
          </h2>
          <p className="text-xs text-gray-500">
            ကုန်ပစ္စည်းများကို အုပ်စုအလိုက် စီမံပါ
          </p>
        </div>
        {owner && (
          <button onClick={openNew} className="btn btn-primary btn-sm">
            + အမျိုးအစားအသစ်
          </button>
        )}
      </header>

      {/* Categories Card & Table */}
      <div className="card bg-white shadow-sm border border-gray-200/80 flex-1 overflow-hidden">
        <div className="card-body p-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <table className="table table-sm w-full">
              <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">အမျိုးအစားအမည်</th>
                  <th className="py-3 px-4 text-center">ကုန်ပစ္စည်းအရေအတွက်</th>
                  {owner && <th className="py-3 px-4 text-right">လုပ်ဆောင်ချက်</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {/* Uncategorized Pseudo-Row */}
                <tr className="bg-gray-50/50 text-gray-600">
                  <td className="py-3 px-4 font-medium italic">
                    အမျိုးအစားမရှိသော ကုန်ပစ္စည်းများ
                  </td>
                  <td className="py-3 px-4 text-center font-bold">
                    {uncategorizedCount}
                  </td>
                  {owner && <td className="py-3 px-4 text-right text-gray-400 italic">စနစ်၏ မူလအုပ်စု</td>}
                </tr>

                {categories.data?.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-semibold text-gray-900 text-sm">
                      {cat.name}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="badge badge-ghost badge-sm font-mono">
                        {categoryCounts[cat.id] ?? 0} ခု
                      </span>
                    </td>
                    {owner && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn btn-xs btn-ghost text-gray-700 hover:bg-gray-100"
                            onClick={() => openEdit(cat.id, cat.name)}
                          >
                            ပြင်မည်
                          </button>
                          <button
                            className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                            disabled={removeCategory.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `အမျိုးအစား “${cat.name}” ကို ဖယ်ရှားမည်လား။ သက်ဆိုင်ရာကုန်ပစ္စည်းများကို အမျိုးအစားမရှိအဖြစ် ပြောင်းပါမည်။`,
                                )
                              ) {
                                removeCategory.mutate(cat.id);
                              }
                            }}
                          >
                            ဖျက်မည်
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

                {!categories.data?.length && (
                  <tr>
                    <td
                      colSpan={owner ? 3 : 2}
                      className="text-center py-12 text-gray-400"
                    >
                      စိတ်ကြိုက်အမျိုးအစား မရှိသေးပါ။ အပေါ်မှ “အမျိုးအစားအသစ်” ကိုနှိပ်ပါ။
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Category Modal */}
      {modal && owner && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-3">
              {modal === "edit" ? "အမျိုးအစားပြင်မည်" : "အမျိုးအစားအသစ်"}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!categoryName.trim()) return;
                saveCategory.mutate();
              }}
              className="space-y-3"
            >
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold">
                    အမျိုးအစားအမည် *
                  </span>
                </label>
                <input
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="ဥပမာ အချိုရည်၊ မုန့်၊ လျှပ်စစ်ပစ္စည်း"
                  className="input input-bordered input-sm w-full"
                  autoFocus
                />
              </div>

              <div className="modal-action pt-2">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setModal(null)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={saveCategory.isPending || !categoryName.trim()}
                >
                  {saveCategory.isPending ? "သိမ်းနေသည်…" : "အမျိုးအစားသိမ်းမည်"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
