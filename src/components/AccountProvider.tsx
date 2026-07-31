"use client";

import { useEffect, type ReactNode } from "react";
import { usePlaidStatus } from "@/src/hooks/usePlaidStatus";
import { usePlaidAccounts } from "@/src/hooks/usePlaidAccounts";
import { useAppDispatch } from "@/src/lib/hooks";
import { setAccounts, setLinked } from "@/src/features/plaid/plaidSlice";

export default function AccountProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const { data: statusData } = usePlaidStatus();

  useEffect(() => {
    if (statusData?.isLinked) {
      dispatch(setLinked());
    }
  }, [statusData, dispatch]);

  const { data: accountsData } = usePlaidAccounts(
    statusData?.isLinked ?? false
  );

  useEffect(() => {
    if (accountsData?.accounts) {
      dispatch(setAccounts(accountsData.accounts));
    }
  }, [accountsData, dispatch]);

  return children;
}
