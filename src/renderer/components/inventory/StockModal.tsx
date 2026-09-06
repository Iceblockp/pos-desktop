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
          Stock movement · {product.name}
        </h3>
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>

        <p className="mb-4">
          Current stock:{" "}
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
              <span className="label-text">Action</span>
            </label>
            <select
              className="select select-bordered"
              value={action}
              onChange={(event) => setAction(event.target.value as StockAction)}
            >
              <option value="stock_in">Receive stock</option>
              <option value="waste">Waste / damaged</option>
              <option value="adjustment">Stock count</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">
                {action === "adjustment" ? "Counted stock" : "Quantity"}
              </span>
            </label>
            <input
              required
              inputMode="decimal"
              placeholder={action === "adjustment" ? "Actual quantity on shelf" : "5"}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="input input-bordered"
            />
          </div>

          {receiving ? (
            <>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Supplier</span>
                </label>
                <select
                  className="select select-bordered"
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
              </div>

              {showCost && <div className="form-control">
                <label className="label">
                  <span className="label-text">Unit cost</span>
                </label>
                <input
                  inputMode="decimal"
                  placeholder="Optional; leave blank if unknown"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                  className="input input-bordered"
                />
              </div>}

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Delivery reference</span>
                </label>
                <input
                  placeholder="Invoice or delivery number"
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  className="input input-bordered"
                />
              </div>
            </>
          ) : (
            <div className="form-control">
              <label className="label">
                <span className="label-text">Reason</span>
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
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !quantity}
            >
              {saving ? "Saving…" : "Save movement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
