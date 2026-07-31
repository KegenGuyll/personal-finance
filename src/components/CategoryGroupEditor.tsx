"use client";

import { useState, useMemo } from "react";
import { useBudgetGroups } from "@/src/hooks/useBudgetGroups";
import { useMutateBudgetGroups } from "@/src/hooks/useMutateBudgetGroups";
import type { BudgetGroup } from "@/src/types/budget";

interface CategoryGroupEditorProps {
  onClose: () => void;
}

export default function CategoryGroupEditor({ onClose }: CategoryGroupEditorProps) {
  const { data, isLoading } = useBudgetGroups();
  const mutateGroups = useMutateBudgetGroups();

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  const groups = data?.groups ?? [];

  const displayedCategories = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      if (filterGroup && g.name !== filterGroup) continue;
      for (const c of g.categories) set.add(c);
    }
    return [...set].sort();
  }, [groups, filterGroup]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-space-indigo-100 bg-white p-6">
        <p className="text-sm text-space-indigo-400">Loading groups...</p>
      </div>
    );
  }

  if (groups.length === 0) return null;

  function updateGroups(updatedGroups: BudgetGroup[]) {
    mutateGroups.mutate({
      groups: updatedGroups.map((g) => ({
        _id: g._id!,
        categories: g.categories,
      })),
    });
  }

  function moveCategory(category: string, fromGroupId: string, toGroupId: string) {
    const updatedGroups = groups.map((g) => {
      if (g._id === fromGroupId) {
        return { ...g, categories: g.categories.filter((c) => c !== category) };
      }
      if (g._id === toGroupId) {
        return { ...g, categories: [...g.categories, category] };
      }
      return g;
    });
    updateGroups(updatedGroups);
  }

  function removeCategory(category: string, fromGroupId: string) {
    const updatedGroups = groups.map((g) => {
      if (g._id === fromGroupId) {
        return { ...g, categories: g.categories.filter((c) => c !== category) };
      }
      return g;
    });
    updateGroups(updatedGroups);
  }

  function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    const targetGroup = filterGroup
      ? groups.find((g) => g.name === filterGroup)
      : groups[0];

    if (!targetGroup) return;

    if (targetGroup.categories.includes(name)) {
      setNewCategoryName("");
      return;
    }

    const updatedGroups = groups.map((g) => {
      if (g._id === targetGroup._id) {
        return { ...g, categories: [...g.categories, name] };
      }
      return g;
    });

    updateGroups(updatedGroups);
    setNewCategoryName("");
  }

  function getGroupForCategory(category: string): BudgetGroup | undefined {
    return groups.find((g) => g.categories.includes(category));
  }

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-space-indigo-800">
          Category Group Assignment
        </h3>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
        >
          Close
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {groups.map((group) => {
          const isActive = filterGroup === group.name;
          return (
            <button
              key={group._id}
              onClick={() => setFilterGroup(isActive ? null : group.name)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-space-indigo-600 text-white"
                  : "bg-space-indigo-50 text-space-indigo-600 hover:bg-space-indigo-100"
              }`}
            >
              {group.name}: {group.categories.length}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateCategory();
          }}
          placeholder="New category name..."
          className="flex-1 rounded-md border border-space-indigo-200 px-2 py-1 text-xs text-space-indigo-800 focus:border-space-indigo-400 focus:outline-none"
        />
        <button
          onClick={handleCreateCategory}
          disabled={!newCategoryName.trim()}
          className="rounded-md bg-space-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="grid max-h-72 gap-1 overflow-y-auto">
        {displayedCategories.length === 0 && (
          <p className="py-4 text-center text-xs text-space-indigo-300">
            {filterGroup
              ? `No categories in ${filterGroup}`
              : "No categories assigned"}
          </p>
        )}
        {displayedCategories.map((category) => {
          const currentGroup = getGroupForCategory(category);
          const isEditing = editingCategory === category;

          return (
            <div
              key={category}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-space-indigo-50"
            >
              <span className="text-xs text-space-indigo-700">{category}</span>
              {isEditing ? (
                <div className="flex gap-1">
                  {groups
                    .filter((g) => g._id !== currentGroup?._id)
                    .map((g) => (
                      <button
                        key={g._id}
                        onClick={() => {
                          moveCategory(category, currentGroup!._id!, g._id!);
                          setEditingCategory(null);
                        }}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-space-indigo-500 transition-colors hover:bg-space-indigo-100"
                      >
                        Move to {g.name}
                      </button>
                    ))}
                  <button
                    onClick={() => setEditingCategory(null)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-space-indigo-400 transition-colors hover:bg-space-indigo-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingCategory(category)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-space-indigo-400 transition-colors hover:bg-space-indigo-100 hover:text-space-indigo-600"
                  >
                    {currentGroup?.name ?? "Unassigned"}
                  </button>
                  {currentGroup && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${category}" from ${currentGroup.name}?`)) {
                          removeCategory(category, currentGroup._id!);
                        }
                      }}
                      className="rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      &times;
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
