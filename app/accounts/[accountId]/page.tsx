import type { Metadata } from "next";
import AccountView from "@/src/components/AccountView";

export const metadata: Metadata = {
  title: "Account Details",
  description: "View account balance, category breakdown, spending trends, and transaction history.",
};

export default function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  return <AccountView params={params} />;
}
