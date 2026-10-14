"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCategories } from "@/src/hooks/useCategories";
import { useAddCategory } from "@/src/hooks/useAddCategory";
import Button from "@/src/components/ui/Button";
import FieldLabel from "@/src/components/ui/FieldLabel";
import Modal from "@/src/components/ui/Modal";
import Notice from "@/src/components/ui/Notice";
import TextInput from "@/src/components/ui/TextInput";

interface CategoryEditorProps {
  transactionId: string;
  accountId: string;
  currentCategory: string[] | null;
  transactionName: string;
  initialAutoApply?: boolean;
}

export default function CategoryEditor({
  transactionId,
  accountId,
  currentCategory,
  transactionName,
  initialAutoApply = false,
}: CategoryEditorProps) {
  const queryClient = useQueryClient();
  const { data } = useCategories();
  const memoCategories = useMemo(() => data?.categories ?? [], [data]);

  const currentValue = (currentCategory ?? []).join(" > ");

  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(currentValue);
  const [applyToAll, setApplyToAll] = useState(false);
  const [autoApply, setAutoApply] = useState(initialAutoApply);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const addCategory = useAddCategory();

  const handleOpen = () => {
    setInputValue(currentValue);
    setAutoApply(initialAutoApply);
    setApplyToAll(false);
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
      body: JSON.stringify({ category: categoryArray, applyToAll, autoApply }),
    });

    if (!res.ok) throw new Error("Failed to update");

    queryClient.invalidateQueries({ queryKey: ["transaction", transactionId] });
    queryClient.invalidateQueries({ queryKey: ["category-stats", accountId] });
    queryClient.invalidateQueries({
      queryKey: ["account-transactions", accountId],
    });
    queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["spending-trend"] });
    queryClient.invalidateQueries({ queryKey: ["all-category-stats"] });
    queryClient.invalidateQueries({ queryKey: ["category-name-stats"] });

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
      <Button
        variant="link"
        className="text-cornflower-blue-500 hover:text-cornflower-blue-600"
        onClick={handleOpen}
      >
        {currentValue ? "Edit category" : "Add category"}
      </Button>

      {isOpen && (
        <Modal onClose={() => setIsOpen(false)}>
          <h3 className="text-lg font-semibold text-space-indigo-800">
            Edit Category
          </h3>
          <p className="mt-1 text-sm text-space-indigo-400">
            {transactionName}
          </p>

          <FieldLabel htmlFor="category-editor-input" className="mt-4">
            Category
          </FieldLabel>
          <div className="relative mt-1">
            <TextInput
              id="category-editor-input"
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
            />
            {dropdownOpen && filtered.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-space-indigo-100 bg-white shadow-lg"
              >
                {filtered.map((cat, i) => (
                  <Button
                    key={cat}
                    variant="bare"
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
                  </Button>
                ))}
              </div>
            )}
          </div>

          {applyToAll && (
            <Notice tone="warning" className="mt-3">
              This will update all transactions named &ldquo;
              {transactionName}&rdquo; in this account. This action cannot be
              automatically undone.
            </Notice>
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

            <label className="mt-2 flex items-start gap-2">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(e) => setAutoApply(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-space-indigo-200"
              />
              <span className="text-xs text-space-indigo-600">
                Also apply to new &ldquo;{transactionName}&rdquo; transactions
                automatically
              </span>
            </label>
            {autoApply && (
              <p className="mt-1 text-[10px] text-space-indigo-400">
                Future transactions from this account with this name will use
                this category when they sync.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving || inputValue.trim().length === 0}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
        </Modal>
      )}
    </>
  );
}
