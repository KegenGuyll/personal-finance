"use client";

import { useIncomePatterns } from "@/src/hooks/useIncomePatterns";
import { useDeleteIncomePattern } from "@/src/hooks/useDeleteIncomePattern";
import { formatCurrency } from "@/src/utils/currency";

interface IncomeSectionProps {
  totalIncome: number;
  expectedIncome: number;
}

export default function IncomeSection({ totalIncome, expectedIncome }: IncomeSectionProps) {
  const { data: patternsData } = useIncomePatterns();
  const deletePattern = useDeleteIncomePattern();

  const patterns = patternsData?.patterns ?? [];

  return (
    <div className="rounded-xl border border-space-indigo-100 bg-white p-3.5 shadow-xs sm:p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-space-indigo-800">Monthly Income</h3>
          <p className="text-xs text-space-indigo-400">Total detected & marked income</p>
        </div>
        <div className="text-right">
          <p className="text-base font-extrabold text-emerald-600 sm:text-lg">
            {formatCurrency(totalIncome)}
          </p>
          {expectedIncome > 0 && expectedIncome !== totalIncome && (
            <p className="text-[11px] text-space-indigo-400">
              of {formatCurrency(expectedIncome)} expected
            </p>
          )}
        </div>
      </div>

      {patterns.length > 0 && (
        <div className="mt-3 border-t border-space-indigo-50 pt-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-space-indigo-400">
            Auto-detection patterns ({patterns.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {patterns.map((p) => (
              <span
                key={p._id}
                className="inline-flex items-center gap-1.5 rounded-md border border-space-indigo-100 bg-space-indigo-50 px-2 py-1 text-xs font-medium text-space-indigo-700"
              >
                <span>{p.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (p._id) deletePattern.mutate(p._id);
                  }}
                  disabled={deletePattern.isPending}
                  className="flex h-4 w-4 items-center justify-center rounded text-space-indigo-400 hover:bg-space-indigo-200/60 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Remove pattern for ${p.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
