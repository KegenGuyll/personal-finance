"use client";

import { useCallback, useEffect } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "@/src/lib/hooks";
import { setLinkToken, clearLinkToken, setLinked, setError } from "@/src/features/plaid/plaidSlice";

export default function PlaidLinkButton() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { linkToken } = useAppSelector((state) => state.plaid);

  const createLinkToken = useMutation({
    mutationFn: async () => {
      dispatch(setError(""));
      const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create link token");
      const data = await res.json();
      return data.link_token as string;
    },
    onSuccess: (token) => {
      dispatch(setLinkToken(token));
    },
    onError: () => {
      dispatch(setError("Failed to initialize Plaid Link"));
    },
  });

  const exchangePublicToken = useMutation({
    mutationFn: async (publicToken: string) => {
      const res = await fetch("/api/plaid/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken }),
      });
      if (!res.ok) throw new Error("Failed to exchange token");
      return res.json();
    },
    onSuccess: () => {
      dispatch(setLinked());
      dispatch(clearLinkToken());
      queryClient.invalidateQueries({ queryKey: ["plaid-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-status"] });
    },
    onError: () => {
      dispatch(setError("Failed to connect bank"));
    },
  });

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken) => {
      if (publicToken) {
        exchangePublicToken.mutate(publicToken);
      } else {
        dispatch(setError("No public token received"));
      }
    },
    [exchangePublicToken, dispatch]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  return (
    <button
      onClick={() => createLinkToken.mutate()}
      disabled={createLinkToken.isPending}
      className="rounded-lg bg-space-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
    >
      {createLinkToken.isPending ? "Connecting..." : "Connect Bank Account"}
    </button>
  );
}
