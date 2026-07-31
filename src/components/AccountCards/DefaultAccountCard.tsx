import type { Account } from "@/src/features/plaid/plaidSlice";
import { formatCurrency } from "@/src/utils/currency";
import BaseAccountCard from "./BaseAccountCard";

export default function DefaultAccountCard({
  account,
}: {
  account: Account;
}) {
  return (
    <BaseAccountCard
      accountId={account.account_id}
      title={account.name}
      subtitle={
        <>
          {account.mask && <>···{account.mask} · </>}
          {account.subtype} · {account.type}
        </>
      }
      balance={
        <span className="text-space-indigo-600">
          {formatCurrency(account.balances.current, account.balances.iso_currency_code)}
        </span>
      }
    />
  );
}
