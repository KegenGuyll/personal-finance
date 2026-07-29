import { useQuery } from "@tanstack/react-query";
import type { Account } from "@/src/features/plaid/plaidSlice";

export function usePlaidAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["plaid-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json() as Promise<{ accounts: Account[] }>;
    },
    enabled,
  });
}
