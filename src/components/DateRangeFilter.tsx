"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "This Month", value: "thisMonth" },
  { label: "90d", value: "90d" },
  { label: "All", value: "" },
] as const;

function getFirstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getStartDate(range: string): string | null {
  if (range === "thisMonth") return getFirstOfMonth();
  const days = parseInt(range);
  if (!days) return null;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

function getCustomMonthLabel(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return null;
  const sd = new Date(`${startDate}T00:00:00`);
  const ed = new Date(`${endDate}T00:00:00`);

  if (sd.getDate() !== 1) return null;

  const lastDay = new Date(sd.getFullYear(), sd.getMonth() + 1, 0).getDate();
  if (ed.getDate() !== lastDay) return null;
  if (sd.getMonth() !== ed.getMonth() || sd.getFullYear() !== ed.getFullYear()) return null;

  return sd.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("range") ?? "";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";
  const dateParam = searchParams.get("date") ?? "";

  const isSingleDay = !!dateParam || (!!startDate && startDate === endDate);
  const singleDayValue = dateParam || startDate;

  const customMonthLabel = useMemo(
    () => getCustomMonthLabel(startDate, endDate),
    [startDate, endDate]
  );

  const handleSelect = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("range", value);
    } else {
      params.delete("range");
    }
    params.delete("startDate");
    params.delete("endDate");
    params.delete("date");
    router.replace(`?${params.toString()}`);
  };

  const handleClearCustom = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("startDate");
    params.delete("endDate");
    params.delete("range");
    router.replace(`?${params.toString()}`);
  };

  const handleClearDate = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("date");
    if (!dateParam) {
      params.delete("startDate");
      params.delete("endDate");
    }
    router.replace(`?${params.toString()}`);
  };

  const singleDayLabel = isSingleDay
    ? new Date(`${singleDayValue}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {OPTIONS.map(({ label, value }) => {
        const isActive = active === value && !customMonthLabel && !isSingleDay;
        return (
          <button
            key={label}
            onClick={() => handleSelect(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-space-indigo-600 text-white"
                : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
            }`}
          >
            {label}
          </button>
        );
      })}

      {!isSingleDay && customMonthLabel && (
        <button
          onClick={handleClearCustom}
          className="rounded-lg bg-cornflower-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cornflower-blue-600"
        >
          {customMonthLabel}
        </button>
      )}

      {isSingleDay && (
        <button
          onClick={handleClearDate}
          title="Clear date filter"
          className="inline-flex items-center gap-1 rounded-full bg-space-indigo-100 px-3 py-1.5 text-xs font-medium text-space-indigo-700 transition-colors hover:bg-space-indigo-200"
        >
          {singleDayLabel}
          <span className="text-space-indigo-400">&times;</span>
        </button>
      )}
    </div>
  );
}
