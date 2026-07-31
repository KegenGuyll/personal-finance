import { useQuery } from "@tanstack/react-query";
import type { Goal } from "@/src/types/budget";

interface GoalsResponse {
  goals: Goal[];
}

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const res = await fetch("/api/goals");
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json() as Promise<GoalsResponse>;
    },
    staleTime: 60_000,
  });
}
