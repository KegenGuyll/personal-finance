"use client";

interface MonthSelectorProps {
  value: string;
  onChange: (month: string) => void;
}

export default function MonthSelector({ value, onChange }: MonthSelectorProps) {
  const [year, monthNum] = value.split("-").map(Number);

  const goToPrev = () => {
    const d = new Date(year, monthNum - 2, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const goToNext = () => {
    const d = new Date(year, monthNum, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const isCurrentMonth =
    value ===
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <button
        onClick={goToPrev}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-space-indigo-200 bg-white text-sm font-semibold text-space-indigo-700 shadow-2xs transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-900 active:bg-space-indigo-100"
        aria-label="Previous month"
      >
        &#8592;
      </button>

      <span className="min-w-[7.5rem] text-center text-sm font-bold text-space-indigo-900 sm:min-w-[8.5rem] sm:text-base">
        {monthLabel}
      </span>

      <button
        onClick={goToNext}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-space-indigo-200 bg-white text-sm font-semibold text-space-indigo-700 shadow-2xs transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-900 active:bg-space-indigo-100"
        aria-label="Next month"
      >
        &#8594;
      </button>

      {!isCurrentMonth && (
        <button
          onClick={() => {
            const now = new Date();
            onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
          }}
          className="rounded-lg bg-space-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-space-indigo-600 transition-colors hover:bg-space-indigo-100 active:bg-space-indigo-200"
        >
          Today
        </button>
      )}
    </div>
  );
}
