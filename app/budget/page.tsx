import type { Metadata } from "next";
import BudgetView from "@/src/components/BudgetView";

export const metadata: Metadata = {
  title: "Monthly Budget",
  description: "Plan and track your 50/20/30 envelope budgets, categorize expenses, and monitor savings goals.",
};

export default function BudgetPage() {
  return <BudgetView />;
}
