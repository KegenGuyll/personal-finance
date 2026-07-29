import { useQuery } from "@tanstack/react-query";

export function usePlaidStatus() {
  return useQuery({
    queryKey: ["plaid-status"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/status");
      if (!res.ok) throw new Error("Failed to check status");
      return res.json() as Promise<{ isLinked: boolean }>;
    },
    staleTime: Infinity,
  });
}
