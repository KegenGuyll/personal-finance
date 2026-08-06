"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/src/lib/hooks";
import {
  setCategoryMappingsFilterGroup,
  setCategoryMappingsSearch,
  setCategoryMappingsShowUnmapped,
} from "@/src/features/ui/uiSlice";
import { useCategoryMappings, useUpdateCategoryMappings, useDeleteCategoryMapping } from "@/src/hooks/useCategoryMappings";
import type { CategoryMapping } from "@/src/types/budget";

interface CategoryMappingsManagerProps {
  onClose: () => void;
  month?: string;
}

const GROUP_NAMES = ["Needs", "Savings", "Wants"];

export default function CategoryMappingsManager({ onClose, month }: CategoryMappingsManagerProps) {
  const { data, isLoading } = useCategoryMappings(month);
  const updateMappings = useUpdateCategoryMappings();
  const deleteMapping = useDeleteCategoryMapping();
  const dispatch = useAppDispatch();

  const filterGroup = useAppSelector((state) => state.ui.categoryMappingsFilterGroup);
  const search = useAppSelector((state) => state.ui.categoryMappingsSearch);
  const showUnmappedOnly = useAppSelector((state) => state.ui.categoryMappingsShowUnmapped);

  const [editingLeaf, setEditingLeaf] = useState<string | null>(null);
  const [editBudgetCat, setEditBudgetCat] = useState("");
  const [editGroup, setEditGroup] = useState("");

  const [newMapping, setNewMapping] = useState({
    plaidLeafCategory: "",
    budgetCategory: "",
    groupName: "Wants",
  });

  const mappings = data?.mappings ?? [];
  const unmapped = data?.unmapped ?? [];

  let displayedMappings: CategoryMapping[] = mappings;
  if (filterGroup) {
    displayedMappings = displayedMappings.filter((m) => m.groupName === filterGroup);
  } else if (showUnmappedOnly) {
    displayedMappings = [];
  }
  if (search.trim()) {
    const term = search.toLowerCase();
    displayedMappings = displayedMappings.filter(
      (m) =>
        m.plaidLeafCategory.toLowerCase().includes(term) ||
        m.budgetCategory.toLowerCase().includes(term)
    );
  }

  function startEdit(mapping: CategoryMapping) {
    setEditingLeaf(mapping.plaidLeafCategory);
    setEditBudgetCat(mapping.budgetCategory);
    setEditGroup(mapping.groupName);
  }

  function saveEdit() {
    if (!editingLeaf) return;
    updateMappings.mutate({
      mappings: [
        {
          plaidLeafCategory: editingLeaf,
          budgetCategory: editBudgetCat.trim() || editingLeaf,
          groupName: editGroup,
        },
      ],
    });
    setEditingLeaf(null);
  }

  function handleCreate() {
    if (!newMapping.plaidLeafCategory.trim()) return;
    updateMappings.mutate({
      mappings: [
        {
          plaidLeafCategory: newMapping.plaidLeafCategory.trim(),
          budgetCategory: newMapping.budgetCategory.trim() || newMapping.plaidLeafCategory.trim(),
          groupName: newMapping.groupName,
        },
      ],
    });
    setNewMapping({ plaidLeafCategory: "", budgetCategory: "", groupName: "Wants" });
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-space-indigo-100 bg-white p-6">
        <p className="text-sm text-space-indigo-400">Loading mappings...</p>
      </div>
    );
  }

  const dateRangeQuery = month
    ? (() => {
        const [y, m] = month.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        return `&startDate=${month}-01&endDate=${month}-${String(lastDay).padStart(2, "0")}`;
      })()
    : "";

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-space-indigo-800">
          Category Mappings ({mappings.length})
        </h3>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
        >
          Close
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {GROUP_NAMES.map((name) => {
          const isActive = filterGroup === name;
          const count = mappings.filter((m) => m.groupName === name).length;
          return (
            <button
              key={name}
              onClick={() => {
                dispatch(setCategoryMappingsFilterGroup(isActive ? null : name));
                dispatch(setCategoryMappingsShowUnmapped(false));
              }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-space-indigo-600 text-white"
                  : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
              }`}
            >
              {name}: {count}
            </button>
          );
        })}
        <button
          onClick={() => {
            dispatch(setCategoryMappingsShowUnmapped(!showUnmappedOnly));
            dispatch(setCategoryMappingsFilterGroup(null));
          }}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            showUnmappedOnly
              ? "bg-cornflower-blue-500 text-white"
              : "bg-cornflower-blue-50 text-cornflower-blue-600 hover:bg-cornflower-blue-100"
          }`}
        >
          Unmapped: {unmapped.length}
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => dispatch(setCategoryMappingsSearch(e.target.value))}
          placeholder="Search mappings..."
          className="w-full rounded-md border border-space-indigo-200 px-2 py-1.5 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
        />
      </div>

      <div className="border-t border-space-indigo-50 pt-3">
        <div className="mb-2 flex items-end gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-space-indigo-400">
              Plaid leaf category
            </label>
            <input
              type="text"
              value={newMapping.plaidLeafCategory}
              onChange={(e) => setNewMapping((p) => ({ ...p, plaidLeafCategory: e.target.value }))}
              placeholder="e.g. Fast Food"
              className="w-44 rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-space-indigo-400">
              Budget category
            </label>
            <input
              type="text"
              value={newMapping.budgetCategory}
              onChange={(e) => setNewMapping((p) => ({ ...p, budgetCategory: e.target.value }))}
              placeholder="e.g. Dining Out"
              className="w-44 rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-space-indigo-400">
              Group
            </label>
            <select
              value={newMapping.groupName}
              onChange={(e) => setNewMapping((p) => ({ ...p, groupName: e.target.value }))}
              className="rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            >
              {GROUP_NAMES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newMapping.plaidLeafCategory.trim() || updateMappings.isPending}
            className="rounded-md bg-space-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {showUnmappedOnly && unmapped.length === 0 && !filterGroup && (
          <p className="py-4 text-center text-xs text-space-indigo-300">
            All categories are mapped
          </p>
        )}

        {showUnmappedOnly && unmapped
          .filter((u) => !search.trim() || u.leaf.toLowerCase().includes(search.toLowerCase()))
          .map((u) => (
          <div
            key={u.leaf}
            className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-cornflower-blue-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-space-indigo-700">{u.leaf}</span>
              <span className="text-[10px] text-space-indigo-400">{u.count} txns</span>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={`/transactions?category=${encodeURIComponent(u.leaf)}${dateRangeQuery}`}
                className="rounded px-2 py-0.5 text-[10px] font-medium text-space-indigo-400 transition-colors hover:bg-space-indigo-100 hover:text-space-indigo-600"
              >
                View
              </Link>
              <button
                onClick={() => {
                  setNewMapping({
                    plaidLeafCategory: u.leaf,
                    budgetCategory: u.leaf,
                    groupName: "Wants",
                  });
                  dispatch(setCategoryMappingsShowUnmapped(false));
                }}
                className="rounded px-2 py-0.5 text-[10px] font-medium text-cornflower-blue-600 transition-colors hover:bg-cornflower-blue-100"
              >
                Map
              </button>
            </div>
          </div>
        ))}

        {displayedMappings.map((mapping) => (
          <div
            key={mapping._id || mapping.plaidLeafCategory}
            className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-space-indigo-50"
          >
            {editingLeaf === mapping.plaidLeafCategory ? (
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-space-indigo-400">{mapping.plaidLeafCategory}</span>
                <span className="text-xs text-space-indigo-300">→</span>
                <input
                  value={editBudgetCat}
                  onChange={(e) => setEditBudgetCat(e.target.value)}
                  className="w-36 rounded border border-space-indigo-200 px-1.5 py-0.5 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                />
                <select
                  value={editGroup}
                  onChange={(e) => setEditGroup(e.target.value)}
                  className="rounded border border-space-indigo-200 px-1.5 py-0.5 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
                >
                  {GROUP_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  onClick={saveEdit}
                  disabled={updateMappings.isPending}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-100"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingLeaf(null)}
                  className="rounded px-2 py-0.5 text-[10px] text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-space-indigo-400">
                    {mapping.plaidLeafCategory}
                  </span>
                  {mapping.budgetCategory !== mapping.plaidLeafCategory && (
                    <>
                      <span className="text-[10px] text-space-indigo-300">→</span>
                      <span className="text-xs text-space-indigo-700">
                        {mapping.budgetCategory}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(mapping)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-space-indigo-400 transition-colors hover:bg-space-indigo-100 hover:text-space-indigo-600"
                  >
                    {mapping.groupName}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove mapping for "${mapping.plaidLeafCategory}"?`)) {
                        deleteMapping.mutate(mapping.plaidLeafCategory);
                      }
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    &times;
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
