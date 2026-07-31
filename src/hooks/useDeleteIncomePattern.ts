import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteIncomePattern() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patternId: string) => {
      const res = await fetch(`/api/income/patterns/${patternId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete income pattern");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income-patterns"] });
    },
  });
}
