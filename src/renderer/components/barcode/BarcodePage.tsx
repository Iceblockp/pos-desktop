import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Product, PrinterInfo } from "../../../shared/models";
import {
  generateBarcodeSvg,
  generateInternalBarcode,
  type BarcodeLabelFormat,
  type BarcodeLabelConfig,
  type BarcodePrintItem,
} from "../../../shared/barcode";
import { formatCurrency, parseCurrency } from "../../../shared/currency";

const FORMAT_OPTIONS: { id: BarcodeLabelFormat; label: string; desc: string; type: "thermal" | "receipt" | "a4" }[] = [
  { id: "thermal-40x30", label: "Thermal 40 × 30 mm", desc: "စံသတ်မှတ် စတစ်ကာလိပ် (အသုံးအများဆုံး)", type: "thermal" },
  { id: "thermal-50x30", label: "Thermal 50 × 30 mm", desc: "စတစ်ကာလိပ် အလတ်", type: "thermal" },
  { id: "thermal-30x20", label: "Thermal 30 × 20 mm", desc: "စတစ်ကာလိပ် အသေး", type: "thermal" },
  { id: "receipt-58", label: "Receipt Roll 58 mm", desc: "၅၈ မမ သာမန်ဘေလ်စက္ကူလိပ်", type: "receipt" },
  { id: "receipt-80", label: "Receipt Roll 80 mm", desc: "၈၀ မမ သာမန်ဘေလ်စက္ကူလိပ်", type: "receipt" },
  { id: "a4-24", label: "A4 Sticker (24 labels)", desc: "A4 စတစ်ကာ စာရွက် (3 x 8 = ၂၄ ကွက်)", type: "a4" },
  { id: "a4-30", label: "A4 Sticker (30 labels)", desc: "A4 စတစ်ကာ စာရွက် (3 x 10 = ၃၀ ကွက်)", type: "a4" },
  { id: "a4-40", label: "A4 Sticker (40 labels)", desc: "A4 စတစ်ကာ စာရွက် (4 x 10 = ၄၀ ကွက်)", type: "a4" },
];

