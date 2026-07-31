import type { ReactNode } from "react";
import Link from "next/link";

interface BaseAccountCardProps {
  title: ReactNode;
  subtitle: ReactNode;
  balance: ReactNode;
  accountId?: string;
}

export default function BaseAccountCard({
  title,
  subtitle,
  balance,
  accountId,
}: BaseAccountCardProps) {
  const card = (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-space-indigo-800">{title}</p>
          <p className="text-sm text-space-indigo-400">{subtitle}</p>
        </div>
        <p className="text-lg font-semibold">{balance}</p>
      </div>
    </div>
  );

  if (accountId) {
    return (
      <Link
        href={`/accounts/${accountId}`}
        className="block transition-shadow hover:shadow-md"
      >
        {card}
      </Link>
    );
  }

  return card;
}
