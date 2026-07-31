import { useQuery } from "@tanstack/react-query";
import type { Account } from "@/src/features/plaid/plaidSlice";

export function useAccount(accountId: string) {
  return useQuery({
    queryKey: ["account", accountId],
    queryFn: async () => {
      const res = await fetch(`/api/plaid/accounts/${accountId}`);
      if (!res.ok) throw new Error("Failed to fetch account");
      return res.json() as Promise<{ account: Account }>;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}
