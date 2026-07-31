"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "" },
] as const;

export function getStartDate(range: string): string | null {
  const days = parseInt(range);
  if (!days) return null;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

export default function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("range") ?? "";

  const handleSelect = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("range", value);
    } else {
      params.delete("range");
    }
    router.replace(`?${params.toString()}`);
  };

  return (
    <div className="flex gap-1">
      {OPTIONS.map(({ label, value }) => (
        <button
          key={label}
          onClick={() => handleSelect(value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            active === value
              ? "bg-space-indigo-600 text-white"
              : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
