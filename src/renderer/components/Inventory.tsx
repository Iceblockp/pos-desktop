import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Product, StockMovement, Supplier } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

type TierDraft = {
  key: string;
  id: string;
  minQuantity: string;
  bulkPrice: string;
};

export function Inventory({ notify }: { notify: (s: string) => void }) {
  const [tab, setTab] = useState<"products" | "suppliers">("products");

  return (
    <section className="h-full">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📦 Inventory</h1>
        <p className="text-gray-600">
          Manage your products, stock levels, and suppliers
        </p>
      </header>
      <div role="tablist" className="tabs tabs-boxed mb-6 bg-gray-100">
        <button
          role="tab"
          className={`tab ${tab === "products" ? "tab-active" : ""}`}
          onClick={() => setTab("products")}
        >
          Products & Stock
        </button>
        <button
          role="tab"
          className={`tab ${tab === "suppliers" ? "tab-active" : ""}`}
          onClick={() => setTab("suppliers")}
        >
          Suppliers
        </button>
      </div>
      {tab === "products" && <ProductsTab notify={notify} />}
      {tab === "suppliers" && <SuppliersTab notify={notify} />}
    </section>
  );
}

function ProductsTab({ notify }: { notify: (s: string) => void }) {
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
    <section>
      <header>
        <div>
          <h1>Products & stock</h1>
          <p>
            Retail price and price-level rules are kept with the product, just
            like mobile.
          </p>
        </div>
        <span>
          <button
            className="header-action"
            onClick={() => setModal("categories")}
          >
            Manage categories
          </button>{" "}
          <button className="header-action" onClick={() => openProduct()}>
            Add product
          </button>
        </span>
      </header>
      <input
        placeholder="Search name or barcode"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="chips">
        <button
          className={!categoryId ? "chip active" : "chip"}
          onClick={() => setCategoryId("")}
        >
          All
        </button>
        {categories.data?.map((category) => (
          <button
            key={category.id}
            className={categoryId === category.id ? "chip active" : "chip"}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
        <button
          className={lowOnly ? "chip active" : "chip"}
          onClick={() => setLowOnly(!lowOnly)}
        >
          Low stock
        </button>
      </div>
      <div className="card bg-white shadow-lg">
        <div className="card-body">
          <h3 className="text-xl font-bold mb-4">Catalog</h3>
          <div className="space-y-2">
            {shown?.length ? (
              shown.map((product) => (
                <div
                  key={product.id}
                  className="flex justify-between items-start p-3 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {product.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {product.quantity} {product.unit} ·{" "}
                      {categories.data?.find(
                        (category) => category.id === product.categoryId,
                      )?.name ?? "Uncategorized"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">
                      {money.format(product.price)}
                    </p>
                    <div className="flex gap-2 mt-1">
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
              <div className="text-center py-12">
                <p className="text-gray-400">
                  No products match these filters.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      {modal === "product" && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <form
            className="modal-card form"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveProduct.mutate();
            }}
          >
            <header>
              <h2>{form.id ? "Edit product" : "Add product"}</h2>
              <button
                className="icon"
                type="button"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </header>
            <label>
              Name
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              Barcode
              <input
                value={form.barcode}
                onChange={(event) =>
                  setForm({ ...form, barcode: event.target.value })
                }
              />
            </label>
            <label>
              Retail price
              <input
                required
                inputMode="decimal"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
              />
            </label>
            <label>
              Cost
              <input
                inputMode="decimal"
                value={form.cost}
                onChange={(event) =>
                  setForm({ ...form, cost: event.target.value })
                }
              />
            </label>
            {extraLevels.map((level) => (
              <div className="tier-editor" key={level.id}>
                <h3>{level.name} pricing</h3>
                <p>
                  {tierDrafts[level.id]?.length
                    ? "A price from 1 is the flat level price. Higher quantities are optional breaks."
                    : "Falls back to retail until you add a price."}
                </p>
                {(tierDrafts[level.id] ?? []).map((row) => (
                  <div className="tier-row" key={row.key}>
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
                    />
                    <span>→</span>
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
                    />
                    <button
                      type="button"
                      className="icon"
                      onClick={() => removeTier(level.id, row.key)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addTier(level.id)}>
                  {tierDrafts[level.id]?.length
                    ? "Add quantity break"
                    : `Set ${level.name} price`}
                </button>
              </div>
            ))}
            <label>
              Low-stock level
              <input
                inputMode="decimal"
                value={form.minStock}
                onChange={(event) =>
                  setForm({ ...form, minStock: event.target.value })
                }
              />
            </label>
            <label>
              Unit
              <input
                value={form.unit}
                onChange={(event) =>
                  setForm({ ...form, unit: event.target.value })
                }
              />
            </label>
            <label>
              Category
              <select
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
            </label>
            <label>
              Supplier
              <select
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
            </label>
            <button className="primary" disabled={saveProduct.isPending}>
              {saveProduct.isPending ? "Saving…" : "Save product"}
            </button>
          </form>
        </div>
      )}
      {modal === "categories" && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <div
            className="modal-card table"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Categories</h2>
              <button className="icon" onClick={() => setModal(null)}>
                ×
              </button>
            </header>
            <button
              className="secondary"
              onClick={() => {
                setCategoryFormId("");
                setCategoryName("");
                setModal("category");
              }}
            >
              Add category
            </button>
            {categories.data?.length ? (
              categories.data.map((category) => (
                <div className="row" key={category.id}>
                  <b>{category.name}</b>
                  <small>
                    <button
                      onClick={() => {
                        setCategoryFormId(category.id);
                        setCategoryName(category.name);
                        setModal("category");
                      }}
                    >
                      Edit
                    </button>{" "}
                    <button
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
                  </small>
                </div>
              ))
            ) : (
              <p className="empty">No categories yet.</p>
            )}
          </div>
        </div>
      )}
      {modal === "category" && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setModal("categories")}
        >
          <form
            className="modal-card form"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveCategory.mutate();
            }}
          >
            <header>
              <h2>{categoryFormId ? "Edit category" : "Add category"}</h2>
              <button
                className="icon"
                type="button"
                onClick={() => setModal("categories")}
              >
                ×
              </button>
            </header>
            <label>
              Category name
              <input
                required
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
            </label>
            <button className="primary" disabled={saveCategory.isPending}>
              {saveCategory.isPending ? "Saving…" : "Save category"}
            </button>
          </form>
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
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <div
            className="modal-card table"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>{selected.name} · stock history</h2>
              <button className="icon" onClick={() => setModal(null)}>
                ×
              </button>
            </header>
            {history.data?.length ? (
              history.data.map((movement) => (
                <div className="row" key={movement.id}>
                  <span>
                    <b>{movement.type.replace("_", " ")}</b>
                    <small>
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
                    </small>
                  </span>
                  <span>
                    <b className={movement.quantityDelta < 0 ? "negative" : ""}>
                      {movement.quantityDelta > 0 ? "+" : ""}
                      {movement.quantityDelta} {selected.unit}
                    </b>
                    <small>
                      {movement.unitCost != null
                        ? `Cost: ${money.format(movement.unitCost)} · `
                        : ""}
                      Balance: {movement.balance} {selected.unit}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p className="empty">No movements yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SuppliersTab({ notify }: { notify: (s: string) => void }) {
  const empty = { id: "", name: "", contactName: "", phone: "", address: "" };
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"all" | "month">("month");
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
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
      notify("Supplier saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const remove = useMutation({
    mutationFn: () => window.storePos.pos.removeSupplier(form.id),
    onSuccess: () => {
      setOpen(false);
      setForm(empty);
      void client.invalidateQueries({ queryKey: ["suppliers"] });
      notify("Supplier removed; past deliveries were kept.");
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
    setOpen(true);
  };
  const add = () => {
    setForm(empty);
    setOpen(true);
  };
  return (
    <section>
      <header>
        <div>
          <h1>Suppliers</h1>
          <p>
            Keep supplier contacts alongside the deliveries and purchase cost
            they supplied.
          </p>
        </div>
        <button className="header-action" onClick={add}>
          Add supplier
        </button>
      </header>
      <div className="toolbar">
        <input
          placeholder="Search name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as "all" | "month")}
        >
          <option value="month">This month</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div className="panel table">
        <h2>Supplier list</h2>
        {suppliers.data?.length ? (
          suppliers.data.map(({ supplier, spend }) => (
            <div className="row" key={supplier.id}>
              <span>
                <b>{supplier.name}</b>
                <small>
                  {supplier.contactName ||
                    supplier.phone ||
                    "No contact details"}
                  {supplier.address ? ` · ${supplier.address}` : ""}
                </small>
              </span>
              <span>
                <b>{money.format(spend)}</b>
                <small>
                  {period === "month"
                    ? "purchased this month"
                    : "purchased all time"}{" "}
                  · <button onClick={() => edit(supplier)}>View</button>
                </small>
              </span>
            </div>
          ))
        ) : (
          <p className="empty">
            {suppliers.isLoading ? "Loading suppliers…" : "No suppliers found."}
          </p>
        )}
      </div>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="modal-card table"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>{form.id ? "Supplier details" : "Add supplier"}</h2>
              <button className="icon" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <label>
                Supplier name
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label>
                Contact person
                <input
                  value={form.contactName}
                  onChange={(event) =>
                    setForm({ ...form, contactName: event.target.value })
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </label>
              <label>
                Address
                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                />
              </label>
              <button className="primary" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save supplier"}
              </button>
            </form>
            {form.id && (
              <>
                <div className="modal-section-header">
                  <h3>Purchases</h3>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${form.name}? Existing delivery history stays intact.`,
                        )
                      )
                        remove.mutate();
                    }}
                    disabled={remove.isPending}
                  >
                    Remove supplier
                  </button>
                </div>
                {purchases.data?.length ? (
                  purchases.data.map((purchase) => (
                    <div className="row" key={purchase.id}>
                      <span>
                        <b>{purchase.productName}</b>
                        <small>
                          {new Date(purchase.occurredAt).toLocaleString()}
                          {purchase.referenceNumber
                            ? ` · ${purchase.referenceNumber}`
                            : ""}
                        </small>
                      </span>
                      <span>
                        <b>
                          {purchase.quantity > 0 ? "+" : ""}
                          {purchase.quantity}
                        </b>
                        <small>
                          {purchase.unitCost == null
                            ? "Cost not recorded"
                            : `${money.format(purchase.unitCost)} each`}
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="empty">
                    No supplier-linked deliveries in this period.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StockModal({
  open,
  product,
  action,
  setAction,
  quantity,
  setQuantity,
  reason,
  setReason,
  supplierId = "",
  setSupplierId = () => {},
  referenceNumber = "",
  setReferenceNumber = () => {},
  unitCost = "",
  setUnitCost = () => {},
  suppliers = [],
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  product?: Product;
  action: "stock_in" | "waste" | "adjustment";
  setAction: (value: "stock_in" | "waste" | "adjustment") => void;
  quantity: string;
  setQuantity: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  supplierId?: string;
  setSupplierId?: (value: string) => void;
  referenceNumber?: string;
  setReferenceNumber?: (value: string) => void;
  unitCost?: string;
  setUnitCost?: (value: string) => void;
  suppliers?: Supplier[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open || !product) return null;
  const receiving = action === "stock_in";
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal-card form"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <header>
          <h2>Stock movement · {product.name}</h2>
          <button type="button" className="icon" onClick={onClose}>
            ×
          </button>
        </header>
        <p>
          Current stock:{" "}
          <b>
            {product.quantity} {product.unit}
          </b>
        </p>
        <label>
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as typeof action)}
          >
            <option value="stock_in">Receive stock</option>
            <option value="waste">Waste / damaged</option>
            <option value="adjustment">Manual adjustment</option>
          </select>
        </label>
        <label>
          {action === "adjustment" ? "Quantity change" : "Quantity"}
          <input
            required
            inputMode="decimal"
            placeholder={action === "adjustment" ? "+5 or -2" : "5"}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        {receiving ? (
          <>
            <label>
              Supplier
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">No supplier recorded</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit cost
              <input
                inputMode="decimal"
                placeholder="Optional; leave blank if unknown"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
              />
            </label>
            <label>
              Delivery reference
              <input
                placeholder="Invoice or delivery number"
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            Reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        )}
        <button className="primary" disabled={saving || !quantity}>
          {saving ? "Saving…" : "Save movement"}
        </button>
      </form>
    </div>
  );
}

function ProductModal({
  open,
  title,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  form: {
    name: string;
    barcode: string;
    price: string;
    cost: string;
    quantity: string;
    minStock: string;
    unit: string;
  };
  setForm: (value: {
    name: string;
    barcode: string;
    price: string;
    cost: string;
    quantity: string;
    minStock: string;
    unit: string;
  }) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal-card form"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon" onClick={onClose}>
            ×
          </button>
        </header>
        {(
          [
            "name",
            "barcode",
            "price",
            "cost",
            "quantity",
            "minStock",
            "unit",
          ] as const
        ).map((field) => (
          <label key={field}>
            {field === "minStock"
              ? "Low-stock level"
              : field === "quantity"
                ? "Opening quantity"
                : field}
            <input
              required={field === "name" || field === "price"}
              disabled={field === "quantity" && title === "Edit product"}
              value={form[field]}
              inputMode={
                ["price", "cost", "quantity", "minStock"].includes(field)
                  ? "decimal"
                  : undefined
              }
              onChange={(event) =>
                setForm({ ...form, [field]: event.target.value })
              }
            />
          </label>
        ))}
        <button className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save product"}
        </button>
      </form>
    </div>
  );
}

function CatalogSetup({ notify }: { notify: (s: string) => void }) {
  const [modal, setModal] = useState<"category" | "supplier" | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [supplier, setSupplier] = useState({
    name: "",
    contactName: "",
    phone: "",
  });
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => window.storePos.pos.categories(),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => window.storePos.pos.suppliers(),
  });
  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => window.storePos.pos.products(),
  });
  const saveCategory = useMutation({
    mutationFn: () => window.storePos.pos.saveCategory({ name: categoryName }),
    onSuccess: () => {
      setCategoryName("");
      setModal(null);
      void client.invalidateQueries({ queryKey: ["categories"] });
      notify("Category saved");
    },
    onError: (e: Error) => notify(e.message),
  });
  const saveSupplier = useMutation({
    mutationFn: () => window.storePos.pos.saveSupplier(supplier),
    onSuccess: () => {
      setSupplier({ name: "", contactName: "", phone: "" });
      setModal(null);
      void client.invalidateQueries({ queryKey: ["suppliers"] });
      notify("Supplier saved");
    },
    onError: (e: Error) => notify(e.message),
  });
  return (
    <section>
      <header>
        <div>
          <h1>Catalog setup</h1>
          <p>
            Maintain the supporting data behind your product catalog without
            keeping edit forms on screen.
          </p>
        </div>
        <span>
          <button
            className="header-action"
            onClick={() => setModal("category")}
          >
            Add category
          </button>{" "}
          <button
            className="header-action"
            onClick={() => setModal("supplier")}
          >
            Add supplier
          </button>
        </span>
      </header>
      <div className="workspace three">
        <div className="panel table">
          <h2>Categories</h2>
          {categories.data?.length ? (
            categories.data.map((item) => (
              <div className="row" key={item.id}>
                <b>{item.name}</b>
              </div>
            ))
          ) : (
            <p className="empty">No categories yet.</p>
          )}
        </div>
        <div className="panel table">
          <h2>Suppliers</h2>
          {suppliers.data?.length ? (
            suppliers.data.map((item) => (
              <div className="row" key={item.id}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.contactName ?? item.phone ?? "No contact details"}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <p className="empty">No suppliers yet.</p>
          )}
        </div>
        <div className="panel table">
          <h2>Products</h2>
          {products.data?.map((item) => (
            <div className="row" key={item.id}>
              <span>
                <b>{item.name}</b>
                <small>
                  {item.categoryId ? "Categorized" : "No category"} ·{" "}
                  {item.supplierId ? "Supplier linked" : "No supplier"}
                </small>
              </span>
            </div>
          ))}
        </div>
      </div>
      {modal === "category" && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <form
            className="modal-card form"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveCategory.mutate();
            }}
          >
            <header>
              <h2>Add category</h2>
              <button
                className="icon"
                type="button"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </header>
            <label>
              Name
              <input
                required
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
            </label>
            <button className="primary" disabled={saveCategory.isPending}>
              Save category
            </button>
          </form>
        </div>
      )}
      {modal === "supplier" && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <form
            className="modal-card form"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveSupplier.mutate();
            }}
          >
            <header>
              <h2>Add supplier</h2>
              <button
                className="icon"
                type="button"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </header>
            <label>
              Name
              <input
                required
                value={supplier.name}
                onChange={(event) =>
                  setSupplier({ ...supplier, name: event.target.value })
                }
              />
            </label>
            <label>
              Contact
              <input
                value={supplier.contactName}
                onChange={(event) =>
                  setSupplier({ ...supplier, contactName: event.target.value })
                }
              />
            </label>
            <label>
              Phone
              <input
                value={supplier.phone}
                onChange={(event) =>
                  setSupplier({ ...supplier, phone: event.target.value })
                }
              />
            </label>
            <button className="primary" disabled={saveSupplier.isPending}>
              Save supplier
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
