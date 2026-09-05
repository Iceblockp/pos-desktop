export type TierDraft = {
  key: string;
  id: string;
  minQuantity: string;
  bulkPrice: string;
};

export type StockAction = "stock_in" | "waste" | "adjustment";

export type ModalType = "product" | "categories" | "category" | "stock" | "history" | null;
