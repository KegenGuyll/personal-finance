import { useMutation, useQueryClient } from "@tanstack/react-query";

interface CreateGoalInput {
  name: string;
  targetAmount: number;
  targetDate: string;
  linkedAccountId?: string;
}

export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateGoalInput) => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
