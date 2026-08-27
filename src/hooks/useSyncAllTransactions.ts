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

interface SyncStreamEvent {
  type: "init" | "start" | "progress" | "item" | "summary" | "error";
  total?: number;
  itemId?: string;
  label?: string;
  added?: number;
  modified?: number;
  removed?: number;
  status?: SyncItemResult["status"];
  synced?: number;
  skipped?: number;
  errors?: number;
  message?: string;
}

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

      const res = await fetch("/api/plaid/sync-all", { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error("Failed to start sync");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let summary: SyncSummary = { synced: 0, skipped: 0, errors: 0 };
      const acc: SyncItemResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            let event: SyncStreamEvent;
            try {
              event = JSON.parse(line) as SyncStreamEvent;
            } catch {
              newline = buffer.indexOf("\n");
              continue;
            }

            if (event.type === "init") {
              setTotal(event.total ?? 0);
            } else if (event.type === "start") {
              setCurrentItem({
                itemId: event.itemId ?? "",
                label: event.label ?? "Unknown service",
              });
            } else if (event.type === "progress") {
              setAddedCount((count) => count + (event.added ?? 0));
            } else if (event.type === "item") {
              const result: SyncItemResult = {
                itemId: event.itemId ?? "",
                label: event.label ?? "",
                status: event.status ?? "error",
              };
              acc.push(result);
              setResults([...acc]);
            } else if (event.type === "summary") {
              summary = {
                synced: event.synced ?? 0,
                skipped: event.skipped ?? 0,
                errors: event.errors ?? 0,
              };
              setLastSummary(summary);
              setCurrentItem(null);
            } else if (event.type === "error") {
              throw new Error(event.message ?? "Sync failed");
            }
          }
          newline = buffer.indexOf("\n");
        }
      }

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
