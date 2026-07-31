import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ResolveCarryoverInput {
  month: string;
  category: string;
  decision: "carryover" | "savings" | "goal" | "reset";
  goalId?: string;
}

export function useResolveCarryover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ResolveCarryoverInput) => {
      const res = await fetch("/api/budget/carryovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to resolve carryover");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["carryovers", variables.month] });
      queryClient.invalidateQueries({ queryKey: ["budget", variables.month] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", variables.month] });
    },
  });
}
