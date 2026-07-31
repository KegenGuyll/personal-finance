"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCategories } from "@/src/hooks/useCategories";

interface CategoryEditorProps {
  transactionId: string;
  accountId: string;
  currentCategory: string[] | null;
  transactionName: string;
}

export default function CategoryEditor({
  transactionId,
  accountId,
  currentCategory,
  transactionName,
}: CategoryEditorProps) {
  const queryClient = useQueryClient();
  const { data } = useCategories();
  const memoCategories = useMemo(() => data?.categories ?? [], [data]);

  const currentValue = (currentCategory ?? []).join(" > ");

  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(currentValue);
  const [applyToAll, setApplyToAll] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    },
  });

  const handleOpen = () => {
    setInputValue(currentValue);
    setIsOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!inputValue.trim()) return memoCategories;
    const lower = inputValue.toLowerCase();
    return memoCategories.filter((c) => c.toLowerCase().includes(lower));
  }, [memoCategories, inputValue]);

  const handleSave = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const categoryArray = trimmed
      .split(">")
      .map((c) => c.trim())
      .filter(Boolean);

    if (categoryArray.length === 0) return;

    if (!memoCategories.includes(trimmed)) {
      await addCategory.mutateAsync(trimmed);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    }

    const res = await fetch(`/api/plaid/transactions/${transactionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: categoryArray, applyToAll }),
    });

    if (!res.ok) throw new Error("Failed to update");

    queryClient.invalidateQueries({ queryKey: ["transaction", transactionId] });
    queryClient.invalidateQueries({ queryKey: ["category-stats", accountId] });
    queryClient.invalidateQueries({
      queryKey: ["account-transactions", accountId],
    });

    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen) {
      if (e.key === "ArrowDown") {
        setDropdownOpen(true);
        setHighlightIndex(0);
        e.preventDefault();
      }
    } else {
      if (e.key === "ArrowDown") {
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0
        );
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1
        );
        e.preventDefault();
      } else if (e.key === "Enter") {
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          setInputValue(filtered[highlightIndex]);
        }
        setDropdownOpen(false);
        e.preventDefault();
      } else if (e.key === "Escape") {
        setDropdownOpen(false);
      }
    }
  };

  const isSaving = addCategory.isPending;

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-xs font-medium text-cornflower-blue-500 hover:text-cornflower-blue-600"
      >
        {currentValue ? "Edit category" : "Add category"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-md rounded-lg border border-space-indigo-100 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-space-indigo-800">
              Edit Category
            </h3>
            <p className="mt-1 text-sm text-space-indigo-400">
              {transactionName}
            </p>

            <label className="mt-4 block text-xs font-medium text-space-indigo-600">
              Category
            </label>
            <div className="relative mt-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setDropdownOpen(true);
                  setHighlightIndex(-1);
                }}
                onFocus={() => setDropdownOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder='e.g. "Food and Drink > Restaurants"'
                className="w-full rounded-lg border border-space-indigo-200 px-3 py-2 text-sm text-space-indigo-800 outline-none focus:border-space-indigo-400"
              />
              {dropdownOpen && filtered.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-space-indigo-100 bg-white shadow-lg"
                >
                  {filtered.map((cat, i) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setInputValue(cat);
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm ${
                        i === highlightIndex
                          ? "bg-space-indigo-50 text-space-indigo-800"
                          : "text-space-indigo-600 hover:bg-space-indigo-50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {applyToAll && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This will update all transactions named &ldquo;
                {transactionName}&rdquo; in this account. This action cannot be
                automatically undone.
              </p>
            )}

            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="h-4 w-4 rounded border-space-indigo-200"
              />
              <span className="text-xs text-space-indigo-600">
                Apply to all &ldquo;{transactionName}&rdquo;
              </span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 hover:bg-space-indigo-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || inputValue.trim().length === 0}
                className="rounded-lg bg-space-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-space-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
