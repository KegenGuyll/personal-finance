"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/src/components/ui/Button";

/**
 * Filters the All Transactions list down to manually entered transactions.
 *
 * Unlike the account-type and expense/income tabs this is an additive filter,
 * so it deliberately keeps every other param (search, category, date range) in
 * place rather than resetting the category — manual entries can be filtered
 * further with the same controls as synced ones.
 */
export default function ManualTransactionFilterToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("manual") === "1";

  const handleToggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete("manual");
    } else {
      params.set("manual", "1");
    }
    router.replace(`/transactions?${params.toString()}`);
  };

  return (
    <Button
      variant="bare"
      size="sm"
      aria-pressed={active}
      onClick={handleToggle}
      className={
        active
          ? "bg-soft-periwinkle-500 text-white"
          : "bg-soft-periwinkle-50 text-soft-periwinkle-700 hover:bg-soft-periwinkle-100"
      }
    >
      Manual
    </Button>
  );
}
