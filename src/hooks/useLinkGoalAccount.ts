import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useLinkGoalAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, linkedAccountId }: { id: string; linkedAccountId: string }) => {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedAccountId }),
      });
      if (!res.ok) throw new Error("Failed to link account");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}
