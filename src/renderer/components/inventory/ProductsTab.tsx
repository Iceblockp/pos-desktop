import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Product, StockMovement, Supplier } from "../../../shared/models";
import { StockModal } from "./StockModal";
import type { TierDraft } from "./types";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function ProductsTab({ notify }: { notify: (s: string) => void }) {
  const emptyForm = {
    id: "",
    name: "",
    barcode: "",
    price: "",
    cost: "",
    minStock: "",
    unit: "pcs",
    categoryId: "",
    supplierId: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [modal, setModal] = useState<
    "product" | "categories" | "category" | "stock" | "history" | null
  >(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryFormId, setCategoryFormId] = useState("");
  const [stock, setStock] = useState({
    action: "stock_in" as "stock_in" | "waste" | "adjustment",
    quantity: "",
    reason: "",
    supplierId: "",
    referenceNumber: "",
    unitCost: "",
  });
  const [tierDrafts, setTierDrafts] = useState<Record<string, TierDraft[]>>({});
  const client = useQueryClient();
  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => window.storePos.pos.products(),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => window.storePos.pos.categories(),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => window.storePos.pos.suppliers(),
  });
  const levels = useQuery({
    queryKey: ["price-levels"],
    queryFn: () => window.storePos.pos.priceLevels(),
  });
  const existingTiers = useQuery({
    queryKey: ["product-tiers", form.id],
    queryFn: () => window.storePos.pos.productTiers(form.id),
    enabled: modal === "product" && Boolean(form.id),
  });
  const history = useQuery({
    queryKey: ["stock-history", selectedProductId],
    queryFn: () => window.storePos.pos.stockHistory(selectedProductId),
    enabled: Boolean(selectedProductId),
  });
  const selected = products.data?.find(
    (product) => product.id === selectedProductId,
  );
  const extraLevels = levels.data?.filter((level) => !level.isDefault) ?? [];
  useEffect(() => {
    if (modal !== "product") return;
    if (!form.id) {
      setTierDrafts({});
      return;
    }
    if (!existingTiers.data) return;
    const grouped: Record<string, TierDraft[]> = {};
    for (const tier of existingTiers.data)
      (grouped[tier.priceLevelId] ??= []).push({
        key: tier.id,
        id: tier.id,
        minQuantity: String(tier.minQuantity),
        bulkPrice: String(tier.bulkPrice),
      });
    setTierDrafts(grouped);
  }, [modal, form.id, existingTiers.data]);
  const saveProduct = useMutation({
    mutationFn: async () => {
      const product = await window.storePos.pos.saveProduct({
        id: form.id || undefined,
        name: form.name,
        barcode: form.barcode || null,
        price: Number(form.price),
        cost: Number(form.cost || 0),
        minStock: Number(form.minStock || 0),
        unit: form.unit,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        isActive: true,
      });
      const existing = form.id
        ? await window.storePos.pos.productTiers(product.id)
        : [];
      for (const level of extraLevels) {
        const kept = new Set<string>();
        for (const row of tierDrafts[level.id] ?? []) {
          const minQuantity = Number(row.minQuantity);
          const bulkPrice = Number(row.bulkPrice);
          if (!(minQuantity > 0) || !(bulkPrice > 0)) continue;
          const saved = await window.storePos.pos.saveProductTier({
            id: row.id,
            productId: product.id,
            priceLevelId: level.id,
            minQuantity,
            bulkPrice,
          });
          kept.add(saved.id);
        }
        for (const tier of existing.filter(
          (item) => item.priceLevelId === level.id,
        ))
          if (!kept.has(tier.id))
            await window.storePos.pos.removeProductTier(tier.id);
      }
      return product;
    },
    onSuccess: () => {
      setModal(null);
      setTierDrafts({});
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["product-tiers"] });
      notify("Product saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const saveCategory = useMutation({
    mutationFn: () =>
      window.storePos.pos.saveCategory({
        id: categoryFormId || undefined,
        name: categoryName,
      }),
    onSuccess: () => {
      setCategoryName("");
      setCategoryFormId("");
      setModal("categories");
      void client.invalidateQueries({ queryKey: ["categories"] });
      notify("Category saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const removeCategory = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeCategory(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["categories"] });
      void client.invalidateQueries({ queryKey: ["products"] });
      notify("Category removed; linked products are now uncategorized.");
    },
    onError: (error: Error) => notify(error.message),
  });
  const adjustStock = useMutation({
    mutationFn: () =>
      window.storePos.pos.adjustStock(
        selectedProductId,
        stock.action === "waste"
          ? -Math.abs(Number(stock.quantity))
          : stock.action === "stock_in"
            ? Math.abs(Number(stock.quantity))
            : Number(stock.quantity),
        stock.action,
        stock.reason || undefined,
        {
          supplierId: stock.supplierId || null,
          referenceNumber: stock.referenceNumber || null,
          unitCost: stock.unitCost ? Number(stock.unitCost) : null,
        },
      ),
    onSuccess: () => {
      setModal(null);
      setStock({
        action: "stock_in",
        quantity: "",
        reason: "",
        supplierId: "",
        referenceNumber: "",
        unitCost: "",
      });
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({
        queryKey: ["stock-history", selectedProductId],
      });
      void client.invalidateQueries({ queryKey: ["supplier-spend"] });
      void client.invalidateQueries({ queryKey: ["supplier-purchases"] });
      notify("Stock updated");
    },
    onError: (error: Error) => notify(error.message),
  });
  const shown = products.data?.filter(
    (product) =>
      (!categoryId || product.categoryId === categoryId) &&
      (!lowOnly || product.quantity <= product.minStock) &&
      (!search ||
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.barcode?.includes(search)),
  );
  const openProduct = (product?: Product) => {
    setForm(
      product
        ? {
            id: product.id,
            name: product.name,
            barcode: product.barcode ?? "",
            price: String(product.price),
            cost: String(product.cost),
            minStock: String(product.minStock),
            unit: product.unit,
            categoryId: product.categoryId ?? "",
            supplierId: product.supplierId ?? "",
          }
        : emptyForm,
    );
    setModal("product");
  };
  const openFor = (product: Product, next: "stock" | "history") => {
    setSelectedProductId(product.id);
    if (next === "stock")
      setStock({
        action: "stock_in",
        quantity: "",
        reason: "",
        supplierId: suppliers.data?.some(
          (supplier) => supplier.id === product.supplierId,
        )
          ? (product.supplierId ?? "")
          : "",
        referenceNumber: "",
        unitCost: "",
      });
    setModal(next);
  };
  const addTier = (levelId: string) =>
    setTierDrafts((current) => ({
      ...current,
      [levelId]: [
        ...(current[levelId] ?? []),
        {
          key: `${levelId}-${Date.now()}-${Math.random()}`,
          id: "", // Empty ID for new tiers
          minQuantity: (current[levelId] ?? []).length ? "" : "1",
          bulkPrice: "",
        },
      ],
    }));
  const editTier = (levelId: string, key: string, patch: Partial<TierDraft>) =>
    setTierDrafts((current) => ({
      ...current,
      [levelId]: (current[levelId] ?? []).map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    }));
  const removeTier = (levelId: string, key: string) =>
    setTierDrafts((current) => ({
      ...current,
      [levelId]: (current[levelId] ?? []).filter((row) => row.key !== key),
    }));
  return (
    <section className="flex-1 overflow-hidden flex flex-col">
      {/* Compact Header */}
      <header className="mb-3 flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Products & stock</h2>
          <p className="text-xs text-gray-500">
            Manage products, prices, and stock levels
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-xs"
            onClick={() => setModal("categories")}
          >
            Categories
          </button>
          <button
            className="btn btn-primary btn-xs"
            onClick={() => openProduct()}
          >
            Add product
          </button>
        </div>
      </header>

      {/* Compact Search */}
      <div className="mb-3">
        <input
          placeholder="Search name or barcode"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input input-bordered input-sm w-full"
        />
      </div>

      {/* Compact Filter Chips */}
      <div className="flex flex-wrap gap-1 mb-3">
        <button
          className={`btn btn-xs ${!categoryId ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setCategoryId("")}
        >
          All
        </button>
        {categories.data?.map((category) => (
          <button
            key={category.id}
            className={`btn btn-xs ${categoryId === category.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
        <button
          className={`btn btn-xs ${lowOnly ? "btn-warning" : "btn-ghost"}`}
          onClick={() => setLowOnly(!lowOnly)}
        >
          Low stock
        </button>
      </div>

      {/* Compact Product List */}
      <div className="card bg-white shadow-lg flex-1 overflow-hidden">
        <div className="card-body p-3 flex flex-col overflow-hidden">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">Catalog</h3>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {shown?.length ? (
              shown.map((product) => (
                <div
                  key={product.id}
                  className="flex justify-between items-start p-2 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {product.quantity} {product.unit} ·{" "}
                      {categories.data?.find(
                        (category) => category.id === product.categoryId,
                      )?.name ?? "Uncategorized"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">
                      {money.format(product.price)}
                    </p>
                    <div className="flex gap-1 mt-1">
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => openFor(product, "stock")}
                      >
                        Stock
                      </button>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => openFor(product, "history")}
                      >
                        History
                      </button>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => openProduct(product)}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">
                  No products match these filters.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      {modal === "product" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">
              {form.id ? "Edit product" : "Add product"}
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setModal(null)}
            >
              ✕
            </button>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveProduct.mutate();
              }}
              className="space-y-4"
            >
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Name</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Barcode</span>
                </label>
                <input
                  value={form.barcode}
                  onChange={(event) =>
                    setForm({ ...form, barcode: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Retail price</span>
                </label>
                <input
                  required
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Cost</span>
                </label>
                <input
                  inputMode="decimal"
                  value={form.cost}
                  onChange={(event) =>
                    setForm({ ...form, cost: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              {extraLevels.map((level) => (
                <div
                  key={level.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <h4 className="font-semibold text-md mb-2">
                    {level.name} pricing
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    {tierDrafts[level.id]?.length
                      ? "A price from 1 is the flat level price. Higher quantities are optional breaks."
                      : "Falls back to retail until you add a price."}
                  </p>
                  {(tierDrafts[level.id] ?? []).map((row) => (
                    <div key={row.key} className="flex gap-2 items-center mb-2">
                      <input
                        required
                        inputMode="decimal"
                        aria-label={`${level.name} from quantity`}
                        placeholder="From"
                        value={row.minQuantity}
                        onChange={(event) =>
                          editTier(level.id, row.key, {
                            minQuantity: event.target.value,
                          })
                        }
                        className="input input-bordered input-sm flex-1"
                      />
                      <span className="text-gray-500">→</span>
                      <input
                        required
                        inputMode="decimal"
                        aria-label={`${level.name} unit price`}
                        placeholder="Unit price"
                        value={row.bulkPrice}
                        onChange={(event) =>
                          editTier(level.id, row.key, {
                            bulkPrice: event.target.value,
                          })
                        }
                        className="input input-bordered input-sm flex-1"
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-circle btn-ghost"
                        onClick={() => removeTier(level.id, row.key)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline mt-2"
                    onClick={() => addTier(level.id)}
                  >
                    {tierDrafts[level.id]?.length
                      ? "Add quantity break"
                      : `Set ${level.name} price`}
                  </button>
                </div>
              ))}

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Low-stock level</span>
                </label>
                <input
                  inputMode="decimal"
                  value={form.minStock}
                  onChange={(event) =>
                    setForm({ ...form, minStock: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Unit</span>
                </label>
                <input
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Category</span>
                </label>
                <select
                  className="select select-bordered"
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                >
                  <option value="">Uncategorized</option>
                  {categories.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Supplier</span>
                </label>
                <select
                  className="select select-bordered"
                  value={form.supplierId}
                  onChange={(event) =>
                    setForm({ ...form, supplierId: event.target.value })
                  }
                >
                  <option value="">No supplier</option>
                  {suppliers.data?.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveProduct.isPending}
                >
                  {saveProduct.isPending ? "Saving…" : "Save product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal === "categories" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Categories</h3>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setModal(null)}
            >
              ✕
            </button>

            <button
              className="btn btn-secondary btn-sm mb-4"
              onClick={() => {
                setCategoryFormId("");
                setCategoryName("");
                setModal("category");
              }}
            >
              Add category
            </button>

            <div className="space-y-2">
              {categories.data?.length ? (
                categories.data.map((category) => (
                  <div
                    key={category.id}
                    className="flex justify-between items-center p-3 border border-gray-200 rounded"
                  >
                    <span className="font-semibold">{category.name}</span>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => {
                          setCategoryFormId(category.id);
                          setCategoryName(category.name);
                          setModal("category");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-error"
                        disabled={removeCategory.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${category.name}? Products in it become uncategorized.`,
                            )
                          )
                            removeCategory.mutate(category.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">
                  No categories yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {modal === "category" && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">
              {categoryFormId ? "Edit category" : "Add category"}
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setModal("categories")}
            >
              ✕
            </button>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveCategory.mutate();
              }}
              className="space-y-4"
            >
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Category name</span>
                </label>
                <input
                  required
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  className="input input-bordered"
                />
              </div>

              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModal("categories")}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveCategory.isPending}
                >
                  {saveCategory.isPending ? "Saving…" : "Save category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal === "stock" && (
        <StockModal
          open
          product={selected}
          action={stock.action}
          setAction={(action) => setStock({ ...stock, action })}
          quantity={stock.quantity}
          setQuantity={(quantity) => setStock({ ...stock, quantity })}
          reason={stock.reason}
          setReason={(reason) => setStock({ ...stock, reason })}
          supplierId={stock.supplierId}
          setSupplierId={(supplierId) => setStock({ ...stock, supplierId })}
          referenceNumber={stock.referenceNumber}
          setReferenceNumber={(referenceNumber) =>
            setStock({ ...stock, referenceNumber })
          }
          unitCost={stock.unitCost}
          setUnitCost={(unitCost) => setStock({ ...stock, unitCost })}
          suppliers={suppliers.data ?? []}
          saving={adjustStock.isPending}
          onClose={() => setModal(null)}
          onSave={() => adjustStock.mutate()}
        />
      )}
      {modal === "history" && selected && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-4">
              {selected.name} · stock history
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setModal(null)}
            >
              ✕
            </button>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {history.data?.length ? (
                history.data.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex justify-between items-start p-3 border border-gray-200 rounded"
                  >
                    <div className="flex-1">
                      <p className="font-semibold">
                        {movement.type.replace("_", " ")}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(movement.occurredAt).toLocaleString()}
                        {movement.supplierName
                          ? ` · ${movement.supplierName}`
                          : ""}
                        {movement.referenceNumber
                          ? ` · ${movement.referenceNumber}`
                          : ""}
                        {movement.reason && movement.reason !== "Delivery"
                          ? ` · ${movement.reason}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold text-lg ${
                          movement.quantityDelta < 0
                            ? "text-error"
                            : "text-success"
                        }`}
                      >
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {movement.quantityDelta} {selected.unit}
                      </p>
                      <p className="text-sm text-gray-500">
                        {movement.unitCost != null
                          ? `Cost: ${money.format(movement.unitCost)} · `
                          : ""}
                        Balance: {movement.balance} {selected.unit}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">
                  No movements yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
