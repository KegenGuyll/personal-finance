import { useQuery } from "@tanstack/react-query";
import type { IncomePattern } from "@/src/types/budget";

interface IncomePatternsResponse {
  patterns: IncomePattern[];
}

export function useIncomePatterns() {
  return useQuery({
    queryKey: ["income-patterns"],
    queryFn: async () => {
      const res = await fetch("/api/income/patterns");
      if (!res.ok) throw new Error("Failed to fetch income patterns");
      return res.json() as Promise<IncomePatternsResponse>;
    },
    staleTime: 5 * 60_000,
  });
}
