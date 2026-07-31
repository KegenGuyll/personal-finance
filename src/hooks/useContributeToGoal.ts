import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ContributeToGoalInput {
  id: string;
  amount: number;
  date: string;
  source?: "manual" | "transfer";
  transactionId?: string;
}

export function useContributeToGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ContributeToGoalInput) => {
      const { id, ...body } = input;
      const res = await fetch(`/api/goals/${id}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to contribute to goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
