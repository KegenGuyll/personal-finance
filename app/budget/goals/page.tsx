import type { Metadata } from "next";
import GoalsView from "@/src/components/GoalsView";

export const metadata: Metadata = {
  title: "Savings Goals",
  description: "Track your savings goals, monitor monthly progress, and allocate savings.",
};

export default function GoalsPage() {
  return <GoalsView />;
}
