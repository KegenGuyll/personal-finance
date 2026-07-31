"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CategoryStat } from "@/src/hooks/useCategoryStats";
import { formatCurrency } from "@/src/utils/currency";
import { CHART_COLORS as COLORS } from "@/src/utils/chart-colors";

interface ChartEntry extends CategoryStat {
  grandTotal: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartEntry; value?: number }[];
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  const value = payload[0].value;
  if (!data || value === undefined) return null;

  const percentage = (value / data.grandTotal) * 100;

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-space-indigo-800">
        {data.category}
      </p>
      <p className="text-sm font-semibold text-space-indigo-600">
        {formatCurrency(data.total)}
      </p>
      <p className="text-xs text-space-indigo-400">
        {data.count} transaction{data.count > 1 ? "s" : ""} ·{" "}
        {percentage.toFixed(1)}%
      </p>
    </div>
  );
}

export default function CategoryBreakdown({
  categories,
  grandTotal,
  selectedCategory,
  onSelect,
}: {
  categories: CategoryStat[];
  grandTotal: number;
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}) {
  if (categories.length === 0) return null;

  const data = categories.slice(0, 12);
  const otherTotal = categories
    .slice(12)
    .reduce((sum, c) => sum + c.total, 0);

  if (otherTotal > 0) {
    data.push({
      category: "Other",
      total: otherTotal,
      count: categories.slice(12).reduce((sum, c) => sum + c.count, 0),
    });
  }

  const enrichedData = data.map((d) => ({
    ...d,
    grandTotal,
  }));

  const handleClick = (data: { payload?: ChartEntry }) => {
    const entry = data.payload;
    if (!entry || entry.category === "Other") return;
    if (entry.category === selectedCategory) {
      onSelect(null);
    } else {
      onSelect(entry.category);
    }
  };

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
        Category Breakdown
      </h3>
      <p className="mb-3 text-xs text-space-indigo-400">
        {formatCurrency(grandTotal)} across {categories.length} categor
        {categories.length > 1 ? "ies" : "y"}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={enrichedData}
            dataKey="total"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={48}
            onClick={handleClick}
            className="cursor-pointer"
          >
            {enrichedData.map((entry, i) => (
              <Cell
                key={i}
                fill={COLORS[i % COLORS.length]}
                stroke="none"
                opacity={
                  selectedCategory &&
                  entry.category !== selectedCategory
                    ? 0.35
                    : 1
                }
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
