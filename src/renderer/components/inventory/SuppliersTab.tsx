import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Product, StockMovement, Supplier } from "../../../shared/models";

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function SuppliersTab({ notify }: { notify: (s: string) => void }) {
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
      {/* Header */}
      <header className="mb-3 flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Suppliers</h2>
          <p className="text-xs text-gray-500">
            Track supplier contacts and purchase history
          </p>
        </div>
        <button className="btn btn-primary btn-xs" onClick={add}>
          Add supplier
        </button>
      </header>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3">
        <input
          placeholder="Search name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input input-bordered input-sm flex-1"
        />
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as "all" | "month")}
          className="select select-bordered select-sm"
        >
          <option value="month">This month</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Supplier List */}
      <div className="card bg-white shadow-lg">
        <div className="card-body">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">
            Supplier list
          </h3>
          <div className="space-y-1">
            {suppliers.data?.length ? (
              suppliers.data.map(({ supplier, spend }) => (
                <div
                  key={supplier.id}
                  className="flex justify-between items-start p-2 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">
                      {supplier.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {supplier.contactName ||
                        supplier.phone ||
                        "No contact details"}
                      {supplier.address ? ` · ${supplier.address}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{money.format(spend)}</p>
                    <p className="text-xs text-gray-500">
                      {period === "month"
                        ? "purchased this month"
                        : "purchased all time"}
                    </p>
                    <button
                      className="btn btn-xs btn-ghost mt-1"
                      onClick={() => edit(supplier)}
                    >
                      View
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-4">
                {suppliers.isLoading
                  ? "Loading suppliers…"
                  : "No suppliers found."}
              </p>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">
              {form.id ? "Supplier details" : "Add supplier"}
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
              className="space-y-4 mb-6"
            >
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Supplier name</span>
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
                  <span className="label-text">Contact person</span>
                </label>
                <input
                  value={form.contactName}
                  onChange={(event) =>
                    setForm({ ...form, contactName: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Phone</span>
                </label>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Address</span>
                </label>
                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                  className="input input-bordered"
                />
              </div>

              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save supplier"}
                </button>
              </div>
            </form>

            {form.id && (
              <>
                <div className="divider"></div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-md">Purchases</h4>
                  <button
                    className="btn btn-error btn-sm btn-outline"
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

                <div className="space-y-2">
                  {purchases.data?.length ? (
                    purchases.data.map((purchase) => (
                      <div
                        key={purchase.id}
                        className="flex justify-between items-start p-3 border border-gray-200 rounded"
                      >
                        <div className="flex-1">
                          <p className="font-semibold">
                            {purchase.productName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(purchase.occurredAt).toLocaleString()}
                            {purchase.referenceNumber
                              ? ` · ${purchase.referenceNumber}`
                              : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">
                            {purchase.quantity > 0 ? "+" : ""}
                            {purchase.quantity}
                          </p>
                          <p className="text-sm text-gray-500">
                            {purchase.unitCost == null
                              ? "Cost not recorded"
                              : `${money.format(purchase.unitCost)} each`}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 py-4">
                      No supplier-linked deliveries in this period.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
