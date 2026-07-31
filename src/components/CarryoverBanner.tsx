"use client";

import { formatCurrency } from "@/src/utils/currency";
import { useResolveCarryover } from "@/src/hooks/useResolveCarryover";
import type { CarryoverItem } from "@/src/types/budget";

interface CarryoverBannerProps {
  carryovers: CarryoverItem[];
  currentMonth: string;
}

export default function CarryoverBanner({ carryovers, currentMonth }: CarryoverBannerProps) {
  const resolveCarryover = useResolveCarryover();

  if (carryovers.length === 0) return null;

  const handleResolve = (
    category: string,
    decision: "carryover" | "savings" | "goal" | "reset"
  ) => {
    resolveCarryover.mutate({ month: currentMonth, category, decision });
  };

  return (
    <div className="rounded-lg border border-cornflower-blue-200 bg-cornflower-blue-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-cornflower-blue-800">
        Unresolved Underspending from Last Month
      </h3>
      <p className="mb-3 text-xs text-cornflower-blue-600">
        You underspent in these categories. Pick what to do with the leftover funds.
      </p>
      <div className="space-y-3">
        {carryovers.map((item) => (
          <div
            key={item.category}
            className="flex items-center justify-between rounded-md bg-white px-3 py-2 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-space-indigo-800">
                {item.category}
              </p>
              <p className="text-xs text-space-indigo-400">
                {item.month} leftover: {formatCurrency(item.underspentAmount)}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleResolve(item.category, "carryover")}
                disabled={resolveCarryover.isPending}
                className="rounded-md bg-space-indigo-100 px-2 py-1 text-xs font-medium text-space-indigo-700 transition-colors hover:bg-space-indigo-200 disabled:opacity-50"
              >
                Carry Over
              </button>
              <button
                onClick={() => handleResolve(item.category, "savings")}
                disabled={resolveCarryover.isPending}
                className="rounded-md bg-ocean-deep-100 px-2 py-1 text-xs font-medium text-ocean-deep-700 transition-colors hover:bg-ocean-deep-200 disabled:opacity-50"
              >
                Save It
              </button>
              <button
                onClick={() => handleResolve(item.category, "goal")}
                disabled={resolveCarryover.isPending}
                className="rounded-md bg-cornflower-blue-100 px-2 py-1 text-xs font-medium text-cornflower-blue-700 transition-colors hover:bg-cornflower-blue-200 disabled:opacity-50"
              >
                Put to Goal
              </button>
              <button
                onClick={() => handleResolve(item.category, "reset")}
                disabled={resolveCarryover.isPending}
                className="rounded-md bg-soft-periwinkle-100 px-2 py-1 text-xs font-medium text-soft-periwinkle-700 transition-colors hover:bg-soft-periwinkle-200 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
