"use client";

import Button from "@/src/components/ui/Button";

interface IncomeBannerProps {
  month: string;
  onMarkIncome: () => void;
}

export default function IncomeBanner({ month, onMarkIncome }: IncomeBannerProps) {
  const monthLabel = new Date(
    parseInt(month.split("-")[0]),
    parseInt(month.split("-")[1]) - 1,
    1
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border border-cornflower-blue-200 bg-cornflower-blue-50/80 p-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-cornflower-blue-900">
            No Income Marked for {monthLabel}
          </h3>
          <p className="mt-0.5 text-xs text-cornflower-blue-700">
            Mark at least one income transaction to calculate your envelope limits
            using the 50/20/30 rule.
          </p>
        </div>
        <Button
          onClick={onMarkIncome}
          variant="accent"
          size="md"
          className="w-full sm:w-auto shrink-0 text-center text-xs font-semibold shadow-2xs"
        >
          Mark Income
        </Button>
      </div>
    </div>
  );
}
