import React from "react";

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "primary" | "emerald" | "rose" | "amber" | "slate";
  className?: string;
}

/**
 * EmptyState: Standard presentation of empty or zero-data screens on Desktop.
 * Follows the Pos Design System Archetype 1 & Section 3(ဃ).
 */
export function EmptyState({
  icon = "🧾",
  title,
  description,
  actionLabel,
  onAction,
  tone = "slate",
  className = "",
}: EmptyStateProps) {
  const toneBg = {
    primary: "bg-emerald-50 text-emerald-600 border-emerald-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    slate: "bg-slate-100 text-slate-500 border-slate-200",
  }[tone];

  return (
    <div className={`flex flex-col items-center justify-center py-14 px-6 text-center ${className}`}>
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-3 border shadow-sm ${toneBg}`}
      >
        <span>{icon}</span>
      </div>
      <h3 className="text-base font-bold text-gray-800">{title}</h3>
      {description && (
        <p className="text-xs text-gray-500 mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 btn btn-sm btn-primary font-semibold shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
