import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
