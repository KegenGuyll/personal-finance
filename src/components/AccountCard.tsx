import type { Account } from "@/src/features/plaid/plaidSlice";
import CreditCardAccountCard from "./AccountCards/CreditCardAccountCard";
import DepositoryAccountCard from "./AccountCards/DepositoryAccountCard";
import InvestmentAccountCard from "./AccountCards/InvestmentAccountCard";
import DefaultAccountCard from "./AccountCards/DefaultAccountCard";

export default function AccountCard({ account }: { account: Account }) {
  if (account.subtype === "credit card") {
    return <CreditCardAccountCard account={account} />;
  }

  if (account.type === "depository") {
    return <DepositoryAccountCard account={account} />;
  }

  if (account.type === "investment") {
    return <InvestmentAccountCard account={account} />;
  }

  return <DefaultAccountCard account={account} />;
}
