import { useState } from "react";
import { ProductsTab } from "./ProductsTab";
import { SuppliersTab } from "./SuppliersTab";

export function InventoryPage({ notify }: { notify: (s: string) => void }) {
  const [tab, setTab] = useState<"products" | "suppliers">("products");

  return (
    <section className="h-full flex flex-col">
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">📦 Inventory</h1>
        <p className="text-xs text-gray-500">
          Manage your products, stock levels, and suppliers
        </p>
      </header>
      <div role="tablist" className="tabs tabs-boxed mb-3 bg-gray-100">
        <button
          role="tab"
          className={`tab tab-sm ${tab === "products" ? "tab-active" : ""}`}
          onClick={() => setTab("products")}
        >
          Products & Stock
        </button>
        <button
          role="tab"
          className={`tab tab-sm ${tab === "suppliers" ? "tab-active" : ""}`}
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
