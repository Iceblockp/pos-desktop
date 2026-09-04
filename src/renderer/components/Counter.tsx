import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartLine, Product, Receipt } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Counter({
  cart,
  setCart,
  afterSale,
  notify,
}: {
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  afterSale: () => void;
  notify: (s: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const [tendered, setTendered] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [priceLevelId, setPriceLevelId] = useState("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [discountModal, setDiscountModal] = useState<"line" | "order" | null>(
    null,
  );
  const [discountProductId, setDiscountProductId] = useState("");
  const [discountDraft, setDiscountDraft] = useState("");

  const products = useQuery({
    queryKey: ["products", search],
    queryFn: () => window.storePos.pos.products(search),
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => window.storePos.pos.customers(),
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
  const total = Math.max(0, discountableTotal - orderDiscount);

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
    setOrderDiscount((current) => Math.min(current, discountableTotal));
  }, [discountableTotal]);

  const checkout = useMutation({
    mutationFn: () =>
      window.storePos.pos.checkout({
        lines: cart,
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
      afterSale();
      notify(`Sale saved: ${result.voucherId}`);
    },
    onError: (error: Error) => notify(error.message),
  });

  const addProduct = (product: Product) => {
    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      );
    } else {
      const tier =
        priceLevelId &&
        product.tiers?.find(
          (t) => t.priceLevelId === priceLevelId && t.minQuantity <= 1,
        );
      setCart([
        ...cart,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: tier?.bulkPrice ?? product.price,
          discount: 0,
        },
      ]);
    }
    setSearch("");
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter((item) => item.productId !== productId));
    } else {
      setCart(
        cart.map((item) => {
          if (item.productId !== productId) return item;
          const product = products.data?.find((p) => p.id === productId);
          const tier =
            priceLevelId &&
            product?.tiers?.find(
              (t) =>
                t.priceLevelId === priceLevelId && t.minQuantity <= quantity,
            );
          return {
            ...item,
            quantity,
            unitPrice: tier?.bulkPrice ?? (product?.price || item.unitPrice),
          };
        }),
      );
    }
  };

  const removeLineDiscount = (productId: string) => {
    setCart(
      cart.map((item) =>
        item.productId === productId ? { ...item, discount: 0 } : item,
      ),
    );
  };

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

  const buffer = useRef("");
  const firstAt = useRef(0);
  const timer = useRef<number>(0);

  useEffect(() => {
    const scan = async (event: globalThis.KeyboardEvent) => {
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        if (!firstAt.current) firstAt.current = Date.now();
        buffer.current += event.key;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(async () => {
          const code = buffer.current;
          buffer.current = "";
          firstAt.current = 0;
          if (code.length >= 4) {
            const product = products.data?.find((p) => p.barcode === code);
            if (product) addProduct(product);
          }
        }, 150);
      }
    };
    window.addEventListener("keydown", scan);
    return () => window.removeEventListener("keydown", scan);
  }, [cart, products.data, priceLevelId]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const firstProduct = products.data?.[0];
      if (firstProduct) addProduct(firstProduct);
    }
  };

  return (
    <section className="h-full">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Counter</h1>
        <p className="text-gray-600">
          Scan a barcode or search products. Pricing and discounts are
          calculated before checkout.
        </p>
        <div className="mt-3 flex gap-2 text-sm text-gray-600">
          <kbd className="kbd kbd-sm">F2</kbd>
          <span>Search</span>
          <span className="mx-2">·</span>
          <kbd className="kbd kbd-sm">Enter</kbd>
          <span>Scan</span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        {/* Product Catalog */}
        <div>
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search name or barcode"
              className="input input-bordered w-full"
              autoFocus
            />
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {products.data?.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                className="card bg-white hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-200 hover:border-green-500"
              >
                <div className="card-body p-4 gap-2">
                  <h3 className="font-semibold text-sm line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-green-600 font-bold text-base">
                    {money.format(product.price)}
                  </p>
                  {product.stock !== undefined && (
                    <p className="text-xs text-gray-500">
                      Stock: {product.stock}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {!products.data?.length && (
            <div className="text-center py-12">
              <p className="text-gray-400">No products found</p>
            </div>
          )}
        </div>

        {/* Cart Sidebar */}
        <div className="card bg-white shadow-xl sticky top-5 self-start">
          <div className="card-body">
            {/* Price Level Badge */}
            {priceLevelId && (
              <div className="badge badge-success badge-outline mb-3">
                Using {selectedLevelName} pricing
              </div>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">
                  Scan or select products to start.
                </p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {cart.map((line) => (
                  <div
                    key={line.productId}
                    className="flex items-center gap-3 pb-3 border-b border-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {line.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {money.format(line.unitPrice)} each
                      </p>
                      {line.discount > 0 && (
                        <p className="text-xs text-orange-600">
                          Disc: -{money.format(line.discount)}
                        </p>
                      )}
                    </div>
                    <div className="join">
                      <button
                        className="btn btn-xs join-item"
                        onClick={() =>
                          updateQuantity(line.productId, line.quantity - 1)
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
                        className="input input-xs join-item w-12 text-center"
                      />
                      <button
                        className="btn btn-xs join-item"
                        onClick={() =>
                          updateQuantity(line.productId, line.quantity + 1)
                        }
                      >
                        +
                      </button>
                    </div>
                    <p className="font-bold text-sm w-16 text-right">
                      {money.format(line.quantity * line.unitPrice)}
                    </p>
                    <button
                      className="btn btn-xs btn-ghost btn-square text-error"
                      onClick={() => updateQuantity(line.productId, 0)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            {cart.length > 0 && (
              <>
                <div className="divider my-2"></div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{money.format(gross)}</span>
                  </div>
                  {lineDiscounts > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Line discounts</span>
                      <span>-{money.format(lineDiscounts)}</span>
                    </div>
                  )}
                  {orderDiscount > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Order discount</span>
                      <span>-{money.format(orderDiscount)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center text-2xl font-bold mt-3">
                  <span>Total</span>
                  <span className="text-green-600">{money.format(total)}</span>
                </div>

                {/* Payment Method */}
                <div className="form-control mt-4">
                  <label className="label">
                    <span className="label-text font-medium">
                      Payment Method
                    </span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {activeMethods.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                    <option value="debt">On Account (Debt)</option>
                  </select>
                </div>

                {/* Cash Tendered */}
                {method === "cash" && (
                  <div className="form-control mt-3">
                    <label className="label">
                      <span className="label-text font-medium">
                        Cash received
                      </span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      placeholder="Optional"
                      className="input input-bordered"
                    />
                    {tendered && Number(tendered) >= total && (
                      <label className="label">
                        <span className="label-text-alt text-success">
                          Change: {money.format(Number(tendered) - total)}
                        </span>
                      </label>
                    )}
                  </div>
                )}

                {/* Customer Selection */}
                {method === "debt" && (
                  <div className="form-control mt-3">
                    <label className="label">
                      <span className="label-text font-medium">Customer</span>
                    </label>
                    <select
                      className="select select-bordered w-full"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      required
                    >
                      <option value="">Select customer</option>
                      {customers.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Checkout Button */}
                <button
                  className="btn btn-primary btn-block mt-4 btn-lg"
                  onClick={() => checkout.mutate()}
                  disabled={
                    checkout.isPending || (method === "debt" && !customerId)
                  }
                >
                  {checkout.isPending ? "Processing..." : "Checkout"}
                </button>

                {/* Secondary Actions */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setCart([])}
                  >
                    Clear Cart
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setDiscountModal("order");
                      setDiscountDraft(String(orderDiscount));
                    }}
                  >
                    Order Discount
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg mb-4">
              Receipt #{receipt.voucherId}
            </h3>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Date:</strong>{" "}
                {new Date(receipt.soldAt).toLocaleString()}
              </p>
              <p>
                <strong>Total:</strong> {money.format(receipt.total)}
              </p>
              <p>
                <strong>Payment:</strong> {receipt.paymentMethod}
              </p>
              {receipt.change !== undefined && receipt.change > 0 && (
                <p>
                  <strong>Change:</strong> {money.format(receipt.change)}
                </p>
              )}
            </div>
            <div className="modal-action">
              <button className="btn" onClick={() => setReceipt(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  window.storePos.printer.printReceipt(receipt.id);
                  setReceipt(null);
                }}
              >
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modals */}
      {discountModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">
              {discountModal === "line" ? "Line Discount" : "Order Discount"}
            </h3>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Discount amount</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={discountDraft}
                onChange={(e) => setDiscountDraft(e.target.value)}
                className="input input-bordered"
                autoFocus
              />
            </div>
            <div className="modal-action">
              <button className="btn" onClick={() => setDiscountModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  discountModal === "line"
                    ? saveLineDiscount()
                    : saveOrderDiscount()
                }
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
