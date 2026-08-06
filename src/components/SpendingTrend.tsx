"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { Transaction } from "@/src/features/plaid/plaidSlice";
import type { TrendPoint } from "@/src/hooks/useSpendingTrend";
import { formatCurrency } from "@/src/utils/currency";
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
  average: number;
  dailyLimit: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly {
    payload?: ChartData;
    name?: string | number;
    value?: number | string | readonly (string | number)[];
  }[];
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
      <p className="text-xs text-space-indigo-400">{formatDate(data.date)}</p>
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
}: {
  transactions?: Transaction[];
  points?: TrendPoint[];
  className?: string;
  onPointClick?: (date: string) => void;
  dailyLimit?: number;
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
    .map(([date, { amount, name }]) => ({ date, amount, name, average: 0, dailyLimit: 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (data.length < 2) return null;

  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const average = total / data.length;
  const chartData = data.map((d) => ({ ...d, average, dailyLimit: dailyLimit ?? 0 }));

  return (
    <div
      className={`rounded-lg border border-space-indigo-100 bg-white p-4 ${className}`}
    >
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
        Spending Trend
      </h3>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-space-indigo-400">
          {formatCurrency(total)} across {data.length} day
          {data.length > 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-space-indigo-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[0] }}
            />
            Daily Spending
          </span>
          <span className="flex items-center gap-1.5 text-xs text-space-indigo-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[9] }}
            />
            Avg Daily Spend
          </span>
          {dailyLimit && dailyLimit > 0 && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#f97316" }}>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "#f97316" }}
              />
              Daily Limit
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
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
            name="Daily Spending"
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
            name="Average Daily Spend"
            stroke={CHART_COLORS[9]}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
          />
          {dailyLimit && dailyLimit > 0 && (
            <Line
              type="monotone"
              dataKey="dailyLimit"
              name="Daily Limit"
              stroke="#f97316"
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
