import type { Account } from "@/src/features/plaid/plaidSlice";
import { formatCurrency } from "@/src/utils/currency";
import BaseAccountCard from "./BaseAccountCard";

export default function CreditCardAccountCard({
  account,
}: {
  account: Account;
}) {
  return (
    <BaseAccountCard
      title={account.official_name ?? account.name}
      subtitle={
        <>
          {account.mask && <>···{account.mask} · </>}
          {account.subtype}
        </>
      }
      balance={
        <span className="text-red-500">
          {formatCurrency(-account.balances.current, account.balances.iso_currency_code)}
        </span>
      }
    />
  );
}
