"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { ReactNode } from "react";

interface BudgetRingChartProps {
  percent: number;
  color: string;
  trackColor?: string;
  children?: ReactNode;
}

export default function BudgetRingChart({
  percent,
  color,
  trackColor = "#d8dcf3",
  children,
}: BudgetRingChartProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={[
              { name: "progress", value: clamped },
              { name: "track", value: 100 - clamped },
            ]}
            dataKey="value"
            cx="50%"
            cy="50%"
            startAngle={90}
            endAngle={-270}
            innerRadius="78%"
            outerRadius="100%"
            cornerRadius={8}
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill={trackColor} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
