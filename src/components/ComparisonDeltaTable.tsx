"use client";

import { formatCurrency } from "@/src/utils/currency";

export type Direction = "up" | "down" | "stable" | "none";

export interface CategoryDelta {
  category: string;
  groupName: string;
  groupId: string;
  plannedAtAnchor: number;
  actualAtAnchor: number;
  prevActual: number | null;
  firstActual: number;
  projected: number;
  direction: Direction;
  limited: boolean;
  isVisible: boolean;
}

function formatMonthLong(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function DeltaCell({ current, baseline }: { current: number; baseline: number | null }) {
  if (baseline === null) {
    return <span className="text-space-indigo-400">—</span>;
  }
  const delta = current - baseline;
  if (delta === 0) {
    return <span className="text-space-indigo-400">—</span>;
  }
  const up = delta > 0;
  const pct = baseline !== 0 ? Math.abs((delta / baseline) * 100) : null;
  const colorClass = up ? "text-red-500" : "text-emerald-600";
  const subClass = up ? "text-red-400" : "text-emerald-500";
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${colorClass}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {formatCurrency(Math.abs(delta))}
      {pct !== null ? (
        <span className={`text-[11px] ${subClass}`}>
          ({up ? "+" : "-"}
          {pct.toFixed(1)}%)
        </span>
      ) : (
        <span className={`text-[11px] ${subClass}`}>(new)</span>
      )}
    </span>
  );
}

function DirectionTag({ direction }: { direction: Direction }) {
  if (direction === "up") {
    return (
      <span className="text-[10px] font-bold text-red-500" aria-label="Trending up">
        ▲
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="text-[10px] font-bold text-emerald-600" aria-label="Trending down">
        ▼
      </span>
    );
  }
  if (direction === "stable") {
    return (
      <span className="text-[10px] text-space-indigo-400" aria-label="Stable">
        ≈
      </span>
    );
  }
  return <span className="text-[10px] text-space-indigo-300">—</span>;
}

export default function ComparisonDeltaTable({
  rows,
  anchorMonth,
  prevMonth,
  firstMonth,
  nextMonth,
  onEdit,
}: {
  rows: CategoryDelta[];
  anchorMonth: string;
  prevMonth: string | null;
  firstMonth: string;
  nextMonth: string;
  onEdit: (row: CategoryDelta) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-space-indigo-100 bg-white p-4">
        <h3 className="mb-1 text-sm font-medium text-space-indigo-600">Category Changes</h3>
        <p className="text-xs text-space-indigo-400">
          No budgeted categories to compare in this window.
        </p>
      </div>
    );
  }

  const anchorShort = formatMonthShort(anchorMonth);
  const prevLong = prevMonth ? formatMonthLong(prevMonth) : null;
  const anchorLong = formatMonthLong(anchorMonth);
  const firstLong = formatMonthLong(firstMonth);
  const subtitle = prevLong
    ? `Actual spend in ${anchorLong} vs ${prevLong}, and vs ${firstLong}.`
    : `Actual spend in ${anchorLong} — this is the first month in the window, so there is no earlier month to compare.`;

  const groupedRows: { groupName: string; rows: CategoryDelta[] }[] = [];
  const byGroup = new Map<string, CategoryDelta[]>();
  for (const row of rows) {
    if (!byGroup.has(row.groupName)) byGroup.set(row.groupName, []);
    byGroup.get(row.groupName)!.push(row);
  }
  for (const [groupName, groupRows] of byGroup) {
    groupedRows.push({ groupName, rows: groupRows });
  }

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-space-indigo-600">Category Changes</h3>
      <p className="text-xs text-space-indigo-400">{subtitle}</p>
      <p className="mt-1 text-[11px] text-space-indigo-400">
        ▲ spending up · ▼ spending down · Projected = estimated next-month spend
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-space-indigo-100 text-[10px] uppercase tracking-wide text-space-indigo-400">
              <th className="sticky left-0 bg-white pr-3 py-2 font-semibold">
                Category
              </th>
              <th className="px-2 py-2 font-semibold">
                <span className="block">Planned</span>
                <span className="block text-[9px] font-medium text-space-indigo-400">
                  {anchorShort}
                </span>
              </th>
              <th className="px-2 py-2 font-semibold">
                <span className="block">Actual</span>
                <span className="block text-[9px] font-medium text-space-indigo-400">
                  {anchorShort}
                </span>
              </th>
              <th className="px-2 py-2 font-semibold">
                <span className="block">Δ vs</span>
                <span className="block text-[9px] font-medium text-space-indigo-400">
                  {prevMonth ? formatMonthShort(prevMonth) : "—"}
                </span>
              </th>
              <th className="px-2 py-2 font-semibold">
                <span className="block">Δ vs</span>
                <span className="block text-[9px] font-medium text-space-indigo-400">
                  {formatMonthShort(firstMonth)}
                </span>
              </th>
              <th className="px-2 py-2 font-semibold">
                <span className="block">Projected</span>
                <span className="block text-[9px] font-medium text-space-indigo-400">
                  {formatMonthShort(nextMonth)}
                </span>
              </th>
              <th className="px-2 py-2 text-right font-semibold">Edit</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map(({ groupName, rows: groupRows }) => (
              <GroupRow
                key={groupName}
                groupName={groupName}
                rows={groupRows}
                anchorShort={anchorShort}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRow({
  groupName,
  rows,
  anchorShort,
  onEdit,
}: {
  groupName: string;
  rows: CategoryDelta[];
  anchorShort: string;
  onEdit: (row: CategoryDelta) => void;
}) {
  return (
    <>
      <tr className="border-b border-space-indigo-50">
        <td
          colSpan={7}
          className="sticky left-0 bg-space-indigo-50/60 px-3 py-1.5 font-semibold uppercase tracking-wide text-space-indigo-500"
        >
          {groupName}
        </td>
      </tr>
      {rows.map((row) => (
        <tr
          key={row.category}
          className={`border-b border-space-indigo-50 transition-colors hover:bg-space-indigo-50/40 ${
            row.isVisible ? "" : "opacity-50"
          }`}
        >
          <td className="sticky left-0 bg-white px-3 py-2.5 font-semibold text-space-indigo-800 whitespace-nowrap">
            {row.category}
          </td>
          <td className="px-2 py-2.5 text-space-indigo-700">
            {formatCurrency(row.plannedAtAnchor)}
          </td>
          <td className="px-2 py-2.5 font-semibold text-space-indigo-900">
            {formatCurrency(row.actualAtAnchor)}
          </td>
          <td className="px-2 py-2.5">
            <DeltaCell current={row.actualAtAnchor} baseline={row.prevActual} />
          </td>
          <td className="px-2 py-2.5">
            <DeltaCell current={row.actualAtAnchor} baseline={row.firstActual} />
          </td>
          <td className="px-2 py-2.5">
            <span className="inline-flex items-center gap-1.5">
              <DirectionTag direction={row.direction} />
              <span className="font-semibold text-space-indigo-900">
                {row.projected > 0 ? formatCurrency(row.projected) : "—"}
              </span>
            </span>
            {row.limited && (
              <span className="mt-0.5 block text-[9px] font-medium text-space-indigo-400">
                limited data
              </span>
            )}
          </td>
          <td className="px-2 py-2.5 text-right">
            <button
              type="button"
              onClick={() => onEdit(row)}
              title={`Edit budget for ${anchorShort}`}
              className="rounded-md bg-space-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-space-indigo-700 active:bg-space-indigo-800"
            >
              Edit
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
