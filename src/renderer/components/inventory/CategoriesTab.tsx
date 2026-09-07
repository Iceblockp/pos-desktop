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

  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => window.storePos.pos.products(),
  });

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
      void client.invalidateQueries({ queryKey: ["products"] });
      notify("Category saved");
    },
    onError: (e: Error) => notify(e.message),
  });

  const removeCategory = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeCategory(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["categories"] });
      void client.invalidateQueries({ queryKey: ["products"] });
      notify("Category removed. Associated products are now uncategorized.");
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

  const productCounts = (categories.data ?? []).reduce<Record<string, number>>(
    (acc, cat) => {
      acc[cat.id] = (products.data ?? []).filter(
        (p) => p.categoryId === cat.id,
      ).length;
      return acc;
    },
    {},
  );

  const uncategorizedCount = (products.data ?? []).filter(
    (p) => !p.categoryId,
  ).length;

  return (
    <section className="flex-1 overflow-hidden flex flex-col gap-3">
      {/* Header */}
      <header className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            Product Categories
          </h2>
          <p className="text-xs text-gray-500">
            Organize catalog items into departments and groups
          </p>
        </div>
        {owner && (
          <button onClick={openNew} className="btn btn-primary btn-sm">
            + Add category
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
                  <th className="py-3 px-4">Category Name</th>
                  <th className="py-3 px-4 text-center">Products Count</th>
                  {owner && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {/* Uncategorized Pseudo-Row */}
                <tr className="bg-gray-50/50 text-gray-600">
                  <td className="py-3 px-4 font-medium italic">
                    Uncategorized Products
                  </td>
                  <td className="py-3 px-4 text-center font-bold">
                    {uncategorizedCount}
                  </td>
                  {owner && <td className="py-3 px-4 text-right text-gray-400 italic">Default system group</td>}
                </tr>

                {categories.data?.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-semibold text-gray-900 text-sm">
                      {cat.name}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="badge badge-ghost badge-sm font-mono">
                        {productCounts[cat.id] ?? 0} items
                      </span>
                    </td>
                    {owner && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn btn-xs btn-ghost text-gray-700 hover:bg-gray-100"
                            onClick={() => openEdit(cat.id, cat.name)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50"
                            disabled={removeCategory.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove category "${cat.name}"? Products in it will become Uncategorized.`,
                                )
                              ) {
                                removeCategory.mutate(cat.id);
                              }
                            }}
                          >
                            Delete
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
                      No custom categories created yet. Click "+ Add category" above.
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
              {modal === "edit" ? "Edit Category" : "New Category"}
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
                    Category Name *
                  </span>
                </label>
                <input
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Beverages, Bakery, Electronics"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={saveCategory.isPending || !categoryName.trim()}
                >
                  {saveCategory.isPending ? "Saving..." : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
