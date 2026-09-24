import { useCapabilities } from '../../useCapabilities';
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Product, StockMovement, Supplier } from "../../../shared/models";
import { StockModal } from "./StockModal";
import type { TierDraft } from "./types";
import { formatCurrency } from '../../../shared/currency';
import { myanmarMessage } from '../../myanmar';

const money = { format: formatCurrency };

const POPULAR_UNITS = ["pcs", "pack", "box", "bottle", "can", "kg", "liter", "set"];

export function ProductsTab({
  notify,
  onOpenCategories,
}: {
  notify: (s: string) => void;
  onOpenCategories?: () => void;
}) {
  const { owner, effectivePlan } = useCapabilities();
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
  const [modal, setModal] = useState<"product" | "stock" | "history" | null>(null);
  const [productModalTab, setProductModalTab] = useState<"general" | "pricing" | "stock">("general");
  const [hasPastMovements, setHasPastMovements] = useState(false);

  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [sortBy, setSortBy] = useState<"name-asc" | "stock-asc" | "price-desc" | "price-asc">("name-asc");
  const [offset, setOffset] = useState(0);

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
    queryKey: ["product-page", search, categoryId, stockFilter, sortBy, offset],
    queryFn: () => window.storePos.pos.productPage({ search, categoryId: categoryId || undefined, stockFilter, sortBy, offset, limit: 100 }),
  });
  const productSummary = useQuery({ queryKey: ['product-summary'], queryFn: () => window.storePos.pos.productSummary() });

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
    enabled: Boolean(selectedProductId) && modal === "history",
  });

  const selectedProduct = products.data?.items.find(
    (product) => product.id === selectedProductId,
  );

  const extraLevels =
    effectivePlan !== "free"
      ? levels.data?.filter((level) => !level.isDefault) ?? []
      : [];

  useEffect(() => {
    if (modal !== "product") return;
    if (!form.id) {
      setTierDrafts({});
      return;
    }
    if (!existingTiers.data) return;
    const grouped: Record<string, TierDraft[]> = {};
    for (const tier of existingTiers.data)
      (grouped[tier.priceLevelId ?? "level-retail"] ??= []).push({
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
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        price: Number(form.price),
        cost: Number(form.cost || 0),
        minStock: Number(form.minStock || 0),
        unit: form.unit.trim() || "pcs",
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
    onSuccess: (product) => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ["product-page"] });
      void client.invalidateQueries({ queryKey: ["product-summary"] });
      void client.invalidateQueries({ queryKey: ["cart-products"] });
      void client.invalidateQueries({ queryKey: ["product-tiers", product.id] });
      notify("ကုန်ပစ္စည်း သိမ်းပြီးပါပြီ");
    },
    onError: (error: Error) => notify(error.message),
  });

  const removeProduct = useMutation({
    mutationFn: (id: string) => window.storePos.pos.removeProduct(id),
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ["product-page"] });
      void client.invalidateQueries({ queryKey: ["product-summary"] });
      void client.invalidateQueries({ queryKey: ["cart-products"] });
      notify("ကုန်ပစ္စည်း ဖျက်ပြီးပါပြီ");
    },
    onError: (e: Error) => notify(e.message),
  });

  const saveStock = useMutation({
    mutationFn: async () => {
      if (!selectedProductId) return;
      const quantity = Number(stock.quantity);
      if (stock.action === "adjustment") {
        await window.storePos.pos.setStockTo(
          selectedProductId,
          quantity,
          stock.reason || undefined,
        );
      } else {
        const delta = stock.action === "stock_in" ? quantity : -quantity;
        await window.storePos.pos.adjustStock(
          selectedProductId,
          delta,
          stock.action,
          stock.reason || undefined,
          {
            supplierId: stock.supplierId || null,
            referenceNumber: stock.referenceNumber || null,
            unitCost: stock.unitCost ? Number(stock.unitCost) : null,
          },
        );
      }
    },
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ["product-page"] });
      void client.invalidateQueries({ queryKey: ["product-summary"] });
      void client.invalidateQueries({ queryKey: ["cart-products"] });
      void client.invalidateQueries({
        queryKey: ["stock-history", selectedProductId],
      });
      notify("ကုန်လက်ကျန် ပြင်ပြီးပါပြီ");
    },
    onError: (error: Error) => notify(error.message),
  });

  // Summary Metrics
  const totalProducts = productSummary.data?.total ?? 0;
  const lowStockCount = productSummary.data?.lowStock ?? 0;
  const outOfStockCount = productSummary.data?.outOfStock ?? 0;
  const totalInventoryValue = productSummary.data?.inventoryValue ?? 0;
  const shown = products.data?.items ?? [];

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
    if (product?.id) {
      window.storePos.pos
        .stockHistory(product.id)
        .then((history) => {
          const hasPast = history.some(
            (m) =>
              m.reason !== "Initial stock" &&
              m.reason !== "Initial desktop inventory",
          );
          setHasPastMovements(hasPast);
        })
        .catch(() => setHasPastMovements(false));
    } else {
      setHasPastMovements(false);
    }
    setProductModalTab("general");
    setModal("product");
  };

  const openFor = (product: Product, next: "stock" | "history") => {
    setSelectedProductId(product.id);
    if (next === "stock")
      setStock({
        action: "stock_in",
        quantity: "",
        reason: "",
        supplierId: suppliers.data?.some((s) => s.id === product.supplierId)
          ? product.supplierId ?? ""
          : "",
        referenceNumber: "",
        unitCost: String(product.cost || ""),
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
          id: "",
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

  // Live profit and margin for form
  const formPrice = Number(form.price) || 0;
  const formCost = Number(form.cost) || 0;
  const formProfit = formPrice - formCost;
  const formMargin = formPrice > 0 ? (formProfit / formPrice) * 100 : 0;

  return (
    <section className="flex-1 overflow-hidden flex flex-col gap-3">
      {/* Overview Metric Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              ကုန်ပစ္စည်းစုစုပေါင်း
            </p>
            <p className="text-xl font-black text-gray-900 mt-0.5">
              {totalProducts}
            </p>
          </div>
          <span className="text-2xl">📦</span>
        </div>

        <div
          onClick={() => { setStockFilter(stockFilter === "low" ? "all" : "low"); setOffset(0); }}
          className={`p-3.5 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            stockFilter === "low"
              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/30"
              : "bg-white border-gray-200/80 hover:bg-amber-50/50"
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
              လက်ကျန်နည်း
            </p>
            <p className="text-xl font-black text-amber-700 mt-0.5">
              {lowStockCount}
            </p>
          </div>
          <span className="text-2xl">⚠️</span>
        </div>

        <div
          onClick={() => { setStockFilter(stockFilter === "out" ? "all" : "out"); setOffset(0); }}
          className={`p-3.5 rounded-xl border shadow-sm flex items-center justify-between cursor-pointer transition ${
            stockFilter === "out"
              ? "bg-rose-50 border-rose-300 ring-2 ring-rose-400/30"
              : "bg-white border-gray-200/80 hover:bg-rose-50/50"
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">
              ကုန်သွားပြီ
            </p>
            <p className="text-xl font-black text-rose-700 mt-0.5">
              {outOfStockCount}
            </p>
          </div>
          <span className="text-2xl">🚫</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              လက်ကျန်ရောင်းတန်ဖိုး
            </p>
            <p className="text-xl font-black text-emerald-700 mt-0.5">
              {money.format(totalInventoryValue)}
            </p>
          </div>
          <span className="text-2xl">💰</span>
        </div>
      </div>

      {/* Control Bar: Search, Category Pills, View Switcher & Actions */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              🔍
            </span>
            <input
              placeholder="ကုန်ပစ္စည်းအမည် သို့မဟုတ် ဘားကုဒ်ဖြင့်ရှာပါ…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              className="input input-bordered input-sm w-full pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setOffset(0); }}
              className="select select-bordered select-sm text-xs font-medium bg-gray-50"
            >
              <option value="name-asc">အမည် (က → အ)</option>
              <option value="stock-asc">လက်ကျန် (နည်း → များ)</option>
              <option value="price-desc">စျေးနှုန်း (များ → နည်း)</option>
              <option value="price-asc">စျေးနှုန်း (နည်း → များ)</option>
            </select>

            {/* View Mode Toggle */}
            <div className="join border border-gray-200 rounded-lg p-0.5 bg-gray-50">
              <button
                onClick={() => setViewMode("table")}
                className={`btn btn-xs join-item ${
                  viewMode === "table" ? "btn-primary" : "btn-ghost text-gray-600"
                }`}
                title="ဇယားပုံစံဖြင့်ကြည့်မည်"
              >
                ☰ ဇယား
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`btn btn-xs join-item ${
                  viewMode === "cards" ? "btn-primary" : "btn-ghost text-gray-600"
                }`}
                title="ကတ်ပုံစံဖြင့်ကြည့်မည်"
              >
                ☵ ကတ်
              </button>
            </div>

            {/* Add Product Button */}
            <button
              className="btn btn-primary btn-sm shadow-sm"
              onClick={() => openProduct()}
            >
              + ကုန်ပစ္စည်းအသစ်
            </button>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-gray-100 pt-2">
          <button
            className={`btn btn-xs px-3 rounded-full font-medium transition ${
              !categoryId && stockFilter === "all"
                ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
            onClick={() => {
              setCategoryId("");
              setStockFilter("all");
              setOffset(0);
            }}
          >
            ကုန်ပစ္စည်းအားလုံး ({totalProducts})
          </button>

          {categories.data?.map((cat) => (
            <button
              key={cat.id}
              className={`btn btn-xs px-3 rounded-full font-medium whitespace-nowrap transition ${
                categoryId === cat.id
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
              onClick={() => {
                setCategoryId(cat.id);
                setStockFilter("all");
                setOffset(0);
              }}
            >
              {cat.name}
            </button>
          ))}

          {onOpenCategories && owner && (
            <button
              onClick={onOpenCategories}
              className="btn btn-xs btn-ghost text-emerald-700 font-semibold hover:bg-emerald-50 ml-auto whitespace-nowrap"
            >
              ⚙️ အမျိုးအစား စီမံမည်
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area: Table View or Cards View */}
      <div className="card bg-white shadow-sm border border-gray-200/80 flex-1 overflow-hidden">
        <div className="card-body p-0 flex flex-col overflow-hidden">
          {products.isLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400">
              <span className="loading loading-spinner loading-lg text-emerald-600 mb-2"></span>
              <p className="text-sm text-gray-500 font-medium">ကုန်ပစ္စည်းများ ဖတ်နေသည်…</p>
            </div>
          ) : products.isError ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400">
              <span className="text-4xl mb-2">⚠️</span>
              <p className="text-base font-bold text-gray-700">ကုန်ပစ္စည်းများ မဖတ်နိုင်ပါ</p>
              <p className="text-xs text-red-500 mt-1">
                {products.error ? myanmarMessage((products.error as Error).message) : "ပြဿနာတစ်ခု ဖြစ်ပွားခဲ့သည်"}
              </p>
              <button
                className="btn btn-xs btn-outline btn-primary mt-3"
                onClick={() => products.refetch()}
              >
                ထပ်စမ်းမည်
              </button>
            </div>
          ) : shown.length > 0 ? (
            viewMode === "table" ? (
              /* High-Density Spreadsheet Table View */
              <div className="flex-1 overflow-y-auto">
                <table className="table table-sm w-full">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4 font-semibold">ကုန်ပစ္စည်းအမည်</th>
                      <th className="py-3 px-3 font-semibold">ဘားကုဒ်</th>
                      <th className="py-3 px-3 font-semibold">အမျိုးအစား</th>
                      <th className="py-3 px-3 font-semibold text-center">လက်ကျန်</th>
                      <th className="py-3 px-3 font-semibold text-right">လက်လီစျေး</th>
                      {owner && (
                        <th className="py-3 px-3 font-semibold text-right">ဝယ်ရင်းစျေး</th>
                      )}
                      {owner && (
                        <th className="py-3 px-3 font-semibold text-right">အမြတ်ရာခိုင်နှုန်း</th>
                      )}
                      <th className="py-3 px-4 font-semibold text-right">လုပ်ဆောင်ချက်</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {shown.map((product) => {
                      const isOutOfStock = product.quantity <= 0;
                      const isLowStock =
                        product.minStock > 0 &&
                        product.quantity <= product.minStock &&
                        !isOutOfStock;
                      const cat = categories.data?.find(
                        (c) => c.id === product.categoryId,
                      );
                      const profit = product.price - product.cost;
                      const margin =
                        product.price > 0 ? (profit / product.price) * 100 : 0;

                      return (
                        <tr
                          key={product.id}
                          className="hover:bg-gray-50/80 transition group"
                        >
                          <td className="py-2.5 px-4">
                            <span className="font-bold text-sm text-gray-900 block leading-tight">
                              {product.name}
                            </span>
                            {product.unit && (
                              <span className="text-[10px] text-gray-400">
                                ယူနစ် — {product.unit}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">
                            {product.barcode || "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="badge badge-ghost badge-sm text-[10px]">
                              {cat?.name ?? "အမျိုးအစားမသတ်မှတ်ရသေး"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isOutOfStock ? (
                              <span className="badge badge-error badge-sm text-white font-semibold">
                                ကုန်ပြီ ({product.quantity} {product.unit})
                              </span>
                            ) : isLowStock ? (
                              <span className="badge badge-warning badge-sm font-semibold">
                                လက်ကျန်နည်း ({product.quantity} {product.unit})
                              </span>
                            ) : (
                              <span className="badge badge-ghost badge-sm font-semibold bg-emerald-50 text-emerald-800 border-emerald-200">
                                {product.quantity} {product.unit}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-sm text-emerald-700">
                            {money.format(product.price)}
                          </td>
                          {owner && (
                            <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                              {product.cost > 0 ? money.format(product.cost) : "—"}
                            </td>
                          )}
                          {owner && (
                            <td className="py-2.5 px-3 text-right">
                              {product.cost > 0 ? (
                                <span
                                  className={`font-semibold ${
                                    profit > 0
                                      ? "text-emerald-600"
                                      : profit < 0
                                        ? "text-rose-600"
                                        : "text-gray-500"
                                  }`}
                                >
                                  {margin.toFixed(0)}%
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex justify-end items-center gap-1">
                              <button
                                className="btn btn-xs btn-outline border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                                onClick={() => openFor(product, "stock")}
                              >
                                လက်ကျန်
                              </button>
                              <button
                                className="btn btn-xs btn-ghost text-gray-700"
                                onClick={() => openFor(product, "history")}
                              >
                                မှတ်တမ်း
                              </button>
                              <button
                                className="btn btn-xs btn-ghost text-gray-700"
                                onClick={() => openProduct(product)}
                              >
                                ပြင်မည်
                              </button>
                              {owner && (
                                <button
                                  className="btn btn-xs btn-ghost text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `ကုန်ပစ္စည်း “${product.name}” ကို ဖျက်မည်လား။ ယခင်အရောင်းမှတ်တမ်းများ မပျက်ပါ။`,
                                      )
                                    ) {
                                      removeProduct.mutate(product.id);
                                    }
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Visual Card Grid View */
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {shown.map((product) => {
                    const isOutOfStock = product.quantity <= 0;
                    const isLowStock =
                      product.minStock > 0 &&
                      product.quantity <= product.minStock &&
                      !isOutOfStock;
                    const cat = categories.data?.find(
                      (c) => c.id === product.categoryId,
                    );

                    return (
                      <div
                        key={product.id}
                        className="p-3.5 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span className="badge badge-ghost badge-xs text-[10px]">
                              {cat?.name ?? "အမျိုးအစားမသတ်မှတ်ရသေး"}
                            </span>
                            {isOutOfStock ? (
                              <span className="badge badge-error badge-xs text-white">
                                ကုန်ပြီ
                              </span>
                            ) : isLowStock ? (
                              <span className="badge badge-warning badge-xs">
                                နည်း
                              </span>
                            ) : null}
                          </div>

                          <h3 className="font-bold text-sm text-gray-900 leading-snug">
                            {product.name}
                          </h3>
                          {product.barcode && (
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                              {product.barcode}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-gray-100">
                          <div className="flex justify-between items-baseline mb-2">
                            <span className="text-base font-black text-emerald-700">
                              {money.format(product.price)}
                            </span>
                            <span className="text-xs font-semibold text-gray-600">
                              {product.quantity} {product.unit}
                            </span>
                          </div>

                          <div className="flex gap-1">
                            <button
                              className="btn btn-xs btn-outline flex-1 border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                              onClick={() => openFor(product, "stock")}
                            >
                              လက်ကျန်
                            </button>
                            <button
                              className="btn btn-xs btn-ghost text-gray-600"
                              onClick={() => openFor(product, "history")}
                            >
                              မှတ်တမ်း
                            </button>
                            <button
                              className="btn btn-xs btn-ghost text-gray-700"
                              onClick={() => openProduct(product)}
                            >
                              ပြင်မည်
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400">
              <span className="text-4xl mb-2">🔍</span>
              <p className="text-base font-bold text-gray-700">
                သတ်မှတ်ချက်နှင့်ကိုက်ညီသော ကုန်ပစ္စည်းမရှိပါ
              </p>
              <p className="text-xs text-gray-500 mt-1">
                အခြားစာလုံးဖြင့်ရှာပါ သို့မဟုတ် စစ်ထုတ်မှုကို ပြန်ရှင်းပါ။
              </p>
            </div>
          )}
          {shown.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
              <span>ပြထားသည် {offset + 1}-{offset + shown.length} / {products.data?.total ?? 0}</span>
              <div className="flex gap-2"><button className="btn btn-xs" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>← ယခင်</button><button className="btn btn-xs" disabled={offset + shown.length >= (products.data?.total ?? 0)} onClick={() => setOffset(offset + 100)}>နောက်သို့ →</button></div>
            </div>
          )}
        </div>
      </div>

      {/* Redesigned Structured Product Create/Edit Modal */}
      {modal === "product" && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl max-h-[90vh] flex flex-col p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-xl text-gray-900">
                  {form.id ? "ကုန်ပစ္စည်းပြင်မည်" : "ကုန်ပစ္စည်းအသစ် ထည့်မည်"}
                </h3>
                <p className="text-xs text-gray-500">
                  {form.id
                    ? `Updating ${form.name}`
                    : "ဆိုင်ကုန်ပစ္စည်းစာရင်းထဲသို့ ပစ္စည်းအသစ်ထည့်ပါ"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            {/* Modal Internal Tabs */}
            <div className="tabs tabs-boxed bg-gray-100 p-1 my-3 w-fit">
              <button
                type="button"
                className={`tab tab-sm font-medium ${
                  productModalTab === "general"
                    ? "tab-active bg-white font-bold shadow-sm"
                    : ""
                }`}
                onClick={() => setProductModalTab("general")}
              >
                ၁။ အခြေခံအချက်အလက်
              </button>
              <button
                type="button"
                className={`tab tab-sm font-medium ${
                  productModalTab === "pricing"
                    ? "tab-active bg-white font-bold shadow-sm"
                    : ""
                }`}
                onClick={() => setProductModalTab("pricing")}
              >
                ၂။ စျေးနှုန်းနှင့် အမြတ်
              </button>
              <button
                type="button"
                className={`tab tab-sm font-medium ${
                  productModalTab === "stock"
                    ? "tab-active bg-white font-bold shadow-sm"
                    : ""
                }`}
                onClick={() => setProductModalTab("stock")}
              >
                ၃။ လက်ကျန်သတိပေးချက်
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveProduct.mutate();
              }}
              className="flex-1 overflow-y-auto space-y-4 pr-1"
            >
              {/* Tab 1: General Info */}
              {productModalTab === "general" && (
                <div className="space-y-3">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-semibold">
                        ကုန်ပစ္စည်းအမည် *
                      </span>
                    </label>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="ဥပမာ ကိုကာကိုလာ 330ml၊ လက်ဖက်ရည်"
                      className="input input-bordered input-sm w-full"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-semibold">
                          ဘားကုဒ် / SKU
                        </span>
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          value={form.barcode}
                          onChange={(e) =>
                            setForm({ ...form, barcode: e.target.value })
                          }
                          placeholder="ဘားကုဒ်ဖတ်ပါ သို့မဟုတ် ရိုက်ထည့်ပါ…"
                          className="input input-bordered input-sm flex-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            const code = String(
                              Math.floor(100000000000 + Math.random() * 900000000000),
                            );
                            setForm({ ...form, barcode: code });
                          }}
                        >
                          အလိုအလျောက်
                        </button>
                      </div>
                    </div>

                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-semibold">
                          အမျိုးအစား
                        </span>
                      </label>
                      <select
                        className="select select-bordered select-sm w-full"
                        value={form.categoryId}
                        onChange={(e) =>
                          setForm({ ...form, categoryId: e.target.value })
                        }
                      >
                        <option value="">အမျိုးအစားမသတ်မှတ်ရသေး</option>
                        {categories.data?.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-semibold">
                          ရေတွက်ယူနစ်
                        </span>
                      </label>
                      <input
                        value={form.unit}
                        onChange={(e) => setForm({ ...form, unit: e.target.value })}
                        placeholder="ဥပမာ ခု၊ ဘူး၊ ထုပ်"
                        className="input input-bordered input-sm w-full"
                      />
                      {/* Popular unit tags */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {POPULAR_UNITS.map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setForm({ ...form, unit: u })}
                            className={`btn btn-xs px-2 py-0 text-[10px] ${
                              form.unit === u ? "btn-primary" : "btn-ghost bg-gray-100"
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </div>

                    {owner && (
                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-xs font-semibold">
                            အဓိကပေးသွင်းသူ
                          </span>
                        </label>
                        <select
                          className="select select-bordered select-sm w-full"
                          value={form.supplierId}
                          onChange={(e) =>
                            setForm({ ...form, supplierId: e.target.value })
                          }
                        >
                          <option value="">ပေးသွင်းသူမရှိ</option>
                          {suppliers.data?.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Pricing & Margin */}
              {productModalTab === "pricing" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="form-control">
                      <label className="label py-1">
                        <span className="label-text text-xs font-semibold">
                          လက်လီရောင်းစျေး *
                        </span>
                      </label>
                      <input
                        required
                        inputMode="decimal"
                        value={form.price}
                        onChange={(e) =>
                          setForm({ ...form, price: e.target.value })
                        }
                        placeholder="0.00"
                        className="input input-bordered input-sm text-sm font-bold text-emerald-700"
                        autoFocus
                      />
                    </div>

                    {owner && (
                      <div className="form-control">
                        <label className="label py-1">
                          <span className="label-text text-xs font-semibold">
                            ဝယ်ရင်းစျေး
                          </span>
                        </label>
                        <input
                          inputMode="decimal"
                          value={form.cost}
                          disabled={Boolean(form.id && hasPastMovements)}
                          onChange={(e) =>
                            setForm({ ...form, cost: e.target.value })
                          }
                          placeholder="0.00"
                          className="input input-bordered input-sm text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {form.id && hasPastMovements ? (
                          <span className="text-[11px] text-gray-500 mt-1">
                            အရောင်း/ကုန်ဝင် မှတ်တမ်းများ ရှိနေသဖြင့် ပျမ်းမျှဝယ်ဈေးကို အလိုအလျောက် တွက်ချက်သည်
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Live Profit & Margin Indicator Box */}
                  {owner && formPrice > 0 && formCost > 0 && (
                    <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs flex items-center justify-between">
                      <div>
                        <span className="text-gray-600">တစ်ယူနစ်ခန့်မှန်းအမြတ် —</span>{" "}
                        <strong className="text-emerald-800 text-sm">
                          {money.format(formProfit)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-600">အမြတ်ရာခိုင်နှုန်း —</span>{" "}
                        <span
                          className={`badge ${
                            formMargin > 20
                              ? "badge-success text-white font-bold"
                              : formMargin > 0
                                ? "badge-warning font-bold"
                                : "badge-error text-white font-bold"
                          }`}
                        >
                          {formMargin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Multi-Level Price Tiers */}
                  {extraLevels.map((level) => (
                    <div
                      key={level.id}
                      className="border border-gray-200 rounded-xl p-3 bg-gray-50/50"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="font-bold text-xs text-gray-800">
                          {level.name} စျေးနှုန်း
                        </h4>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => addTier(level.id)}
                        >
                          + အရေအတွက်လိုက်စျေး ထည့်မည်
                        </button>
                      </div>

                      {(tierDrafts[level.id] ?? []).map((row) => (
                        <div key={row.key} className="flex gap-2 items-center mb-1.5">
                          <input
                            required
                            inputMode="decimal"
                            placeholder="အနည်းဆုံးအရေအတွက် (ဥပမာ ၅)"
                            value={row.minQuantity}
                            onChange={(e) =>
                              editTier(level.id, row.key, {
                                minQuantity: e.target.value,
                              })
                            }
                            className="input input-bordered input-xs flex-1"
                          />
                          <span className="text-gray-400">→</span>
                          <input
                            required
                            inputMode="decimal"
                            placeholder="သတ်မှတ်စျေး"
                            value={row.bulkPrice}
                            onChange={(e) =>
                              editTier(level.id, row.key, {
                                bulkPrice: e.target.value,
                              })
                            }
                            className="input input-bordered input-xs flex-1 font-semibold"
                          />
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost text-rose-500"
                            onClick={() => removeTier(level.id, row.key)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Stock Alerts */}
              {productModalTab === "stock" && (
                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-semibold">
                        လက်ကျန်နည်း သတိပေးမည့်အရေအတွက်
                      </span>
                    </label>
                    <input
                      inputMode="decimal"
                      value={form.minStock}
                      onChange={(e) =>
                        setForm({ ...form, minStock: e.target.value })
                      }
                      placeholder="ဥပမာ ၅"
                      className="input input-bordered input-sm w-full"
                    />
                    <label className="label py-1">
                      <span className="label-text-alt text-gray-500 text-[11px]">
                        လက်ကျန်သည် ဤအရေအတွက်နှင့်တူ သို့မဟုတ် နည်းသွားလျှင် “လက်ကျန်နည်း” ဟု သတိပေးပါမည်။
                      </span>
                    </label>
                  </div>

                  <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs leading-relaxed">
                    <p className="font-semibold mb-1">💡 ကုန်လက်ကျန် စီမံခြင်း</p>
                    <p className="text-blue-800">
                      ကုန်လက်ကျန်မှတ်တမ်း မှန်ကန်စေရန် ဇယားပေါ်ရှိ <strong>“လက်ကျန်”</strong> ခလုတ်ဖြင့်သာ ပြင်ပါ ( <em>ကုန်ဝင်လက်ခံခြင်း</em>, <em>မြေပြင်လက်ကျန်ရေတွက်ခြင်း</em>နှင့် <em>ပျက်စီးဆုံးရှုံးမှုမှတ်တမ်း</em>).
                    </p>
                  </div>
                </div>
              )}

              <div className="modal-action pt-4 border-t border-gray-100 flex justify-between">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setModal(null)}
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary px-5"
                  disabled={saveProduct.isPending || !form.name.trim() || !form.price}
                >
                  {saveProduct.isPending ? "သိမ်းနေသည်…" : "ကုန်ပစ္စည်းသိမ်းမည်"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement Dialog */}
      {modal === "stock" && selectedProduct && (
        <StockModal
          open={true}
          product={selectedProduct}
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
          showCost={owner}
          saving={saveStock.isPending}
          onClose={() => setModal(null)}
          onSave={() => saveStock.mutate()}
        />
      )}

      {/* Stock History Audit Log Dialog */}
      {modal === "history" && selectedProduct && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl max-h-[85vh] flex flex-col p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  လက်ကျန်မှတ်တမ်း — {selectedProduct.name}
                </h3>
                <p className="text-xs text-gray-500">
                  လက်ရှိလက်ကျန် —{" "}
                  <strong className="text-emerald-700">
                    {selectedProduct.quantity} {selectedProduct.unit}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-3">
              {history.data?.length ? (
                <table className="table table-xs w-full">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th>ရက်စွဲ</th>
                      <th>အမျိုးအစား</th>
                      <th className="text-right">ပြန်အမ်းငွေ</th>
                      <th className="text-right">လက်ကျန်</th>
                      <th>မှတ်ချက် / ရည်ညွှန်းအမှတ်</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((h: StockMovement) => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="text-gray-500 whitespace-nowrap">
                          {new Date(h.occurredAt).toLocaleString()}
                        </td>
                        <td>
                          <span
                            className={`badge badge-xs text-[10px] ${
                              h.type === "stock_in"
                                ? "badge-success text-white"
                                : h.type === "sale_out"
                                  ? "badge-info text-white"
                                  : h.type === "waste"
                                    ? "badge-error text-white"
                                    : "badge-ghost"
                            }`}
                          >
                            {h.type}
                          </span>
                        </td>
                        <td
                          className={`text-right font-bold font-mono ${
                            h.quantityDelta > 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {h.quantityDelta > 0
                            ? `+${h.quantityDelta}`
                            : h.quantityDelta}
                        </td>
                        <td className="text-right font-mono font-semibold">
                          {h.balance}
                        </td>
                        <td className="text-gray-500 text-xs truncate max-w-[150px]">
                          {h.reason || h.referenceNumber || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-center py-12 text-gray-400">
                  ဤကုန်ပစ္စည်းအတွက် လက်ကျန်အပြောင်းအလဲ မရှိသေးပါ။
                </p>
              )}
            </div>

            <div className="modal-action pt-3 border-t border-gray-100">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setModal(null)}
              >
                ပိတ်မည်
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
