import { useCapabilities } from '../useCapabilities';
import { stepFor } from '../../shared/units';
import { resolveUnitPrice } from "../../shared/pricing";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartDraft, CartLine, Product, Receipt } from "../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function Counter({
  draft,
  updateDraft,
  cart,
  setCart,
  afterSale,
  notify,
}: {
  draft: CartDraft;
  updateDraft: (patch:Partial<CartDraft>)=>void;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  afterSale: () => void;
  notify: (s: string) => void;
}) {
  const capabilities = useCapabilities();
  const client = useQueryClient();
  const [split,setSplit] = useState(false);
  const [parts,setParts] = useState<Record<string,string>>({});
  const note = draft.note;
  const setNote = (value:string) => updateDraft({note:value});
  const soldAt = draft.soldAt;
  const setSoldAt = (value:string) => updateDraft({soldAt:value});
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("cash");
  const customerId = draft.customerId;
  const setCustomerId = (value:string) => updateDraft({customerId:value});
  const [tendered, setTendered] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const priceLevelId = draft.priceLevelId;
  const setPriceLevelId = (value:string) => updateDraft({priceLevelId:value});
  const orderDiscount = draft.orderDiscount;
  const setOrderDiscount = (value:number) => updateDraft({orderDiscount:value});
  const [discountModal, setDiscountModal] = useState<"line" | "order" | null>(
    null,
  );
  const [discountProductId, setDiscountProductId] = useState("");
  const [discountDraft, setDiscountDraft] = useState("");

  const products = useQuery({
    queryKey: ["products", search],
    queryFn: () => window.storePos.pos.products(search),
  });
  const cartProducts=useQuery({queryKey:['cart-products',cart.map(l=>l.productId).sort().join(',')],queryFn:()=>window.storePos.pos.cartProducts(cart.map(l=>l.productId)),enabled:cart.length>0});
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
  const total = Math.round(Math.max(0, discountableTotal - orderDiscount)*1000)/1000;
  const paid = split ? activeMethods.reduce((sum,m) => sum+Number(parts[m.code] || 0),0) : method === 'debt' ? 0 : total;
  const outstanding = Math.round((total-paid)*1000)/1000;

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
    if(orderDiscount > discountableTotal)setOrderDiscount(discountableTotal);
  }, [discountableTotal]);

  const checkout = useMutation({
    mutationFn: () =>
      window.storePos.pos.checkout({
        lines: cart,
        note, soldAt: soldAt ? new Date(soldAt).toISOString() : null,
        payments: split ? activeMethods.map(m => ({methodCode:m.code,amount:Number(parts[m.code] || 0),methodName:m.name,tendered:m.code==='cash' && tendered ? Number(tendered) : null})).filter(p => p.amount > 0) : undefined,
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
      setParts({}); setNote(""); setSoldAt(""); setSplit(false);
      void client.invalidateQueries();
      afterSale();
      notify(`Sale saved: ${result.voucherId}`);
    },
    onError: (error: Error) => notify(error.message),
  });

  const catalog = useRef(new Map<string,Product>());
  for (const product of [...(products.data ?? []),...(cartProducts.data ?? [])]) catalog.current.set(product.id,product);
  const price = (product:Product,quantity:number) => resolveUnitPrice(product.price,quantity,product.tiers,priceLevelId || 'level-retail').unitPrice;
  const addProduct = (product:Product) => {
    catalog.current.set(product.id,product);
    setCart(current => {
      const existing=current.find(l => l.productId===product.id);
      const quantity=(existing?.quantity ?? 0)+stepFor(product.unit);
      return existing ? current.map(l => l.productId===product.id ? {...l,quantity,unitPrice:price(product,quantity)} : l)
        : [...current,{productId:product.id,name:product.name,unit:product.unit,quantity,unitPrice:price(product,quantity),unitCost:product.cost,discount:0}];
    }); setSearch('');
  };
  const updateQuantity = (productId:string,quantity:number) => {
    if (!Number.isFinite(quantity)) return;
    setCart(current => quantity <= 0 ? current.filter(l => l.productId!==productId) : current.map(l => {
      if(l.productId!==productId)return l;
      const product=catalog.current.get(productId);
      return {...l,quantity,unitPrice:product?price(product,quantity):l.unitPrice};
    }));
  };
  useEffect(() => {
    setCart(current => {
      let changed=false;
      const next=current.map(line => {
        const p=catalog.current.get(line.productId);if(!p)return line;
        const unitPrice=price(p,line.quantity);
        if(unitPrice===line.unitPrice && p.cost===line.unitCost)return line;
        changed=true;return {...line,name:p.name,unit:p.unit,unitPrice,unitCost:p.cost};
      });return changed?next:current;
    });
  },[priceLevelId,products.data,cartProducts.data]);

  useEffect(() => {
    if (!cartProducts.data || cartProducts.isFetching) return;
    const active = new Set(cartProducts.data.map(p=>p.id));
    if(cart.some(line=>!active.has(line.productId)))setCart(current=>current.filter(line=>active.has(line.productId)));
  }, [cartProducts.data, cartProducts.isFetching]);
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
        !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName ?? '') && !(document.activeElement as HTMLElement)?.isContentEditable
      ) {
        if (!firstAt.current) firstAt.current = Date.now();
        buffer.current += event.key;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(async () => {
          const code = buffer.current;
          buffer.current = "";
          firstAt.current = 0;
          if (code.length >= 4) {
            try { const product = await window.storePos.pos.findByBarcode(code); if (product) addProduct(product); else notify('Barcode not found'); } catch(e) { notify((e as Error).message); }
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
    <section className="h-full flex flex-col">
      {/* Compact Header */}
      <header className="mb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Counter</h1>
            <p className="text-xs text-gray-500">Scan or search products</p>
          </div>
          {capabilities.effectivePlan !== 'free' ? <label className="form-control text-xs">Price level<select aria-label="Price level" className="select select-bordered select-sm" value={priceLevelId} onChange={e=>setPriceLevelId(e.target.value)}>{levels.data?.map(level=><option key={level.id} value={level.id}>{level.name}</option>)}</select></label> : <div className="badge badge-success badge-sm">{selectedLevelName}</div>}
        </div>
      </header>

      {/* Main Grid - More Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 flex-1 overflow-hidden">
        {/* Product Catalog */}
        <div className="flex flex-col overflow-hidden">
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search name or barcode (F2)"
              className="input input-bordered input-sm w-full"
              autoFocus
            />
          </div>

          {/* Compact Product Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-6 gap-2 overflow-y-auto">
            {products.data?.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                className="card bg-white hover:bg-green-50 transition-colors cursor-pointer border border-gray-200 hover:border-green-500"
              >
                <div className="card-body p-2 gap-1">
                  <h3 className="font-semibold text-xs line-clamp-2 leading-tight">
                    {product.name}
                  </h3>
                  <p className="text-green-600 font-bold text-sm">
                    {money.format(product.price)}
                  </p>
                  {product.quantity !== undefined && (
                    <p className="text-[10px] text-gray-400">
                      Stk: {product.quantity}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {!products.data?.length && (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No products found</p>
            </div>
          )}
        </div>

        {/* Compact Cart Sidebar */}
        <div className="card bg-white shadow-lg flex flex-col overflow-hidden">
          <div className="card-body p-3 flex flex-col overflow-hidden">
            {/* Cart Items - Scrollable */}
            {cart.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">Cart is empty</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                {cart.map((line) => (
                  <div
                    key={line.productId}
                    className="group flex items-center gap-2 p-2 rounded hover:bg-gray-50 border border-gray-100"
                  >
                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate leading-tight">
                        {line.name}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span>{money.format(line.unitPrice)}</span>
                        {line.discount > 0 && (
                          <>
                            <span className="text-orange-600">
                              · -{money.format(line.discount)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls - More Compact */}
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-xs btn-square h-6 w-6 min-h-0"
                        onClick={() =>
                          updateQuantity(line.productId, line.quantity - stepFor(line.unit))
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
                        className="input input-xs w-10 h-6 text-center p-0 text-xs"
                      />
                      <button
                        className="btn btn-xs btn-square h-6 w-6 min-h-0"
                        onClick={() =>
                          updateQuantity(line.productId, line.quantity + stepFor(line.unit))
                        }
                      >
                        +
                      </button>
                    </div>

                    {/* Line Total */}
                    <p className="font-bold text-xs w-12 text-right">
                      {money.format(
                        line.quantity * line.unitPrice - line.discount,
                      )}
                    </p>

                    {/* Actions - Show on Hover */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="btn btn-xs btn-ghost btn-square h-6 w-6 min-h-0"
                        title="Discount"
                        onClick={() => {
                          setDiscountProductId(line.productId);
                          setDiscountDraft(String(line.discount));
                          setDiscountModal("line");
                        }}
                      >
                        %
                      </button>
                      <button
                        className="btn btn-xs btn-ghost btn-square h-6 w-6 min-h-0 text-error"
                        title="Remove"
                        onClick={() => updateQuantity(line.productId, 0)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals - Compact */}
            {cart.length > 0 && (
              <>
                <div className="divider my-1"></div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{money.format(gross)}</span>
                  </div>
                  {lineDiscounts > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Line disc.</span>
                      <span>-{money.format(lineDiscounts)}</span>
                    </div>
                  )}
                  {orderDiscount > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Order disc.</span>
                      <span>-{money.format(orderDiscount)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center text-lg font-bold mt-2">
                  <span>Total</span>
                  <span className="text-green-600">{money.format(total)}</span>
                </div>

                {/* Compact Payment Method */}
                <div className="form-control mt-2">
                  <label className="label py-1">
                    <span className="label-text text-xs font-medium">
                      Payment
                    </span>
                  </label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {activeMethods.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                    {capabilities.debt && <option value="debt">On Account</option>}
                  </select>
                </div>

                <label className="flex gap-2 mt-2 text-sm"><input type="checkbox" checked={split} onChange={e=>setSplit(e.target.checked)}/>Split payment</label>
                {split && activeMethods.map(m=><label key={m.code} className="flex justify-between gap-2 mt-2 text-sm">{m.name}<input aria-label={m.name+' amount'} className="input input-bordered input-sm w-32" type="number" min="0" step="0.001" value={parts[m.code]??''} onChange={e=>setParts({...parts,[m.code]:e.target.value})}/></label>)}
                {outstanding > 0 && <p className="text-sm mt-2">Customer owes: {money.format(outstanding)}</p>}
                <label className="form-control mt-2 text-xs">Sale date (optional)<input type="datetime-local" className="input input-bordered input-sm" value={soldAt} onChange={e=>setSoldAt(e.target.value)}/></label>
                <label className="form-control mt-2 text-xs">Note<input className="input input-bordered input-sm" value={note} onChange={e=>setNote(e.target.value)}/></label>
                {/* Cash Tendered - Compact */}
                {((!split && method === "cash") || (split && Number(parts.cash)>0)) && (
                  <div className="form-control mt-2">
                    <label className="label py-1">
                      <span className="label-text text-xs font-medium">
                        Cash received
                      </span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      placeholder="Optional"
                      className="input input-bordered input-sm"
                    />
                    {tendered && Number(tendered) >= (split ? Number(parts.cash) : total) && (
                      <label className="label py-0">
                        <span className="label-text-alt text-success">
                          Change: {money.format(Number(tendered) - (split ? Number(parts.cash) : total))}
                        </span>
                      </label>
                    )}
                  </div>
                )}

                {/* Customer Selection - Compact */}
                {(
                  <div className="form-control mt-2">
                    <label className="label py-1">
                      <span className="label-text text-xs font-medium">
                        Customer
                      </span>
                    </label>
                    <select
                      className="select select-bordered select-sm w-full"
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

                {/* Checkout Button - Compact */}
                <button
                  className="btn btn-primary btn-block mt-3"
                  onClick={() => checkout.mutate()}
                  disabled={
                    checkout.isPending || cartProducts.isFetching || outstanding < 0 || (outstanding > 0 && (!customerId || !capabilities.debt)) || (!!tendered && ((!split && method === 'cash' && Number(tendered) < total) || (split && Number(tendered) < Number(parts.cash || 0))))
                  }
                >
                  {checkout.isPending ? "Processing..." : "Checkout"}
                </button>

                {/* Secondary Actions - Compact */}
                <div className="flex gap-2 mt-2">
                  <button
                    className="btn btn-xs btn-ghost flex-1"
                    onClick={() => { setCart([]); setCustomerId(''); setOrderDiscount(0); setNote(''); setSoldAt(''); setParts({}); setSplit(false); setTendered(''); }}
                  >
                    Clear
                  </button>
                  <button
                    className="btn btn-xs btn-ghost flex-1"
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
              {receipt.payments?.map((p,i)=><p key={i}>{p.methodName ?? p.methodCode}: {money.format(p.amount)}</p>)}
              {!!receipt.outstanding && <p>Balance: {money.format(receipt.outstanding)}</p>}
              {receipt.change != null && receipt.change > 0 && (
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
                  void window.storePos.printer.printReceipt(receipt).then(()=>setReceipt(null)).catch(e=>notify(e.message));
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
