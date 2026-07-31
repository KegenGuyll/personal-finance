import { useQuery } from "@tanstack/react-query";
import type { CarryoverItem } from "@/src/types/budget";

interface CarryoversResponse {
  carryovers: CarryoverItem[];
}

export function useCarryovers(month: string) {
  return useQuery({
    queryKey: ["carryovers", month],
    queryFn: async () => {
      const res = await fetch(`/api/budget/carryovers?month=${month}`);
      if (!res.ok) throw new Error("Failed to fetch carryovers");
      return res.json() as Promise<CarryoversResponse>;
    },
    staleTime: 60_000,
  });
}