export function BarcodePage({ notify }: { notify: (msg: string, type?: "success" | "error" | "info") => void }) {
  const queryClient = useQueryClient();

  // Queries
  const productsQuery = useQuery({
    queryKey: ["products-all"],
    queryFn: () => window.storePos.pos.products(""),
  });

  const printersQuery = useQuery({
    queryKey: ["printers-list"],
    queryFn: () => window.storePos.printer.list(),
  });

  const barcodeSettingsQuery = useQuery({
    queryKey: ["barcode-settings"],
    queryFn: () => window.storePos.printer.barcodeSettings(),
  });

  const shopProfileQuery = useQuery({
    queryKey: ["shop-profile"],
    queryFn: () => window.storePos.pos.shopProfile(),
  });

  // Local settings state
  const [config, setConfig] = useState<BarcodeLabelConfig>({
    format: "thermal-40x30",
    includeShopName: true,
    includeProductName: true,
    includePrice: true,
    printerName: "",
  });

  useEffect(() => {
    if (barcodeSettingsQuery.data) {
      setConfig(barcodeSettingsQuery.data);
    }
  }, [barcodeSettingsQuery.data]);

  // Selected products and print quantities: { [productId]: quantity }
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [previewProductId, setPreviewProductId] = useState<string | null>(null);

  // Filters
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "selected">("all");
  const [search, setSearch] = useState("");

  const products = productsQuery.data ?? [];
  const currency = parseCurrency(shopProfileQuery.data?.currency);
  const shopName = shopProfileQuery.data?.name || "Store POS";

  // Filtered list
  const filteredProducts = useMemo(() => {
    let list = products;
    if (filterMode === "missing") {
      list = list.filter((p) => !p.barcode || !p.barcode.trim());
    } else if (filterMode === "selected") {
      list = list.filter((p) => (selectedQuantities[p.id] ?? 0) > 0);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, filterMode, search, selectedQuantities]);

  // Items to print
  const printItems: BarcodePrintItem[] = useMemo(() => {
    return products
      .filter((p) => (selectedQuantities[p.id] ?? 0) > 0 && p.barcode?.trim())
      .map((p) => ({
        name: p.name,
        barcode: p.barcode!.trim(),
        price: p.price,
        quantity: selectedQuantities[p.id] || 1,
      }));
  }, [products, selectedQuantities]);

  const totalLabelsCount = useMemo(() => {
    return printItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [printItems]);

  // Save Settings Mutation
  const saveSettingsMutation = useMutation({
    mutationFn: (newConfig: BarcodeLabelConfig) =>
      window.storePos.printer.saveBarcodeSettings(newConfig),
    onSuccess: () => {
      notify("ဘားကုဒ် ပုံစံ ဆက်တင်များကို သိမ်းဆည်းပြီးပါပြီ", "success");
      void queryClient.invalidateQueries({ queryKey: ["barcode-settings"] });
    },
    onError: (err: any) => {
      notify("ဆက်တင် သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ပါသည်: " + err.message, "error");
    },
  });

  // Bulk Auto-Generate Missing Barcodes
  const [isGenerating, setIsGenerating] = useState(false);
  const handleBulkGenerateMissing = async () => {
    const missing = products.filter((p) => !p.barcode || !p.barcode.trim());
    if (missing.length === 0) {
      notify("ဘားကုဒ် မရှိသေးသော ကုန်ပစ္စည်း မရှိပါ", "info");
      return;
    }

    if (
      !window.confirm(
        `ဘားကုဒ် မရှိသေးသော ကုန်ပစ္စည်း (${missing.length}) မျိုးအတွက် စနစ်တွင်းသုံး EAN-13 ဘားကုဒ်များကို အလိုအလျောက် သတ်မှတ်ပေးမည်လား။`
      )
    ) {
      return;
    }

    setIsGenerating(true);
    try {
      const existingBarcodes = new Set(
        products.map((p) => p.barcode?.trim()).filter(Boolean) as string[]
      );

      for (const prod of missing) {
        const newCode = generateInternalBarcode(existingBarcodes);
        existingBarcodes.add(newCode);
        await window.storePos.pos.saveProduct({
          ...prod,
          barcode: newCode,
        });
      }

      notify(
        `ကုန်ပစ္စည်း (${missing.length}) မျိုးအတွက် ဘားကုဒ်များ အောင်မြင်စွာ ဖန်တီးပေးပြီးပါပြီ`,
        "success"
      );
      await queryClient.invalidateQueries({ queryKey: ["products-all"] });
    } catch (err: any) {
      notify("ဘားကုဒ် ထုတ်ပေးရာတွင် အမှားဖြစ်ပေါ်ပါသည်: " + err.message, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate single barcode
  const handleGenerateSingle = async (product: Product) => {
    try {
      const existingBarcodes = new Set(
        products.map((p) => p.barcode?.trim()).filter(Boolean) as string[]
      );
      const newCode = generateInternalBarcode(existingBarcodes);
      await window.storePos.pos.saveProduct({
        ...product,
        barcode: newCode,
      });
      notify(`“${product.name}” အတွက် ဘားကုဒ် (${newCode}) ထုတ်ပေးပြီးပါပြီ`, "success");
      await queryClient.invalidateQueries({ queryKey: ["products-all"] });
    } catch (err: any) {
      notify("ဘားကုဒ် ထုတ်ပေးရာတွင် အမှားဖြစ်ပေါ်ပါသည်: " + err.message, "error");
    }
  };

  // Selection helpers
  const handleToggleSelectAll = () => {
    const allSelected = filteredProducts.every(
      (p) => (selectedQuantities[p.id] ?? 0) > 0
    );
    if (allSelected) {
      setSelectedQuantities((prev) => {
        const next = { ...prev };
        for (const p of filteredProducts) {
          delete next[p.id];
        }
        return next;
      });
    } else {
      setSelectedQuantities((prev) => {
        const next = { ...prev };
        for (const p of filteredProducts) {
          if (!next[p.id]) {
            next[p.id] = Math.max(1, p.quantity > 0 ? p.quantity : 1);
          }
        }
        return next;
      });
    }
  };

  const handleSetAllQuantities = (qty: number | "stock") => {
    setSelectedQuantities((prev) => {
      const next = { ...prev };
      for (const p of filteredProducts) {
        next[p.id] = qty === "stock" ? Math.max(1, p.quantity > 0 ? p.quantity : 1) : qty;
      }
      return next;
    });
  };

  // Printing Mutation
  const printMutation = useMutation({
    mutationFn: async () => {
      if (printItems.length === 0) {
        throw new Error("ရိုက်ထုတ်ရန် ကုန်ပစ္စည်း မရွေးချယ်ရသေးပါ (သို့မဟုတ် ဘားကုဒ် မရှိသေးပါ)");
      }
      return window.storePos.printer.printBarcodes({
        items: printItems,
        format: config.format,
        printerName: config.printerName || undefined,
        options: {
          includeShopName: config.includeShopName,
          includeProductName: config.includeProductName,
          includePrice: config.includePrice,
        },
      });
    },
    onSuccess: (res) => {
      notify(`စတစ်ကာ (${res.count}) ခု အောင်မြင်စွာ ရိုက်ထုတ်ပြီးပါပြီ`, "success");
    },
    onError: (err: any) => {
      notify("စတစ်ကာ ရိုက်ထုတ်ရာတွင် အမှားဖြစ်ပေါ်ပါသည်: " + err.message, "error");
    },
  });

  // Current preview target
  const previewProduct =
    (previewProductId && products.find((p) => p.id === previewProductId)) ||
    products.find((p) => (selectedQuantities[p.id] ?? 0) > 0) ||
    products[0];

  const previewSvg = useMemo(() => {
    const code = previewProduct?.barcode || "2012345678901";
    return generateBarcodeSvg(code, {
      height: 38,
      showText: true,
      fontSize: 10,
    });
  }, [previewProduct]);

  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span>🏷️</span>
            <span>ဘားကုဒ် စတစ်ကာ စင်တာ</span>
            <span
              className="tooltip tooltip-right cursor-pointer text-slate-400 hover:text-slate-600 text-xs font-normal"
              data-tip="Thermal စတစ်ကာလိပ်၊ ဘေလ်စလစ် သို့မဟုတ် A4 စတစ်ကာစာရွက်များဖြင့် ကုန်ပစ္စည်းဘားကုဒ်များ စိတ်ကြိုက်ရိုက်ထုတ်နိုင်ပါသည်"
            >
              ℹ️
            </span>
          </h2>
        </div>

        {/* Global Action */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={handleBulkGenerateMissing}
            className="btn btn-sm btn-outline border-amber-500 text-amber-700 hover:bg-amber-500 hover:text-white flex items-center gap-1.5"
            title="ဘားကုဒ် မရှိသေးသော ကုန်ပစ္စည်းများကို collision-free EAN-13 ကုဒ်များ တစ်ပြိုင်နက် သတ်မှတ်ပေးပါမည်"
          >
            <span>⚡</span>
            <span>{isGenerating ? "ထုတ်နေသည်..." : "မရှိသေးသူများ အလိုအလျောက် ကုဒ်ထုတ်မည်"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Left Column: Product Selection & Batch Queue (7 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 min-h-0">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            {/* Filter Tabs */}
            <div className="join">
              <button
                type="button"
                className={`join-item btn btn-xs ${filterMode === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterMode("all")}
              >
                အားလုံး ({products.length})
              </button>
              <button
                type="button"
                className={`join-item btn btn-xs ${filterMode === "missing" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterMode("missing")}
              >
                ဘားကုဒ် မရှိသေး ({products.filter((p) => !p.barcode?.trim()).length})
              </button>
              <button
                type="button"
                className={`join-item btn btn-xs ${filterMode === "selected" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterMode("selected")}
              >
                ရွေးချယ်ထားသော စာရင်း ({Object.values(selectedQuantities).filter((q) => q > 0).length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-56">
              <input
                type="text"
                placeholder="အမည် သို့မဟုတ် ဘားကုဒ် ရှာရန်..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input input-bordered input-xs w-full pr-7"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1 text-slate-400 hover:text-slate-600 text-xs"
                  onClick={() => setSearch("")}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Quick Quantity Tools */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs text-slate-700"
                onClick={handleToggleSelectAll}
              >
                {filteredProducts.length > 0 &&
                filteredProducts.every((p) => (selectedQuantities[p.id] ?? 0) > 0)
                  ? "အားလုံး ပြန်ဖြုတ်မည်"
                  : "အားလုံး ရွေးမည်"}
              </button>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-medium">အရေအတွက် သတ်မှတ်ရန်:</span>
              <button
                type="button"
                className="btn btn-outline btn-xs px-2"
                onClick={() => handleSetAllQuantities("stock")}
                title="လက်ကျန်ရှိသလောက် စတစ်ကာ ရိုက်မည်"
              >
                လက်ကျန်အတိုင်း
              </button>
              <button
                type="button"
                className="btn btn-outline btn-xs px-2"
                onClick={() => handleSetAllQuantities(1)}
              >
                ၁ ခုစီ
              </button>
              <button
                type="button"
                className="btn btn-outline btn-xs px-2"
                onClick={() => handleSetAllQuantities(5)}
              >
                ၅ ခုစီ
              </button>
              <button
                type="button"
                className="btn btn-outline btn-xs px-2"
                onClick={() => handleSetAllQuantities(10)}
              >
                ၁၀ ခုစီ
              </button>
            </div>

            <div className="font-semibold text-emerald-700">
              စုစုပေါင်း: {totalLabelsCount} စတစ်ကာ
            </div>
          </div>

          {/* Products Table */}
          <div className="flex-1 overflow-y-auto border border-slate-100 rounded-lg min-h-[350px]">
            <table className="table table-xs table-pin-rows w-full">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="w-8">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={
                        filteredProducts.length > 0 &&
                        filteredProducts.every((p) => (selectedQuantities[p.id] ?? 0) > 0)
                      }
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th>ကုန်ပစ္စည်း အမည်</th>
                  <th>ဘားကုဒ်</th>
                  <th className="text-right">စျေးနှုန်း</th>
                  <th className="text-center">လက်ကျန်</th>
                  <th className="text-center w-36">ရိုက်မည့် အရေအတွက်</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-400">
                      ရှာဖွေမှုနှင့် ကိုက်ညီသော ကုန်ပစ္စည်း မရှိပါ
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => {
                    const isSelected = (selectedQuantities[product.id] ?? 0) > 0;
                    const qty = selectedQuantities[product.id] || 0;
                    const hasBarcode = Boolean(product.barcode?.trim());

                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-slate-50/80 transition cursor-pointer ${
                          previewProduct?.id === product.id ? "bg-emerald-50/40" : ""
                        }`}
                        onClick={() => setPreviewProductId(product.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-primary"
                            checked={isSelected}
                            disabled={!hasBarcode}
                            onChange={(e) => {
                              setSelectedQuantities((prev) => {
                                const next = { ...prev };
                                if (e.target.checked) {
                                  next[product.id] = Math.max(1, product.quantity > 0 ? product.quantity : 1);
                                } else {
                                  delete next[product.id];
                                }
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="font-medium text-slate-900">
                          <div>{product.name}</div>
                          {product.unit && (
                            <div className="text-[10px] text-slate-400">{product.unit}</div>
                          )}
                        </td>
                        <td>
                          {hasBarcode ? (
                            <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {product.barcode}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="badge badge-warning badge-xs text-white">မရှိသေး</span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-blue-600 hover:bg-blue-50 py-0 h-5 min-h-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleGenerateSingle(product);
                                }}
                              >
                                ⚡ ကုဒ်ထုတ်
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="text-right font-medium text-slate-800">
                          {formatCurrency(product.price, currency)}
                        </td>
                        <td className="text-center font-medium">
                          <span
                            className={`badge badge-sm ${
                              product.quantity <= 0
                                ? "badge-ghost text-slate-400"
                                : "badge-ghost text-emerald-800 bg-emerald-50"
                            }`}
                          >
                            {product.quantity}
                          </span>
                        </td>
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              className="btn btn-xs btn-square btn-ghost border border-slate-200"
                              disabled={qty <= 0}
                              onClick={() => {
                                setSelectedQuantities((prev) => {
                                  const cur = prev[product.id] || 0;
                                  if (cur <= 1) {
                                    const next = { ...prev };
                                    delete next[product.id];
                                    return next;
                                  }
                                  return { ...prev, [product.id]: cur - 1 };
                                });
                              }}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="999"
                              value={qty}
                              disabled={!hasBarcode}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setSelectedQuantities((prev) => {
                                  const next = { ...prev };
                                  if (isNaN(val) || val <= 0) {
                                    delete next[product.id];
                                  } else {
                                    next[product.id] = Math.min(999, val);
                                  }
                                  return next;
                                });
                              }}
                              className="input input-bordered input-xs w-14 text-center font-bold"
                            />
                            <button
                              type="button"
                              className="btn btn-xs btn-square btn-ghost border border-slate-200"
                              disabled={!hasBarcode}
                              onClick={() => {
                                setSelectedQuantities((prev) => ({
                                  ...prev,
                                  [product.id]: (prev[product.id] || 0) + 1,
                                }));
                              }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Settings, Preview & Print (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
          {/* Label Configuration Box */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 flex flex-col gap-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center justify-between">
              <span>⚙️ ပရင်တာနှင့် ပုံစံ ဆက်တင်</span>
              <button
                type="button"
                disabled={saveSettingsMutation.isPending}
                onClick={() => saveSettingsMutation.mutate(config)}
                className="btn btn-ghost btn-xs text-emerald-600 hover:bg-emerald-50"
              >
                {saveSettingsMutation.isPending ? "သိမ်းနေသည်..." : "မူလအဖြစ်သိမ်းမည်"}
              </button>
            </h3>

            {/* Target Printer */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold text-slate-600">ပရင်တာ ရွေးချယ်ရန်:</span>
              </label>
              <select
                className="select select-bordered select-sm w-full text-xs"
                value={config.printerName || ""}
                onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
              >
                <option value="">(စနစ် ပုံမှန် ပရင်တာ ရွေးချယ်မှု စနစ်ဖွင့်မည်)</option>
                {printersQuery.data?.map((p: PrinterInfo) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? "★ (Default)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Label Format */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-semibold text-slate-600">စတစ်ကာ / စာရွက် ပုံစံ:</span>
              </label>
              <select
                className="select select-bordered select-sm w-full text-xs"
                value={config.format}
                onChange={(e) => setConfig({ ...config, format: e.target.value as BarcodeLabelFormat })}
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} — {f.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Label Content Toggles */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-600">စတစ်ကာပေါ်တွင် ပြသမည့် အချက်များ:</span>
              <label className="label cursor-pointer py-0.5 justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={config.includeShopName}
                  onChange={(e) => setConfig({ ...config, includeShopName: e.target.checked })}
                />
                <span className="label-text text-xs">ဆိုင်အမည် ({shopName})</span>
              </label>
              <label className="label cursor-pointer py-0.5 justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={config.includeProductName}
                  onChange={(e) => setConfig({ ...config, includeProductName: e.target.checked })}
                />
                <span className="label-text text-xs">ကုန်ပစ္စည်းအမည်</span>
              </label>
              <label className="label cursor-pointer py-0.5 justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={config.includePrice}
                  onChange={(e) => setConfig({ ...config, includePrice: e.target.checked })}
                />
                <span className="label-text text-xs">စျေးနှုန်း (MMK)</span>
              </label>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between text-xs font-bold text-slate-700">
              <span>👁️ စတစ်ကာ ပုံစံ နမူနာ (Live Preview)</span>
              <span className="badge badge-ghost badge-sm text-[10px] uppercase font-mono">
                {config.format}
              </span>
            </div>

            {/* Visual Label Canvas Simulation */}
            <div className="w-full bg-slate-100/70 p-4 rounded-lg flex items-center justify-center min-h-[170px]">
              <div
                className="bg-white rounded shadow-md border border-slate-300 p-2 flex flex-col items-center justify-between text-center"
                style={{
                  width: config.format.startsWith("thermal-30")
                    ? "140px"
                    : config.format.startsWith("receipt-58")
                      ? "170px"
                      : "190px",
                  minHeight: "115px",
                }}
              >
                {config.includeShopName && (
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-full">
                    {shopName}
                  </div>
                )}
                {config.includeProductName && (
                  <div className="text-xs font-bold text-slate-900 truncate max-w-full px-1">
                    {previewProduct?.name || "ကုန်ပစ္စည်းအမည်"}
                  </div>
                )}

                <div
                  className="w-full flex items-center justify-center my-1"
                  style={{ height: "42px" }}
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />

                {config.includePrice && (
                  <div className="text-xs font-black text-slate-900 mt-0.5">
                    {formatCurrency(previewProduct?.price || 1500, currency)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Print Summary & Action */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">ရိုက်မည့် ကုန်ပစ္စည်း:</span>
              <span className="font-bold text-slate-800">{printItems.length} မျိုး</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">စုစုပေါင်း စတစ်ကာအရေအတွက်:</span>
              <span className="font-extrabold text-base text-emerald-600">{totalLabelsCount} ခု</span>
            </div>

            <button
              type="button"
              disabled={printItems.length === 0 || printMutation.isPending}
              onClick={() => printMutation.mutate()}
              className="btn btn-primary w-full shadow-lg shadow-emerald-700/20 text-white font-bold text-sm py-3 mt-1"
            >
              <span>🖨️</span>
              <span>
                {printMutation.isPending
                  ? "ပရင်တာသို့ ပို့နေသည်..."
                  : `စတစ်ကာများ ရိုက်ထုတ်မည် (${totalLabelsCount} ခု)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
