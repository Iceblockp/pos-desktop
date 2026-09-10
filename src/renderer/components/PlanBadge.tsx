import React from "react";

export type PlanType = "free" | "offline_plus" | "cloud_pro" | "premium" | string;
export type PlanBadgeVariant = "micro" | "compact" | "pill" | "hero";

export interface PlanBadgeProps {
  plan?: PlanType;
  variant?: PlanBadgeVariant;
  locked?: boolean;
  className?: string;
}

export function PlanBadge({
  plan = "free",
  variant = "compact",
  locked = false,
  className = "",
}: PlanBadgeProps) {
  const normalizedPlan =
    plan === "cloud_pro" || plan === "premium"
      ? "cloud_pro"
      : plan === "offline_plus"
      ? "offline_plus"
      : "free";

  if (normalizedPlan === "cloud_pro") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider transition-all select-none ${
          variant === "hero"
            ? "px-3 py-1 text-sm bg-sky-100 text-sky-800 border border-sky-300 shadow-sm"
            : variant === "pill"
            ? "px-2.5 py-0.5 text-xs bg-sky-100 text-sky-800 border border-sky-300"
            : variant === "micro"
            ? "px-1.5 py-0.2 text-[10px] bg-sky-100 text-sky-800 border border-sky-200"
            : "px-2 py-0.5 text-[11px] bg-sky-100 text-sky-800 border border-sky-300"
        } ${className}`}
      >
        <span className="text-[12px] leading-none">{locked ? "🔒" : "☁️"}</span>
        <span>
          {variant === "hero"
            ? "Cloud Pro (ကလောက် ပရို)"
            : variant === "pill"
            ? "Cloud Pro"
            : "PRO"}
        </span>
      </span>
    );
  }

  if (normalizedPlan === "offline_plus") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider transition-all select-none ${
          variant === "hero"
            ? "px-3 py-1 text-sm bg-amber-100 text-amber-900 border border-amber-300 shadow-sm"
            : variant === "pill"
            ? "px-2.5 py-0.5 text-xs bg-amber-100 text-amber-900 border border-amber-300"
            : variant === "micro"
            ? "px-1.5 py-0.2 text-[10px] bg-amber-100 text-amber-900 border border-amber-200"
            : "px-2 py-0.5 text-[11px] bg-amber-100 text-amber-900 border border-amber-300"
        } ${className}`}
      >
        <span className="text-[12px] leading-none">{locked ? "🔒" : "⚡"}</span>
        <span>
          {variant === "hero"
            ? "Offline Plus (အော့ဖ်လိုင်း ပလပ်စ်)"
            : variant === "pill"
            ? "Offline Plus"
            : "PLUS"}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wider transition-all select-none ${
        variant === "hero"
          ? "px-3 py-1 text-sm bg-slate-100 text-slate-700 border border-slate-300 shadow-sm"
          : variant === "pill"
          ? "px-2.5 py-0.5 text-xs bg-slate-100 text-slate-700 border border-slate-200"
          : variant === "micro"
          ? "px-1.5 py-0.2 text-[10px] bg-slate-100 text-slate-600 border border-slate-200"
          : "px-2 py-0.5 text-[11px] bg-slate-100 text-slate-700 border border-slate-200"
      } ${className}`}
    >
      <span className="text-[11px] leading-none">🏪</span>
      <span>
        {variant === "hero"
          ? "Free Offline (အခမဲ့)"
          : variant === "pill"
          ? "Free Offline"
          : "FREE"}
      </span>
    </span>
  );
}
