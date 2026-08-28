import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface PlaidSyncItemResult {
  itemId: string;
  label: string;
  status: "synced" | "skipped" | "error";
  added: number;
  modified: number;
  removed: number;
}

export interface PlaidSyncResponse {
  synced: number;
  skipped: number;
  errors: number;
  totalAdded: number;
  results: PlaidSyncItemResult[];
}

export function usePlaidSync(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["plaid-sync"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/sync");
      if (!res.ok) {
        throw new Error("Failed to sync Plaid accounts");
      }
      return res.json() as Promise<PlaidSyncResponse>;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data } = query;

  useEffect(() => {
    if (data && data.synced > 0) {
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
    }
  }, [data, queryClient]);

  return query;
}
