import { useMutation, useQueryClient } from "@tanstack/react-query";

interface UpdateGoalInput {
  id: string;
  name?: string;
  targetAmount?: number;
  targetDate?: string;
  linkedAccountId?: string;
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateGoalInput) => {
      const { id, ...body } = input;
      const res = await fetch(`/api/goals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
