import type { Metadata } from "next";
import TransactionsView from "@/src/components/TransactionsView";

export const metadata: Metadata = {
  title: "All Transactions",
  description: "Browse, filter, search, and categorize all connected bank transactions.",
};

export default function TransactionsPage() {
  return <TransactionsView />;
}
