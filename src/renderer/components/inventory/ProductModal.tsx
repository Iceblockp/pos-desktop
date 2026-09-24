interface ProductForm {
  name: string;
  barcode: string;
  price: string;
  cost: string;
  quantity: string;
  minStock: string;
  unit: string;
}

interface ProductModalProps {
  open: boolean;
  title: string;
  form: ProductForm;
  setForm: (value: ProductForm) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function ProductModal({
  open,
  title,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: ProductModalProps) {
  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
          className="space-y-4"
        >
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
            <div key={field} className="form-control">
              <label className="label">
                <span className="label-text">
                  {field === "name"
                    ? "ကုန်ပစ္စည်းအမည်"
                    : field === "barcode"
                      ? "ဘားကုဒ်"
                      : field === "price"
                        ? "ရောင်းဈေး (လက်လီ)"
                        : field === "cost"
                          ? "ဝယ်ရင်းဈေး"
                          : field === "quantity"
                            ? "အဖွင့်လက်ကျန်"
                            : field === "minStock"
                              ? "အနည်းဆုံး လက်ကျန်သတ်မှတ်ချက်"
                              : field === "unit"
                                ? "ယူနစ် (ခု၊ ထုပ်၊ ဘူး …)"
                                : field}
                </span>
              </label>
              <input
                required={field === "name" || field === "price"}
                disabled={field === "quantity" && (title === "Edit product" || title.includes("ပြင်"))}
                value={form[field]}
                inputMode={
                  ["price", "cost", "quantity", "minStock"].includes(field)
                    ? "decimal"
                    : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
                className="input input-bordered"
              />
            </div>
          ))}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              မလုပ်တော့ပါ
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "သိမ်းနေသည်…" : "ကုန်ပစ္စည်းသိမ်းမည်"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
