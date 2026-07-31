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
    <div className="flex items-center gap-3">
      <button
        onClick={goToPrev}
        className="rounded-md px-2 py-1 text-sm text-space-indigo-400 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-600"
        aria-label="Previous month"
      >
        &#8592;
      </button>
      <span className="text-sm font-semibold text-space-indigo-800">
        {monthLabel}
      </span>
      {!isCurrentMonth && (
        <button
          onClick={() => {
            const now = new Date();
            onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
          }}
          className="rounded-md px-2 py-0.5 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-600"
        >
          Today
        </button>
      )}
      <button
        onClick={goToNext}
        className="rounded-md px-2 py-1 text-sm text-space-indigo-400 transition-colors hover:bg-space-indigo-50 hover:text-space-indigo-600"
        aria-label="Next month"
      >
        &#8594;
      </button>
    </div>
  );
}
