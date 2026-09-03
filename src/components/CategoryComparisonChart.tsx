"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/src/utils/currency";

export interface CategorySeries {
  name: string;
  color: string;
  values: number[];
}

interface ChartRow {
  month: string;
  [key: string]: string | number;
}

function formatMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function formatAxisAmount(value: number): string {
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { name?: string | number; value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-space-indigo-800">
        {formatMonthShort(String(label))}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold text-space-indigo-600">
          {String(entry.name)}:{" "}
          {formatCurrency(typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

export default function CategoryComparisonChart({
  months,
  series,
  className = "",
}: {
  months: string[];
  series: CategorySeries[];
  className?: string;
}) {
  if (series.length === 0) {
    return (
      <div className={`rounded-lg border border-space-indigo-100 bg-white p-4 ${className}`}>
        <h3 className="mb-1 text-sm font-medium text-space-indigo-600">Spending Trend</h3>
        <p className="text-xs text-space-indigo-400">
          Select a category below to see its trend over time.
        </p>
      </div>
    );
  }

  const data: ChartRow[] = months.map((month, i) => {
    const row: ChartRow = { month };
    for (const s of series) {
      row[s.name] = s.values[i] ?? 0;
    }
    return row;
  });

  return (
    <div className={`rounded-lg border border-space-indigo-100 bg-white p-4 ${className}`}>
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">Spending Trend</h3>
      <p className="mb-3 text-xs text-space-indigo-400">
        Actual spend per category across selected months
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#243075" }}
            tickFormatter={(m: string) => formatMonthShort(m)}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#243075" }}
            tickFormatter={(v: number) => formatAxisAmount(v)}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, "auto"]}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ fill: s.color, strokeWidth: 0, r: 3 }}
              activeDot={{ fill: s.color, stroke: "#fff", strokeWidth: 2, r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-space-indigo-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
