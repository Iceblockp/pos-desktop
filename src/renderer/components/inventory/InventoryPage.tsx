import { useCapabilities } from '../../useCapabilities';
import { useState } from "react";
import { ProductsTab } from "./ProductsTab";
import { CategoriesTab } from "./CategoriesTab";
import { SuppliersTab } from "./SuppliersTab";

export function InventoryPage({ notify }: { notify: (s: string) => void }) {
  const { owner } = useCapabilities();
  const [tab, setTab] = useState<"products" | "categories" | "suppliers">("products");

  return (
    <section className="h-full flex flex-col gap-3">
      {/* Header */}
      <header className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-gray-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">📦 Inventory Management</h1>
          <p className="text-xs text-gray-500">
            Catalog products, track stock movements, categories, and suppliers
          </p>
        </div>

        {/* Navigation Tabs */}
        <div role="tablist" className="tabs tabs-boxed bg-gray-100 p-1 rounded-lg">
          <button
            role="tab"
            className={`tab tab-sm font-medium ${tab === "products" ? "tab-active bg-white shadow-sm font-semibold text-gray-900" : "text-gray-600"}`}
            onClick={() => setTab("products")}
          >
            Products & Stock
          </button>
          <button
            role="tab"
            className={`tab tab-sm font-medium ${tab === "categories" ? "tab-active bg-white shadow-sm font-semibold text-gray-900" : "text-gray-600"}`}
            onClick={() => setTab("categories")}
          >
            Categories
          </button>
          {owner && (
            <button
              role="tab"
              className={`tab tab-sm font-medium ${tab === "suppliers" ? "tab-active bg-white shadow-sm font-semibold text-gray-900" : "text-gray-600"}`}
              onClick={() => setTab("suppliers")}
            >
              Suppliers
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "products" && <ProductsTab notify={notify} onOpenCategories={() => setTab("categories")} />}
        {tab === "categories" && <CategoriesTab notify={notify} />}
        {owner && tab === "suppliers" && <SuppliersTab notify={notify} />}
      </div>
    </section>
  );
}
