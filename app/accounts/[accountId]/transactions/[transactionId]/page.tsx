import type { Metadata } from "next";
import TransactionDetailView from "@/src/components/TransactionDetailView";

export const metadata: Metadata = {
  title: "Transaction Details",
  description: "View transaction amount, date, status, payment channel, category rules, and spending history.",
};

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ accountId: string; transactionId: string }>;
}) {
  return <TransactionDetailView params={params} />;
}
