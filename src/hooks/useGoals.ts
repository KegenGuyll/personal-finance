import { useQuery } from "@tanstack/react-query";
import type { Goal } from "@/src/types/budget";

interface GoalsResponse {
  goals: Goal[];
  month: string;
  savingsActual: number;
  unallocated: number;
}

interface UseGoalsParams {
  month?: string;
  includeDeleted?: boolean;
}

export function useGoals(params: UseGoalsParams = {}) {
  const { month, includeDeleted = false } = params;

  return useQuery({
    queryKey: ["goals", month ?? "", includeDeleted],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (month) searchParams.set("month", month);
      if (includeDeleted) searchParams.set("includeDeleted", "true");
      const res = await fetch(`/api/goals${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json() as Promise<GoalsResponse>;
    },
    staleTime: 60_000,
  });
}
