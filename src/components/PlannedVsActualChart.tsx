"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/src/utils/currency";
import { CHART_COLORS } from "@/src/utils/chart-colors";

export interface PlannedActualEntry {
  name: string;
  planned: number;
  actual: number;
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
      <p className="text-xs font-medium text-space-indigo-800">{String(label)}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold text-space-indigo-600">
          {String(entry.name)}:{" "}
          {formatCurrency(typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

export default function PlannedVsActualChart({
  entries,
  anchorMonthLabel,
  className = "",
}: {
  entries: PlannedActualEntry[];
  anchorMonthLabel: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className={`rounded-lg border border-space-indigo-100 bg-white p-4 ${className}`}>
        <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
          Planned vs Actual
        </h3>
        <p className="text-xs text-space-indigo-400">
          No budget categories available for {anchorMonthLabel}.
        </p>
      </div>
    );
  }

  const plannedColor = CHART_COLORS[0];
  const actualColor = CHART_COLORS[6];

  return (
    <div className={`rounded-lg border border-space-indigo-100 bg-white p-4 ${className}`}>
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">Planned vs Actual</h3>
      <p className="mb-3 text-xs text-space-indigo-400">
        {anchorMonthLabel} · planned budget vs actual spend
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={entries} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e9f7" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#243075" }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#243075" }}
            tickFormatter={(v: number) => formatAxisAmount(v)}
            tickLine={false}
            axisLine={false}
            width={52}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#243075" }}
            formatter={(value) => <span className="text-space-indigo-600">{value}</span>}
          />
          <Bar dataKey="planned" name="Planned" fill={plannedColor} radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name="Actual" fill={actualColor} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
