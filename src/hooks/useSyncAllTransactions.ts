import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface SyncItemResult {
  itemId: string;
  label: string;
  status: "synced" | "skipped" | "error";
}

export interface SyncSummary {
  synced: number;
  skipped: number;
  errors: number;
}

interface PlaidItem {
  itemId: string;
  label: string;
}

const REQUEST_TIMEOUT_MS = 120_000;

export function useSyncAllTransactions() {
  const queryClient = useQueryClient();
  const [total, setTotal] = useState(0);
  const [currentItem, setCurrentItem] = useState<{
    itemId: string;
    label: string;
  } | null>(null);
  const [results, setResults] = useState<SyncItemResult[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      setTotal(0);
      setCurrentItem(null);
      setResults([]);
      setAddedCount(0);
      setLastSummary(null);

      const itemsRes = await fetch("/api/plaid/items", {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!itemsRes.ok) throw new Error("Failed to list Plaid items");
      const { items } = (await itemsRes.json()) as { items: PlaidItem[] };
      setTotal(items.length);

      const acc: SyncItemResult[] = [];
      let synced = 0;
      let skipped = 0;
      let errors = 0;
      let addedTotal = 0;

      for (const item of items) {
        setCurrentItem(item);

        try {
          const res = await fetch("/api/plaid/sync-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.itemId }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (!res.ok) throw new Error("Failed to sync item");

          const data = (await res.json()) as {
            status: SyncItemResult["status"];
            added: number;
          };

          acc.push({ itemId: item.itemId, label: item.label, status: data.status });
          setResults([...acc]);

          addedTotal += data.added ?? 0;
          setAddedCount(addedTotal);

          if (data.status === "synced") synced++;
          else if (data.status === "skipped") skipped++;
        } catch (error) {
          console.error(`Error syncing item ${item.itemId}:`, error);
          acc.push({ itemId: item.itemId, label: item.label, status: "error" });
          setResults([...acc]);
          errors++;
        }
      }

      setCurrentItem(null);
      const summary: SyncSummary = { synced, skipped, errors };
      setLastSummary(summary);
      return summary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-by-name"] });
      queryClient.invalidateQueries({ queryKey: ["transaction"] });
      queryClient.invalidateQueries({ queryKey: ["income-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["income-status"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      queryClient.invalidateQueries({ queryKey: ["spending-trend"] });
      queryClient.invalidateQueries({ queryKey: ["all-category-stats"] });
      queryClient.invalidateQueries({ queryKey: ["category-name-stats"] });

      window.setTimeout(() => {
        setLastSummary(null);
      }, 5000);
    },
  });

  return {
    mutate: mutation.mutate,
    isSyncing: mutation.isPending,
    total,
    currentItem,
    results,
    addedCount,
    lastSummary,
  };
}
