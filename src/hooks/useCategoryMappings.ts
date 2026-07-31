import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CategoryMapping } from "@/src/types/budget";

interface CategoryMappingsResponse {
  mappings: CategoryMapping[];
  unmapped: { leaf: string; count: number }[];
}

export function useCategoryMappings(month?: string) {
  return useQuery({
    queryKey: ["category-mappings", month],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      const url = `/api/budget/category-mappings${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch category mappings");
      return res.json() as Promise<CategoryMappingsResponse>;
    },
    staleTime: 60_000,
  });
}

interface UpdateMappingsInput {
  mappings: {
    plaidLeafCategory: string;
    budgetCategory: string;
    groupName: string;
  }[];
}

export function useUpdateCategoryMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMappingsInput) => {
      const res = await fetch("/api/budget/category-mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update mappings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget-groups"] });
    },
  });
}

export function useDeleteCategoryMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (plaidLeafCategory: string) => {
      const res = await fetch(
        `/api/budget/category-mappings?plaidLeafCategory=${encodeURIComponent(plaidLeafCategory)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete mapping");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-health"] });
      queryClient.invalidateQueries({ queryKey: ["budget-groups"] });
    },
  });
}
