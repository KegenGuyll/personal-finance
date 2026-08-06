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
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-space-indigo-800">Income</h3>
        <div className="text-right">
          <p className="text-lg font-bold text-emerald-600">
            {formatCurrency(totalIncome)}
          </p>
          {expectedIncome > 0 && expectedIncome !== totalIncome && (
            <p className="text-xs text-space-indigo-400">
              of {formatCurrency(expectedIncome)} expected
            </p>
          )}
        </div>
      </div>

      {patterns.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-space-indigo-400">
            Auto-detection patterns ({patterns.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {patterns.map((p) => (
              <span
                key={p._id}
                className="inline-flex items-center gap-1 rounded-md bg-space-indigo-50 px-2 py-0.5 text-xs text-space-indigo-600"
              >
                {p.name}
                <button
                  onClick={() => {
                    if (p._id) deletePattern.mutate(p._id);
                  }}
                  disabled={deletePattern.isPending}
                  className="ml-0.5 text-space-indigo-400 hover:text-red-500 disabled:opacity-50"
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
