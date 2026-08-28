"use client";

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
    <div className="rounded-lg border border-cornflower-blue-200 bg-cornflower-blue-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-cornflower-blue-800">
            No Income Marked for {monthLabel}
          </h3>
          <p className="mt-1 text-xs text-cornflower-blue-600">
            Mark at least one income transaction to calculate your budget limits
            using the 50/20/30 rule.
          </p>
        </div>
        <button
          onClick={onMarkIncome}
          className="shrink-0 rounded-lg bg-cornflower-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cornflower-blue-600"
        >
          Mark Income
        </button>
      </div>
    </div>
  );
}
