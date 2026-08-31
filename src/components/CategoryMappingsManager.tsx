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
      <div className="rounded-xl border border-space-indigo-100 bg-white p-4 sm:p-6">
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
    <div className="rounded-xl border border-space-indigo-100 bg-white p-3.5 shadow-sm sm:p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-space-indigo-800">
            Category Mappings
          </h3>
          <p className="text-[11px] text-space-indigo-400">
            Map Plaid transaction categories to your budget groups
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-space-indigo-200 px-2.5 py-1 text-xs font-semibold text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
        >
          Close
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
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
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-space-indigo-600 text-white shadow-2xs"
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
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
            showUnmappedOnly
              ? "bg-cornflower-blue-500 text-white shadow-2xs"
              : "bg-cornflower-blue-50 text-cornflower-blue-600 hover:bg-cornflower-blue-100"
          }`}
        >
          Unmapped: {unmapped.length}
        </button>
      </div>

      {/* Search Filter */}
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => dispatch(setCategoryMappingsSearch(e.target.value))}
          placeholder="Search categories or mappings..."
          className="w-full rounded-lg border border-space-indigo-200 bg-space-indigo-50/40 px-3 py-1.5 text-xs text-space-indigo-800 placeholder-space-indigo-400 focus:border-space-indigo-400 focus:bg-white focus:outline-none"
        />
      </div>

      {/* Add New Mapping Form - Responsive Grid */}
      <div className="mb-3 rounded-lg border border-space-indigo-100 bg-space-indigo-50/50 p-2.5">
        <p className="mb-2 text-[11px] font-semibold text-space-indigo-700">Add New Mapping</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-space-indigo-500">
              Plaid Leaf Category
            </label>
            <input
              type="text"
              value={newMapping.plaidLeafCategory}
              onChange={(e) => setNewMapping((p) => ({ ...p, plaidLeafCategory: e.target.value }))}
              placeholder="e.g. Fast Food"
              className="w-full rounded-md border border-space-indigo-200 bg-white px-2.5 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-space-indigo-500">
              Budget Category Name
            </label>
            <input
              type="text"
              value={newMapping.budgetCategory}
              onChange={(e) => setNewMapping((p) => ({ ...p, budgetCategory: e.target.value }))}
              placeholder="e.g. Dining Out"
              className="w-full rounded-md border border-space-indigo-200 bg-white px-2.5 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-space-indigo-500">
              Envelope Group
            </label>
            <div className="flex gap-1.5">
              <select
                value={newMapping.groupName}
                onChange={(e) => setNewMapping((p) => ({ ...p, groupName: e.target.value }))}
                className="flex-1 rounded-md border border-space-indigo-200 bg-white px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
              >
                {GROUP_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newMapping.plaidLeafCategory.trim() || updateMappings.isPending}
                className="rounded-md bg-space-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mappings / Unmapped List */}
      <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {showUnmappedOnly && unmapped.length === 0 && !filterGroup && (
          <p className="py-6 text-center text-xs text-space-indigo-300">
            All categories are mapped
          </p>
        )}

        {showUnmappedOnly && unmapped
          .filter((u) => !search.trim() || u.leaf.toLowerCase().includes(search.toLowerCase()))
          .map((u) => (
          <div
            key={u.leaf}
            className="flex items-center justify-between rounded-lg border border-cornflower-blue-100 bg-cornflower-blue-50/40 px-2.5 py-1.5 hover:bg-cornflower-blue-50"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium text-space-indigo-800">{u.leaf}</span>
              <span className="shrink-0 text-[10px] text-space-indigo-400">({u.count} txns)</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href={`/transactions?category=${encodeURIComponent(u.leaf)}${dateRangeQuery}`}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-space-indigo-500 underline-offset-2 hover:text-space-indigo-700 hover:underline"
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
                className="rounded bg-cornflower-blue-100 px-2 py-0.5 text-[11px] font-semibold text-cornflower-blue-700 transition-colors hover:bg-cornflower-blue-200"
              >
                Map
              </button>
            </div>
          </div>
        ))}

        {displayedMappings.map((mapping) => (
          <div
            key={mapping._id || mapping.plaidLeafCategory}
            className="rounded-lg border border-space-indigo-50 bg-white p-2 transition-colors hover:bg-space-indigo-50/40"
          >
            {editingLeaf === mapping.plaidLeafCategory ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] text-space-indigo-400">Plaid Category</span>
                  <span className="truncate text-xs font-semibold text-space-indigo-800">{mapping.plaidLeafCategory}</span>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  <input
                    value={editBudgetCat}
                    onChange={(e) => setEditBudgetCat(e.target.value)}
                    placeholder="Budget Category"
                    className="flex-1 min-w-[120px] rounded border border-space-indigo-200 bg-white px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                  />
                  <select
                    value={editGroup}
                    onChange={(e) => setEditGroup(e.target.value)}
                    className="rounded border border-space-indigo-200 bg-white px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
                  >
                    {GROUP_NAMES.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <button
                    onClick={saveEdit}
                    disabled={updateMappings.isPending}
                    className="rounded bg-space-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-space-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingLeaf(null)}
                    className="rounded px-2 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span className="truncate font-medium text-space-indigo-500">
                    {mapping.plaidLeafCategory}
                  </span>
                  {mapping.budgetCategory !== mapping.plaidLeafCategory && (
                    <>
                      <span className="text-[10px] text-space-indigo-300">→</span>
                      <span className="truncate font-semibold text-space-indigo-800">
                        {mapping.budgetCategory}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => startEdit(mapping)}
                    className="rounded-full bg-space-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-space-indigo-700 transition-colors hover:bg-space-indigo-100"
                    title="Click to change group or name"
                  >
                    {mapping.groupName}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove mapping for "${mapping.plaidLeafCategory}"?`)) {
                        deleteMapping.mutate(mapping.plaidLeafCategory);
                      }
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-xs text-space-indigo-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete mapping for ${mapping.plaidLeafCategory}`}
                  >
                    &times;
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
