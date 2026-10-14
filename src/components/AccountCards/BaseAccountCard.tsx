import type { ReactNode } from "react";
import Link from "next/link";
import Card from "@/src/components/ui/Card";

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
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-space-indigo-800">{title}</p>
          <p className="text-sm text-space-indigo-400">{subtitle}</p>
        </div>
        <p className="text-lg font-semibold">{balance}</p>
      </div>
    </Card>
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
