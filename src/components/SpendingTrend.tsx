"use client";

import type { Transaction } from "@/src/features/plaid/plaidSlice";
import { formatDate } from "@/src/utils/date";
import { CHART_COLORS } from "@/src/utils/chart-colors";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartData {
  date: string;
  amount: number;
  name: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartData }[];
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  if (!data) return null;

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-space-indigo-800">
        {data.name}
      </p>
      <p className="text-xs text-space-indigo-400">{formatDate(data.date)}</p>
      <p className="text-sm font-semibold text-space-indigo-600">
        ${data.amount.toFixed(2)}
      </p>
    </div>
  );
}

export default function SpendingTrend({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const grouped = new Map<string, { amount: number; name: string }>();
  for (const t of transactions) {
    const existing = grouped.get(t.date);
    if (existing) {
      existing.amount += Math.abs(t.amount);
    } else {
      grouped.set(t.date, { amount: Math.abs(t.amount), name: t.name });
    }
  }

  const data: ChartData[] = [...grouped.entries()]
    .map(([date, { amount, name }]) => ({ date, amount, name }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (data.length < 2) return null;

  return (
    <div className="mt-4 rounded-lg border border-space-indigo-100 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-space-indigo-600">
        Spending Trend
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#243075" }}
            tickFormatter={(d: string) => {
              const [, m, day] = d.split("-");
              return `${m}/${day}`;
            }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#243075" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
            }
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, "auto"]}
            allowDecimals={false}
          />
          <Tooltip content={CustomTooltip} />
          <Line
            type="monotone"
            dataKey="amount"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ fill: CHART_COLORS[0], strokeWidth: 0, r: 3 }}
            activeDot={{ fill: CHART_COLORS[0], stroke: "#fff", strokeWidth: 2, r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
