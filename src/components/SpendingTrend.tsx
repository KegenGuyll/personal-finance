"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import type { TrendPoint } from "@/src/hooks/useSpendingTrend";
import type { TrendGranularity } from "@/src/lib/stats-pipeline";
import { formatCurrency } from "@/src/utils/currency";
import { formatDate, formatMonth } from "@/src/utils/date";
import { CHART_COLORS } from "@/src/utils/chart-colors";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getDaysInMonth } from "@/src/lib/month-utils";

interface ChartData {
  // "YYYY-MM-DD" for daily points, "YYYY-MM" for monthly buckets.
  date: string;
  amount: number;
  name: string;
  average: number;
  limit: number;
}

const GRANULARITY_LABELS = {
  daily: {
    unit: "day",
    series: "Daily Spending",
    average: "Avg Daily Spend",
    limit: "Daily Limit",
  },
  monthly: {
    unit: "month",
    series: "Monthly Spending",
    average: "Avg Monthly Spend",
    limit: "Monthly Limit",
  },
} as const;

function tickFormatterFor(granularity: TrendGranularity) {
  if (granularity === "monthly") {
    return (monthKey: string) => {
      const d = new Date(`${monthKey}-01T12:00:00`);
      return d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
    };
  }
  return (d: string) => {
    const [, m, day] = d.split("-");
    return `${m}/${day}`;
  };
}

function CustomTooltip({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: readonly {
    payload?: ChartData;
    name?: string | number;
    value?: number | string | readonly (string | number)[];
  }[];
  granularity: TrendGranularity;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  if (!data) return null;

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white px-3 py-2 shadow-sm">
      {data.name && (
        <p className="text-xs font-medium text-space-indigo-800">
          {data.name}
        </p>
      )}
      <p className="text-xs text-space-indigo-400">
        {granularity === "monthly" ? formatMonth(data.date) : formatDate(data.date)}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold text-space-indigo-600">
          {formatCurrency(
            typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0)
          )}
          <span className="ml-1 text-xs font-normal text-space-indigo-400">
            {entry.name}
          </span>
        </p>
      ))}
    </div>
  );
}

function ClickableActiveDot({
  cx,
  cy,
  payload,
  onPointClick,
}: {
  cx?: number;
  cy?: number;
  payload?: ChartData;
  onPointClick: (date: string) => void;
}) {
  const handleClick = (e: ReactMouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    if (payload) onPointClick(payload.date);
  };

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={CHART_COLORS[0]}
      stroke="#fff"
      strokeWidth={2}
      className="cursor-pointer"
      onClick={handleClick}
    />
  );
}

export default function SpendingTrend({
  transactions,
  points,
  className = "mt-4",
  onPointClick,
  dailyLimit,
  granularity = "daily",
}: {
  transactions?: Transaction[];
  points?: TrendPoint[];
  className?: string;
  onPointClick?: (date: string) => void;
  dailyLimit?: number;
  granularity?: TrendGranularity;
}) {
  const grouped = new Map<string, { amount: number; name: string }>();

  if (points) {
    for (const p of points) {
      grouped.set(p.date, { amount: p.total, name: "" });
    }
  } else if (transactions) {
    for (const t of transactions) {
      const existing = grouped.get(t.date);
      if (existing) {
        existing.amount += t.amount;
      } else {
        grouped.set(t.date, { amount: t.amount, name: t.name });
      }
    }
  }

  const data: ChartData[] = [...grouped.entries()]
    .map(([date, { amount, name }]) => ({ date, amount, name, average: 0, limit: 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (data.length < 2) return null;

  const labels = GRANULARITY_LABELS[granularity];
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const average = total / data.length;
  const limitActive = !!dailyLimit && dailyLimit > 0;

  // In monthly view each bucket is limited by its own day count, so a
  // per-day budget scales to 930 for a 31-day month but 900 for a 30-day one.
  const chartData = data.map((d) => ({
    ...d,
    average,
    limit:
      limitActive && granularity === "monthly"
        ? dailyLimit * getDaysInMonth(d.date)
        : dailyLimit ?? 0,
  }));

  return (
    <div
      className={`rounded-lg border border-space-indigo-100 bg-white p-4 ${className}`}
    >
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
        Spending Trend
      </h3>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-space-indigo-400">
          {formatCurrency(total)} across {data.length} {labels.unit}
          {data.length > 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-space-indigo-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[0] }}
            />
            {labels.series}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-space-indigo-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[9] }}
            />
            {labels.average}
          </span>
          {limitActive && (
            <span
              className="flex items-center gap-1.5 text-xs"
              style={{ color: CHART_COLORS[8] }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: CHART_COLORS[8] }}
              />
              {labels.limit}
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#243075" }}
            tickFormatter={tickFormatterFor(granularity)}
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
          <Tooltip content={<CustomTooltip granularity={granularity} />} />
          <Line
            type="monotone"
            dataKey="amount"
            name={labels.series}
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ fill: CHART_COLORS[0], strokeWidth: 0, r: 3 }}
            activeDot={
              onPointClick
                ? (props) => (
                    <ClickableActiveDot
                      cx={props.cx}
                      cy={props.cy}
                      payload={props.payload}
                      onPointClick={onPointClick}
                    />
                  )
                : { fill: CHART_COLORS[0], stroke: "#fff", strokeWidth: 2, r: 5 }
            }
          />
          <Line
            type="monotone"
            dataKey="average"
            name={labels.average}
            stroke={CHART_COLORS[9]}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
          />
          {limitActive && (
            <Line
              type="monotone"
              dataKey="limit"
              name={labels.limit}
              stroke={CHART_COLORS[8]}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
