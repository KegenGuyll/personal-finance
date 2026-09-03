import type { Metadata } from "next";
import BudgetComparisonView from "@/src/components/BudgetComparisonView";

export const metadata: Metadata = {
  title: "Budget Comparison",
  description: "Compare budget categories month over month, spot spending trends, and update budgets.",
};

export default function BudgetComparisonPage() {
  return <BudgetComparisonView />;
}
