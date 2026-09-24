import { useCapabilities } from '../useCapabilities';
import { stepFor } from '../../shared/units';
import { resolveUnitPrice } from "../../shared/pricing";
import { formatCurrency } from '../../shared/currency';
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartDraft, CartLine, Product, Receipt, Customer } from "../../shared/models";

const money = { format: formatCurrency };

function getSuggestedCash(total: number): number[] {
  if (total <= 0) return [];
  const suggestions = new Set<number>();
  suggestions.add(total); // Exact amount

  const bases = [1000, 5000, 10000, 20000, 50000, 100000];
  for (const base of bases) {
    if (base > total) {
      suggestions.add(base);
    } else {
      const rounded = Math.ceil(total / base) * base;
      if (rounded > total && rounded <= total + base * 2) {
        suggestions.add(rounded);
      }
    }
  }
  return Array.from(suggestions).sort((a, b) => a - b).slice(0, 4);
}

export function Counter({
  draft,
  updateDraft,
  cart,
  setCart,
  afterSale,
  notify,
}: {
  draft: CartDraft;
  updateDraft: (patch: Partial<CartDraft>) => void;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  afterSale: () => void;
  notify: (s: string, type?: "success" | "error" | "info") => void;
}) {
  const capabilities = useCapabilities();
  const client = useQueryClient();
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState<Record<string, string>>({});
  const note = draft.note;
  const setNote = (value: string) => updateDraft({ note: value });
  const soldAt = draft.soldAt;
  const setSoldAt = (value: string) => updateDraft({ soldAt: value });
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [productOffset, setProductOffset] = useState(0);
  const [method, setMethod] = useState("cash");
  const customerId = draft.customerId;
  const setCustomerId = (value: string) => updateDraft({ customerId: value });
  const [tendered, setTendered] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const priceLevelId = draft.priceLevelId;
  const setPriceLevelId = (value: string) => updateDraft({ priceLevelId: value });
  const orderDiscount = draft.orderDiscount;
  const setOrderDiscount = (value: number) => updateDraft({ orderDiscount: value });
  const [discountModal, setDiscountModal] = useState<"line" | "order" | null>(null);
  const [discountProductId, setDiscountProductId] = useState("");
  const [discountDraft, setDiscountDraft] = useState("");

  // Customer selection modal & quick add
  const [customerModal, setCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  // Collapsible advanced checkout options
  const [showAdvanced, setShowAdvanced] = useState(false);

  const products = useQuery({
    queryKey: ["product-page", search, selectedCategory, productOffset],
    queryFn: () => window.storePos.pos.productPage({ search, categoryId: selectedCategory || undefined, offset: productOffset, limit: 100 }),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => window.storePos.pos.categories(),
  });
  const cartProducts = useQuery({
    queryKey: ["cart-products", cart.map((l) => l.productId).sort().join(",")],
    queryFn: () =>
      window.storePos.pos.cartProducts(cart.map((l) => l.productId)),
    enabled: cart.length > 0,
  });
  const customers = useQuery({
    queryKey: ["counter-customer-page", customerSearch],
    queryFn: () => window.storePos.pos.customerPage({ search: customerSearch, limit: 100 }),
  });
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => window.storePos.pos.paymentMethods(),
  });
  const levels = useQuery({
    queryKey: ["price-levels"],
    queryFn: () => window.storePos.pos.priceLevels(),
  });

  const activeMethods = methods.data?.filter((item) => item.isActive) ?? [];
  const defaultPriceLevelId =
    levels.data?.find((level) => level.isDefault)?.id ?? "";
  const selectedLevelName =
    levels.data?.find((level) => level.id === priceLevelId)?.name ?? "Retail";

  const selectedCustomer = useMemo(
    () => customers.data?.items.find((c) => c.id === customerId) ?? null,
    [customers.data, customerId],
  );

  const gross = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart],
  );
  const lineDiscounts = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum +
          Math.min(line.quantity * line.unitPrice, Math.max(0, line.discount)),
        0,
      ),
    [cart],
  );
  const discountableTotal = Math.max(0, gross - lineDiscounts);
  const total =
    Math.round(Math.max(0, discountableTotal - orderDiscount) * 1000) / 1000;
  const paid = split
    ? activeMethods.reduce((sum, m) => sum + Number(parts[m.code] || 0), 0)
    : method === "debt"
      ? 0
      : total;
  const outstanding = Math.round((total - paid) * 1000) / 1000;

  useEffect(() => {
    if (
      method !== "debt" &&
      activeMethods.length &&
      !activeMethods.some((item) => item.code === method)
    )
      setMethod(activeMethods[0].code);
  }, [activeMethods, method]);

  useEffect(() => {
    if (!priceLevelId && defaultPriceLevelId)
      setPriceLevelId(defaultPriceLevelId);
  }, [defaultPriceLevelId, priceLevelId]);

  useEffect(() => {
    if (orderDiscount > discountableTotal) setOrderDiscount(discountableTotal);
  }, [discountableTotal]);

  const checkout = useMutation({
    mutationFn: () =>
      window.storePos.pos.checkout({
        lines: cart,
        note,
        soldAt: soldAt ? new Date(soldAt).toISOString() : null,
        payments: split
          ? activeMethods
              .map((m) => ({
                methodCode: m.code,
                amount: Number(parts[m.code] || 0),
                methodName: m.name,
                tendered:
                  m.code === "cash" && tendered ? Number(tendered) : null,
              }))
              .filter((p) => p.amount > 0)
          : undefined,
        customerId: customerId || null,
        paymentMethod: method,
        priceLevelId: priceLevelId || null,
        discount: orderDiscount,
        amountTendered: method === "cash" && tendered ? Number(tendered) : null,
      }),
    onSuccess: (result) => {
      setReceipt(result);
      setTendered("");
      setCustomerId("");
      setOrderDiscount(0);
      setParts({});
      setNote("");
      setSoldAt("");
      setSplit(false);
      void client.invalidateQueries();
      afterSale();
      notify(`အရောင်းပြီးပါပြီ — #${result.voucherId}`, "success");
    },
    onError: (error: Error) => notify(error.message, "error"),
  });

  const saveCustomer = useMutation({
    mutationFn: (input: { name: string; phone?: string }) =>
      window.storePos.pos.saveCustomer(input),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: ["customer-page"] });
      void client.invalidateQueries({ queryKey: ["counter-customer-page"] });
      void client.invalidateQueries({ queryKey: ["customer-summary"] });
      setCustomerId(saved.id);
      setShowAddCustomer(false);
      setCustomerModal(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      notify(`ဖောက်သည် ${saved.name} ကို ထည့်ပြီးပါပြီ`, "success");
    },
    onError: (err: Error) => notify(err.message, "error"),
  });

  const catalog = useRef(new Map<string, Product>());
  for (const product of [
    ...(products.data?.items ?? []),
    ...(cartProducts.data ?? []),
  ])
    catalog.current.set(product.id, product);

  const price = (product: Product, quantity: number) =>
    resolveUnitPrice(
      product.price,
      quantity,
      product.tiers,
      priceLevelId || "level-retail",
    ).unitPrice;

  const addProduct = (product: Product) => {
    catalog.current.set(product.id, product);
    setCart((current) => {
      const existing = current.find((l) => l.productId === product.id);
      const quantity = (existing?.quantity ?? 0) + stepFor(product.unit);
      return existing
        ? current.map((l) =>
            l.productId === product.id
              ? { ...l, quantity, unitPrice: price(product, quantity) }
              : l,
          )
        : [
            ...current,
            {
              productId: product.id,
              name: product.name,
              unit: product.unit,
              quantity,
              unitPrice: price(product, quantity),
              unitCost: product.cost,
              discount: 0,
            },
          ];
    });
    setSearch("");
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (!Number.isFinite(quantity)) return;
    setCart((current) =>
      quantity <= 0
        ? current.filter((l) => l.productId !== productId)
        : current.map((l) => {
            if (l.productId !== productId) return l;
            const product = catalog.current.get(productId);
            return {
              ...l,
              quantity,
              unitPrice: product ? price(product, quantity) : l.unitPrice,
            };
          }),
    );
  };

  useEffect(() => {
    setCart((current) => {
      let changed = false;
      const next = current.map((line) => {
        const p = catalog.current.get(line.productId);
        if (!p) return line;
        const unitPrice = price(p, line.quantity);
        if (unitPrice === line.unitPrice && p.cost === line.unitCost)
          return line;
        changed = true;
        return {
          ...line,
          name: p.name,
          unit: p.unit,
          unitPrice,
          unitCost: p.cost,
        };
      });
      return changed ? next : current;
    });
  }, [priceLevelId, products.data, cartProducts.data]);

  useEffect(() => {
    if (!cartProducts.data || cartProducts.isFetching) return;
    const active = new Set(cartProducts.data.map((p) => p.id));
    if (cart.some((line) => !active.has(line.productId)))
      setCart((current) =>
        current.filter((line) => active.has(line.productId)),
      );
  }, [cartProducts.data, cartProducts.isFetching]);

  const saveLineDiscount = (amount = Number(discountDraft) || 0) => {
    const line = cart.find((item) => item.productId === discountProductId);
    if (!line) return;
    const maxDiscount = line.quantity * line.unitPrice;
    setCart(
      cart.map((item) =>
        item.productId === discountProductId
          ? { ...item, discount: Math.min(maxDiscount, Math.max(0, amount)) }
          : item,
      ),
    );
    setDiscountModal(null);
  };

  const saveOrderDiscount = (amount = Number(discountDraft) || 0) => {
    setOrderDiscount(Math.min(discountableTotal, Math.max(0, amount)));
    setDiscountModal(null);
  };

  // Barcode wedge scanner (USB, 2.4G & Bluetooth keyboard emulation)
  const buffer = useRef("");
  const firstAt = useRef(0);
  const timer = useRef<number>(0);

  useEffect(() => {
    const scan = async (event: globalThis.KeyboardEvent) => {
      // Don't intercept if user is typing in form inputs
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName ?? "",
        ) ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Enter key emitted by barcode scanner at end of scanned code
      if (event.key === "Enter" && buffer.current.length >= 3) {
        event.preventDefault();
        clearTimeout(timer.current);
        const code = buffer.current;
        buffer.current = "";
        firstAt.current = 0;
        try {
          const product = await window.storePos.pos.findByBarcode(code);
          if (product) {
            addProduct(product);
            notify(`✓ ဘားကုဒ်ဖတ်ပြီး — ${product.name}`, "success");
          } else {
            notify(`ဘားကုဒ် “${code}” ကို မတွေ့ပါ`, "error");
          }
        } catch (e) {
          notify((e as Error).message, "error");
        }
        return;
      }

      // Buffer characters
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        if (!firstAt.current) firstAt.current = Date.now();
        buffer.current += event.key;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(async () => {
          const code = buffer.current;
          buffer.current = "";
          firstAt.current = 0;
          if (code.length >= 3) {
            try {
              const product = await window.storePos.pos.findByBarcode(code);
              if (product) {
                addProduct(product);
                notify(`✓ ဘားကုဒ်ဖတ်ပြီး — ${product.name}`, "success");
              } else {
                notify(`ဘားကုဒ် “${code}” ကို မတွေ့ပါ`, "error");
              }
            } catch (e) {
              notify((e as Error).message, "error");
            }
          }
        }, 150);
      }
    };
    window.addEventListener("keydown", scan);
    return () => window.removeEventListener("keydown", scan);
  }, [cart, products.data, priceLevelId]);

  useEffect(() => {
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (receipt) setReceipt(null);
        else if (customerModal) {
          setCustomerModal(false);
          setShowAddCustomer(false);
        } else if (discountModal) {
          setDiscountModal(null);
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [receipt, customerModal, discountModal]);

  const handleSearchKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const term = search.trim();
      if (!term) return;

      // Check exact barcode first
      try {
        const exact = await window.storePos.pos.findByBarcode(term);
        if (exact) {
          addProduct(exact);
          setSearch("");
          notify(`✓ ဘားကုဒ်ဖတ်ပြီး — ${exact.name}`, "success");
          return;
        }
      } catch {}

      const firstProduct = filteredProducts[0];
      if (firstProduct) {
        addProduct(firstProduct);
        setSearch("");
        notify(`ဈေးခြင်းထဲ ထည့်ပြီး — ${firstProduct.name}`, "success");
      } else {
        notify(`“${term}” နှင့်ကိုက်ညီသော ကုန်ပစ္စည်းမရှိပါ`, "error");
      }
    }
  };

  const filteredProducts = products.data?.items ?? [];

  // Cash change calculation
  const effectiveCashAmount = split ? Number(parts.cash || 0) : total;
  const tenderedNum = Number(tendered);
  const hasCashChange =
    ((!split && method === "cash") || (split && Number(parts.cash) > 0)) &&
    tenderedNum >= effectiveCashAmount &&
    effectiveCashAmount > 0;
  const cashChange = hasCashChange ? tenderedNum - effectiveCashAmount : 0;
  const suggestedCash = useMemo(
    () => getSuggestedCash(effectiveCashAmount),
    [effectiveCashAmount],
  );

  return (
    <section className="h-full flex flex-col gap-3">
      {/* Header Bar */}
      <header className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold">
            🛒
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              အရောင်းကောင်တာ
            </h1>
            <p className="text-xs text-gray-500">
              ဘားကုဒ်ဖတ်ပါ သို့မဟုတ် ကုန်ပစ္စည်းကို နှိပ်၍ ရောင်းပါ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Barcode Scanner Active Indicator */}
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200/80 rounded-lg text-xs text-emerald-800 shadow-2xs select-none"
            title="USB၊ Wireless နှင့် Bluetooth ဘားကုဒ်စကင်နာများကို အလိုအလျောက် အသုံးပြုနိုင်ပါသည်။"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold flex items-center gap-1">
              <span>📷</span>
              <span>ဘားကုဒ်စကင်နာ အသင့်ရှိသည်</span>
            </span>
          </div>

          {capabilities.effectivePlan !== "free" ? (
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
              <span>စျေးနှုန်းအဆင့် —</span>
              <select
                aria-label="စျေးနှုန်းအဆင့်"
                className="select select-bordered select-xs bg-white"
                value={priceLevelId}
                onChange={(e) => setPriceLevelId(e.target.value)}
              >
                {levels.data?.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="badge badge-outline text-xs text-emerald-700 font-medium">
              {selectedLevelName}
            </div>
          )}

          {cart.length > 0 && (
            <button
              onClick={() => {
                setCart([]);
                setCustomerId("");
                setOrderDiscount(0);
                setNote("");
                setSoldAt("");
                setParts({});
                setSplit(false);
                setTendered("");
              }}
              className="btn btn-ghost btn-xs text-rose-600 hover:bg-rose-50"
            >
              ဈေးခြင်းရှင်းမည်
            </button>
          )}
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 flex-1 overflow-hidden">
        {/* Left Column: Search, Categories & Catalog */}
        <div className="flex flex-col overflow-hidden bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm">
          {/* Search Bar */}
          <div className="relative mb-3">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setProductOffset(0); }}
              onKeyDown={handleSearchKeyDown}
              placeholder="ကုန်ပစ္စည်းရှာပါ သို့မဟုတ် ဘားကုဒ်ဖတ်ပါ (F2)…"
              className="input input-bordered input-sm w-full pl-9 pr-24 text-sm bg-gray-50 focus:bg-white"
              autoFocus
            />
            <div className="absolute inset-y-0 right-2.5 flex items-center gap-1 pointer-events-none">
              <span className="badge badge-xs bg-slate-100 border-slate-200 text-[10px] text-slate-500 font-mono">
                📷 ဘားကုဒ် အသင့်
              </span>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
            <button
              onClick={() => { setSelectedCategory(""); setProductOffset(0); }}
              className={`btn btn-xs px-3 rounded-full font-medium transition ${
                !selectedCategory
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              အားလုံး
            </button>
            {categories.data?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setProductOffset(0); }}
                className={`btn btn-xs px-3 rounded-full font-medium whitespace-nowrap transition ${
                  selectedCategory === cat.id
                    ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                    : "btn-ghost bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredProducts.length > 0 ? (
              <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                {filteredProducts.map((product) => {
                  const isOutOfStock =
                    product.quantity !== undefined && product.quantity <= 0;
                  const isLowStock =
                    product.quantity !== undefined &&
                    product.minStock > 0 &&
                    product.quantity <= product.minStock &&
                    !isOutOfStock;

                  return (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className={`flex flex-col justify-between p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                        isOutOfStock
                          ? "bg-gray-50 border-gray-200 opacity-70 hover:border-gray-400"
                          : "bg-white border-gray-200/90 hover:border-emerald-500 hover:shadow-md hover:bg-emerald-50/20"
                      }`}
                    >
                      <div>
                        <h3 className="font-semibold text-xs text-gray-900 line-clamp-2 leading-snug">
                          {product.name}
                        </h3>
                        {product.barcode && (
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                            {product.barcode}
                          </p>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-baseline justify-between gap-1">
                        <span className="font-bold text-sm text-emerald-700">
                          {money.format(product.price)}
                        </span>
                        {isOutOfStock ? (
                          <span className="badge badge-error badge-xs text-white px-1 text-[9px]">
                            {product.quantity < 0 ? product.quantity : "ကုန်ပြီ"}
                          </span>
                        ) : isLowStock ? (
                          <span className="badge badge-warning badge-xs px-1 text-[9px]">
                            {product.quantity}
                          </span>
                        ) : product.quantity !== undefined ? (
                          <span className="text-[10px] text-gray-500">
                            {product.quantity} {product.unit}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 py-3 text-xs text-gray-500">
                <span>ပြထားသည် {productOffset + 1}-{productOffset + filteredProducts.length} / {products.data?.total ?? 0}</span>
                <div className="flex gap-2">
                  <button className="btn btn-xs" disabled={productOffset === 0} onClick={() => setProductOffset(Math.max(0, productOffset - 100))}>← ယခင်</button>
                  <button className="btn btn-xs" disabled={productOffset + filteredProducts.length >= (products.data?.total ?? 0)} onClick={() => setProductOffset(productOffset + 100)}>နောက်သို့ →</button>
                </div>
              </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <span className="text-3xl mb-2">🔍</span>
                <p className="text-sm font-medium">ကုန်ပစ္စည်း မတွေ့ပါ</p>
                <p className="text-xs">အခြားစာလုံး သို့မဟုတ် အမျိုးအစားဖြင့် ရှာကြည့်ပါ</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Cart & Checkout Sidebar */}
        <div className="flex flex-col bg-white rounded-xl border border-gray-200/80 shadow-lg overflow-hidden">
          {/* Cart Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
            <span className="font-bold text-sm text-gray-800">
              ဈေးခြင်း ({cart.reduce((s, l) => s + l.quantity, 0)})
            </span>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  setDiscountModal("order");
                  setDiscountDraft(String(orderDiscount));
                }}
                className="btn btn-ghost btn-xs text-emerald-700 font-semibold"
              >
                {orderDiscount > 0
                  ? `Disc: -${money.format(orderDiscount)}`
                  : "+ ဘောက်ချာလျှော့စျေး"}
              </button>
            )}
          </div>

          {/* Cart Line Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                <span className="text-4xl mb-2">🛒</span>
                <p className="text-sm font-medium">ဈေးခြင်းထဲတွင် ပစ္စည်းမရှိပါ</p>
                <p className="text-xs text-gray-400 text-center max-w-[200px] mt-1">
                  ဘားကုဒ်ဖတ်ပါ သို့မဟုတ် ဘယ်ဘက်မှ ပစ္စည်းကို နှိပ်ပါ
                </p>
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.productId}
                  className="p-2.5 rounded-lg border border-gray-200/90 bg-gray-50/40 hover:bg-white transition flex flex-col gap-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs text-gray-900 leading-tight">
                        {line.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                        <span>{money.format(line.unitPrice)}</span>
                        {line.discount > 0 && (
                          <span className="text-orange-600 font-medium">
                            · -{money.format(line.discount)} လျှော့
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Line total amount */}
                    <span className="font-bold text-xs text-gray-900 whitespace-nowrap">
                      {money.format(
                        line.quantity * line.unitPrice - line.discount,
                      )}
                    </span>
                  </div>

                  {/* Quantity controls and item actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-xs btn-circle h-6 w-6 min-h-0 bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
                        onClick={() =>
                          updateQuantity(
                            line.productId,
                            line.quantity - stepFor(line.unit),
                          )
                        }
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          updateQuantity(line.productId, Number(e.target.value))
                        }
                        className="input input-xs w-12 h-6 text-center font-bold p-0 text-xs bg-white border border-gray-300 rounded"
                      />
                      <button
                        className="btn btn-xs btn-circle h-6 w-6 min-h-0 bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
                        onClick={() =>
                          updateQuantity(
                            line.productId,
                            line.quantity + stepFor(line.unit),
                          )
                        }
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-xs btn-ghost btn-square h-6 w-6 min-h-0 text-emerald-700 font-bold"
                        title="ပစ္စည်းလျှော့စျေး"
                        onClick={() => {
                          setDiscountProductId(line.productId);
                          setDiscountDraft(String(line.discount));
                          setDiscountModal("line");
                        }}
                      >
                        %
                      </button>
                      <button
                        className="btn btn-xs btn-ghost btn-square h-6 w-6 min-h-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        title="ပစ္စည်းဖယ်မည်"
                        onClick={() => updateQuantity(line.productId, 0)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout Panel Footer */}
          {cart.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-gray-50/50 flex flex-col gap-3">
              {/* Financial Subtotals */}
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>မူလစုစုပေါင်း</span>
                  <span>{money.format(gross)}</span>
                </div>
                {lineDiscounts > 0 && (
                  <div className="flex justify-between text-orange-600 font-medium">
                    <span>ပစ္စည်းအလိုက် လျှော့စျေး</span>
                    <span>-{money.format(lineDiscounts)}</span>
                  </div>
                )}
                {orderDiscount > 0 && (
                  <div className="flex justify-between text-orange-600 font-medium">
                    <span>ဘောက်ချာလျှော့စျေး</span>
                    <span>-{money.format(orderDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1 border-t border-gray-200">
                  <span className="text-sm font-bold text-gray-900">စုစုပေါင်း</span>
                  <span className="text-2xl font-black text-emerald-700">
                    {money.format(total)}
                  </span>
                </div>
              </div>

              {/* Customer Selector Card */}
              <div
                onClick={() => setCustomerModal(true)}
                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                  selectedCustomer
                    ? "bg-emerald-50/70 border-emerald-300 text-emerald-900"
                    : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-sm">👤</span>
                  <div className="truncate">
                    <p className="font-semibold truncate">
                      {selectedCustomer ? selectedCustomer.name : "အထွေထွေဖောက်သည်"}
                    </p>
                    {selectedCustomer?.phone && (
                      <p className="text-[10px] text-gray-500">
                        {selectedCustomer.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {selectedCustomer ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomerId("");
                      }}
                      className="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0 text-gray-400 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  ) : (
                    <span className="text-[11px] text-emerald-600 font-medium">
                      ဖောက်သည် ရွေးရန် +
                    </span>
                  )}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <div className="flex gap-1.5 mb-2">
                  {activeMethods.map((m) => (
                    <button
                      key={m.code}
                      onClick={() => setMethod(m.code)}
                      className={`btn btn-xs flex-1 rounded-lg font-medium transition ${
                        method === m.code && !split
                          ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                          : "btn-outline border-gray-300 bg-white hover:bg-gray-100 text-gray-700"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                  {capabilities.debt && (
                    <button
                      onClick={() => setMethod("debt")}
                      className={`btn btn-xs rounded-lg font-medium transition ${
                        method === "debt" && !split
                          ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                          : "btn-outline border-gray-300 bg-white hover:bg-gray-100 text-gray-700"
                      }`}
                    >
                      အကြွေး
                    </button>
                  )}
                </div>

                {/* Cash Tender & Quick Chips */}
                {((!split && method === "cash") ||
                  (split && Number(parts.cash) > 0)) && (
                  <div className="space-y-2 p-2.5 rounded-lg bg-white border border-gray-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-600">
                        လက်ခံငွေ —
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={tendered}
                        onChange={(e) => setTendered(e.target.value)}
                        placeholder="မဖြည့်လည်းရပါသည်"
                        className="input input-xs input-bordered w-32 text-right font-bold text-xs"
                      />
                    </div>

                    {/* Quick Tender Chips */}
                    <div className="flex gap-1">
                      {suggestedCash.map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setTendered(String(amt))}
                          className={`btn btn-xs flex-1 px-1 text-[10px] font-medium ${
                            tendered === String(amt)
                              ? "btn-primary"
                              : "btn-ghost bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          {amt === effectiveCashAmount
                            ? "အတိအကျ"
                            : money.format(amt)}
                        </button>
                      ))}
                    </div>

                    {/* Live Change Box */}
                    {hasCashChange && (
                      <div className="flex items-center justify-between p-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900">
                        <span className="text-xs font-medium">ပြန်အမ်းရန် —</span>
                        <span className="text-sm font-black text-emerald-700">
                          {money.format(cashChange)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Collapsible Advanced Options (Split Payment, Note, SoldAt) */}
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-3 py-2 text-xs font-medium text-gray-600 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <span>
                    {showAdvanced ? "▾ အခြားရွေးချယ်မှုများ ပိတ်မည်" : "▸ မှတ်ချက်၊ ရက်စွဲနှင့် ခွဲပေးချေမှု"}
                  </span>
                  {note || soldAt || split ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  ) : null}
                </button>

                {showAdvanced && (
                  <div className="p-3 border-t border-gray-100 space-y-2.5 bg-gray-50/50">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={split}
                        onChange={(e) => setSplit(e.target.checked)}
                        className="checkbox checkbox-xs checkbox-primary"
                      />
                      <span>ငွေပေးချေမှုနည်းလမ်း အမျိုးမျိုးဖြင့် ခွဲပေးမည်</span>
                    </label>

                    {split && (
                      <div className="space-y-1.5 pl-5">
                        {activeMethods.map((m) => (
                          <div
                            key={m.code}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span>{m.name}</span>
                            <input
                              aria-label={m.name + " amount"}
                              className="input input-bordered input-xs w-28 text-right font-medium"
                              type="number"
                              min="0"
                              step="0.001"
                              value={parts[m.code] ?? ""}
                              onChange={(e) =>
                                setParts({ ...parts, [m.code]: e.target.value })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {outstanding > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        ကျန်အကြွေး — <strong>{money.format(outstanding)}</strong>
                      </p>
                    )}

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-gray-500">
                        အရောင်းရက် သတ်မှတ်မည် (မဖြည့်လည်းရ)
                      </label>
                      <input
                        type="datetime-local"
                        className="input input-bordered input-xs w-full"
                        value={soldAt}
                        onChange={(e) => setSoldAt(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-gray-500">
                        အရောင်းမှတ်ချက်
                      </label>
                      <input
                        placeholder="ဘောက်ချာတွင် ထည့်မည့် မှတ်ချက်…"
                        className="input input-bordered input-xs w-full"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Checkout Button */}
              <button
                className="btn btn-primary btn-block text-base font-bold shadow-md shadow-emerald-700/20 py-3 h-auto"
                onClick={() => checkout.mutate()}
                disabled={
                  checkout.isPending ||
                  cartProducts.isFetching ||
                  outstanding < 0 ||
                  (outstanding > 0 && (!customerId || !capabilities.debt)) ||
                  (!!tendered &&
                    ((!split &&
                      method === "cash" &&
                      Number(tendered) < total) ||
                      (split && Number(tendered) < Number(parts.cash || 0))))
                }
              >
                {checkout.isPending ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  `ငွေရှင်းမည် · ${money.format(total)}`
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Customer Selection Modal */}
      {customerModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                ဖောက်သည်ရွေးမည်
              </h3>
              <button
                className="btn btn-sm btn-ghost btn-circle"
                onClick={() => {
                  setCustomerModal(false);
                  setShowAddCustomer(false);
                }}
              >
                ✕
              </button>
            </div>

            {!showAddCustomer ? (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="အမည် သို့မဟုတ် ဖုန်းဖြင့်ရှာပါ…"
                    className="input input-bordered input-sm flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => setShowAddCustomer(true)}
                    className="btn btn-sm btn-primary"
                  >
                    + အသစ်ထည့်
                  </button>
                </div>

                {/* Walk-in Customer option */}
                <button
                  onClick={() => {
                    setCustomerId("");
                    setCustomerModal(false);
                  }}
                  className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                    !customerId
                      ? "bg-emerald-50 border-emerald-400 text-emerald-900"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div>
                    <p className="font-bold text-sm">အထွေထွေဖောက်သည်</p>
                    <p className="text-xs text-gray-500">သာမန်လက်လီအရောင်း (အကြွေးမရှိ)</p>
                  </div>
                  {!customerId && <span className="text-emerald-600 font-bold">✓</span>}
                </button>

                {/* Customer List */}
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {customers.data?.items.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerModal(false);
                        }}
                        className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                          customerId === c.id
                            ? "bg-emerald-50 border-emerald-400 text-emerald-900"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-sm text-gray-900">
                            {c.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {c.phone || "ဖုန်းမရှိ"}
                          </p>
                        </div>
                        {customerId === c.id && (
                          <span className="text-emerald-600 font-bold">✓</span>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              /* Inline Quick Add Customer Form */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newCustomerName.trim()) return;
                  saveCustomer.mutate({
                    name: newCustomerName.trim(),
                    phone: newCustomerPhone.trim() || undefined,
                  });
                }}
                className="mt-3 space-y-3"
              >
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">
                      ဖောက်သည်အမည် *
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="ဥပမာ ဒေါ်ခင်၊ ကိုအောင်"
                    className="input input-bordered input-sm w-full"
                    autoFocus
                  />
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold">
                      ဖုန်းနံပါတ် (မဖြည့်လည်းရ)
                    </span>
                  </label>
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="09..."
                    className="input input-bordered input-sm w-full"
                  />
                </div>

                <div className="modal-action pt-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowAddCustomer(false)}
                  >
                    နောက်သို့
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    disabled={saveCustomer.isPending || !newCustomerName.trim()}
                  >
                    {saveCustomer.isPending ? "သိမ်းနေသည်…" : "သိမ်းပြီး ရွေးမည်"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md p-6">
            <div className="text-center pb-4 border-b border-gray-100">
              <span className="text-4xl">🧾</span>
              <h3 className="font-bold text-xl text-gray-900 mt-2">
                အရောင်းပြီးပါပြီ
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                ဘောက်ချာအမှတ် #{receipt.voucherId}
              </p>
            </div>

            <div className="py-4 space-y-2 text-sm">
              <div className="flex justify-between text-xs text-gray-500">
                <span>ရက်စွဲ</span>
                <span>{new Date(receipt.soldAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>ပေးချေမှု</span>
                <span>{receipt.paymentMethod}</span>
              </div>
              {receipt.payments?.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600 pl-2">
                  <span>{p.methodName ?? p.methodCode}</span>
                  <span>{money.format(p.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-100">
                <span>ပေးပြီးစုစုပေါင်း</span>
                <span className="text-emerald-700">{money.format(receipt.total)}</span>
              </div>
              {receipt.change != null && receipt.change > 0 && (
                <div className="flex justify-between text-sm font-semibold text-emerald-800 bg-emerald-50 p-2 rounded">
                  <span>ပြန်အမ်းငွေ</span>
                  <span>{money.format(receipt.change)}</span>
                </div>
              )}
            </div>

            <div className="modal-action pt-2 flex gap-2">
              <button
                className="btn btn-outline btn-sm flex-1"
                onClick={() => setReceipt(null)}
              >
                ပိတ်မည်
              </button>
              <button
                className="btn btn-primary btn-sm flex-1"
                onClick={() => {
                  void window.storePos.printer
                    .printReceipt(receipt)
                    .then(() => {
                      notify("ဘောက်ချာကို ပရင်တာသို့ ပို့ပြီးပါပြီ", "success");
                      setReceipt(null);
                    })
                    .catch((e) => notify(e.message, "error"));
                }}
              >
                ဘောက်ချာထုတ်မည်
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {discountModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-3">
              {discountModal === "line" ? "ပစ္စည်းလျှော့စျေး" : "ဘောက်ချာလျှော့စျေး"}
            </h3>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">လျှော့မည့်ငွေ</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={discountDraft}
                onChange={(e) => setDiscountDraft(e.target.value)}
                className="input input-bordered input-sm"
                autoFocus
              />
            </div>
            <div className="modal-action">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setDiscountModal(null)}
              >
                မလုပ်တော့ပါ
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() =>
                  discountModal === "line"
                    ? saveLineDiscount()
                    : saveOrderDiscount()
                }
              >
                လျှော့စျေးသတ်မှတ်မည်
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
