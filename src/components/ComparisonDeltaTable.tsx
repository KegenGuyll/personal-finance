"use client";

import { formatCurrency } from "@/src/utils/currency";

export interface CategoryDelta {
  category: string;
  groupName: string;
  groupId: string;
  latestPlanned: number;
  latestActual: number;
  prevActual: number;
  delta: number;
  pctChange: number | null;
  plannedAtAnchor: number;
  isVisible: boolean;
}

function TrendCell({ delta, pctChange }: { delta: number; pctChange: number | null }) {
  if (delta === 0) {
    return <span className="text-space-indigo-400">—</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${
        up ? "text-red-500" : "text-emerald-600"
      }`}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {formatCurrency(Math.abs(delta))}
      {pctChange !== null && (
        <span className={`text-[11px] ${up ? "text-red-400" : "text-emerald-500"}`}>
          ({up ? "+" : "-"}
          {Math.abs(pctChange).toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

export default function ComparisonDeltaTable({
  rows,
  anchorMonthLabel,
  onEdit,
}: {
  rows: CategoryDelta[];
  anchorMonthLabel: string;
  onEdit: (row: CategoryDelta) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-space-indigo-100 bg-white p-4">
        <h3 className="mb-1 text-sm font-medium text-space-indigo-600">
          Category Changes
        </h3>
        <p className="text-xs text-space-indigo-400">
          No budget categories to compare yet.
        </p>
      </div>
    );
  }

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
      <p className="mb-3 text-xs text-space-indigo-400">
        Latest vs previous month · {anchorMonthLabel}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-space-indigo-100 text-[10px] uppercase tracking-wide text-space-indigo-400">
              <th className="sticky left-0 bg-white pr-3 py-2 font-semibold">
                Category
              </th>
              <th className="px-2 py-2 font-semibold">Planned</th>
              <th className="px-2 py-2 font-semibold">Actual</th>
              <th className="px-2 py-2 font-semibold">Δ vs prev</th>
              <th className="px-2 py-2 text-right font-semibold">Edit</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map(({ groupName, rows: groupRows }) => (
              <GroupRow
                key={groupName}
                groupName={groupName}
                rows={groupRows}
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
  onEdit,
}: {
  groupName: string;
  rows: CategoryDelta[];
  onEdit: (row: CategoryDelta) => void;
}) {
  return (
    <>
      <tr className="border-b border-space-indigo-50">
        <td colSpan={5} className="sticky left-0 bg-space-indigo-50/60 px-3 py-1.5 font-semibold uppercase tracking-wide text-space-indigo-500">
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
            {formatCurrency(row.latestPlanned)}
          </td>
          <td className="px-2 py-2.5 font-semibold text-space-indigo-900">
            {formatCurrency(row.latestActual)}
          </td>
          <td className="px-2 py-2.5">
            <TrendCell delta={row.delta} pctChange={row.pctChange} />
          </td>
          <td className="px-2 py-2.5 text-right">
            <button
              type="button"
              onClick={() => onEdit(row)}
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
