import type { Product, Supplier } from "../../../shared/models";
import type { StockAction } from "./types";

interface StockModalProps {
  open: boolean;
  showCost?: boolean;
  product?: Product;
  action: StockAction;
  setAction: (value: StockAction) => void;
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
}

export function StockModal({
  open,
  showCost=true,
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
}: StockModalProps) {
  if (!open || !product) return null;

  const receiving = action === "stock_in";

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">
          လက်ကျန်အပြောင်းအလဲ · {product.name}
        </h3>
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>

        <p className="mb-4">
          လက်ရှိလက်ကျန် —{" "}
          <span className="font-bold">
            {product.quantity} {product.unit}
          </span>
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
          className="space-y-4"
        >
          <div className="form-control">
            <label className="label">
              <span className="label-text">လုပ်ဆောင်ချက်</span>
            </label>
            <select
              className="select select-bordered"
              value={action}
              onChange={(event) => setAction(event.target.value as StockAction)}
            >
              <option value="stock_in">ကုန်ဝင်လက်ခံမည်</option>
              <option value="waste">ပျက်စီး / ဆုံးရှုံး</option>
              <option value="adjustment">မြေပြင်လက်ကျန် ရေတွက်မည်</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">
                {action === "adjustment" ? "ရေတွက်ရရှိသော လက်ကျန်" : "အရေအတွက်"}
              </span>
            </label>
            <input
              required
              inputMode="decimal"
              placeholder={action === "adjustment" ? "မြေပြင်တွင် အမှန်တကယ်ရှိသောအရေအတွက်" : "5"}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="input input-bordered"
            />
          </div>

          {receiving ? (
            <>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">ပေးသွင်းသူ</span>
                </label>
                <select
                  className="select select-bordered"
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="">ပေးသွင်းသူ မသတ်မှတ်ထားပါ</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              {showCost && <div className="form-control">
                <label className="label">
                  <span className="label-text">တစ်ယူနစ်ဝယ်ရင်းစျေး</span>
                </label>
                <input
                  inputMode="decimal"
                  placeholder="မသိလျှင် မဖြည့်ဘဲထားနိုင်သည်"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                  className="input input-bordered"
                />
              </div>}

              <div className="form-control">
                <label className="label">
                  <span className="label-text">ပို့ဆောင်မှုရည်ညွှန်းအမှတ်</span>
                </label>
                <input
                  placeholder="အဝယ်ဘောင်ချာ သို့မဟုတ် ပို့ဆောင်မှုအမှတ်"
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  className="input input-bordered"
                />
              </div>
            </>
          ) : (
            <div className="form-control">
              <label className="label">
                <span className="label-text">အကြောင်းပြချက်</span>
              </label>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="input input-bordered"
              />
            </div>
          )}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              မလုပ်တော့ပါ
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !quantity}
            >
              {saving ? "သိမ်းနေသည်…" : "လက်ကျန်အပြောင်းအလဲ သိမ်းမည်"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
