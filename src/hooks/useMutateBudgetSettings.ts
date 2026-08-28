import { useMutation, useQueryClient } from "@tanstack/react-query";

interface MutateBudgetSettingsInput {
  month: string;
  expectedIncome: number;
}

export function useMutateBudgetSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MutateBudgetSettingsInput) => {
      const res = await fetch("/api/budget/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update budget settings");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["budget-settings", variables.month] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
    },
  });
}
