import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteContribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      goalId,
      contributionId,
    }: {
      goalId: string;
      contributionId: string;
    }) => {
      const res = await fetch(
        `/api/goals/${goalId}/contributions/${contributionId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete contribution");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
