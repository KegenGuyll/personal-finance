"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { NameStat } from "@/src/hooks/useCategoryNameStats";
import { formatCurrency } from "@/src/utils/currency";
import { CHART_COLORS as COLORS } from "@/src/utils/chart-colors";

interface ChartEntry extends NameStat {
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
      <p className="max-w-60 truncate text-xs font-medium text-space-indigo-800">
        {data.name}
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

export default function CategoryNameBreakdown({
  names,
  grandTotal,
}: {
  names: NameStat[];
  grandTotal: number;
}) {
  if (names.length === 0) return null;

  const data = names.slice(0, 12);
  const otherTotal = names.slice(12).reduce((sum, n) => sum + n.total, 0);

  if (otherTotal > 0) {
    data.push({
      name: "Other",
      total: otherTotal,
      count: names.slice(12).reduce((sum, n) => sum + n.count, 0),
    });
  }

  const enrichedData = data.map((d) => ({
    ...d,
    grandTotal,
  }));

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
        Transaction Breakdown
      </h3>
      <p className="mb-3 text-xs text-space-indigo-400">
        {formatCurrency(grandTotal)} across {names.length} transaction
        {names.length > 1 ? "s" : ""}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={enrichedData}
            dataKey="total"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={48}
          >
            {enrichedData.map((entry, i) => (
              <Cell
                key={i}
                fill={COLORS[i % COLORS.length]}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
