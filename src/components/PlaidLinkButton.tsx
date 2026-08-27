"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppDispatch } from "@/src/lib/hooks";
import { setLinked, setError } from "@/src/features/plaid/plaidSlice";

function PlaidLinkOverlay({
  linkToken,
  onSuccess,
}: {
  linkToken: string;
  onSuccess: PlaidLinkOnSuccess;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);

  return null;
}

interface PlaidLinkButtonProps {
  mode?: "add" | "update";
  itemId?: string;
  label?: string;
  className?: string;
}

export default function PlaidLinkButton({
  mode = "add",
  itemId,
  label,
  className,
}: PlaidLinkButtonProps) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const createLinkToken = useMutation({
    mutationFn: async () => {
      dispatch(setError(""));
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "update" ? { itemId } : {}),
      });
      if (!res.ok) throw new Error("Failed to create link token");
      const data = await res.json();
      return data.link_token as string;
    },
    onSuccess: (token) => {
      setLinkToken(token);
    },
    onError: () => {
      dispatch(setError("Failed to initialize Plaid Link"));
    },
  });

  const exchangePublicToken = useMutation({
    mutationFn: async (payload: {
      publicToken: string;
      institutionName?: string;
      institutionId?: string;
    }) => {
      const res = await fetch("/api/plaid/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: payload.publicToken,
          institutionName: payload.institutionName,
          institutionId: payload.institutionId,
        }),
      });
      if (!res.ok) throw new Error("Failed to exchange token");
      return res.json();
    },
    onSuccess: () => {
      dispatch(setLinked());
      setLinkToken(null);
      queryClient.invalidateQueries({ queryKey: ["plaid-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-status"] });
    },
    onError: () => {
      dispatch(setError("Failed to connect bank"));
    },
  });

  const updateAccounts = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/plaid/update-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) throw new Error("Failed to update accounts");
      return res.json();
    },
    onSuccess: () => {
      dispatch(setLinked());
      setLinkToken(null);
      queryClient.invalidateQueries({ queryKey: ["plaid-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-status"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-sync"] });
    },
    onError: () => {
      dispatch(setError("Failed to update accounts"));
    },
  });

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken, metadata) => {
      if (mode === "update") {
        // Update mode does not return a new access token; just re-pull accounts.
        updateAccounts.mutate();
        return;
      }

      if (publicToken) {
        exchangePublicToken.mutate({
          publicToken,
          institutionName: metadata.institution?.name,
          institutionId: metadata.institution?.institution_id,
        });
      } else {
        dispatch(setError("No public token received"));
      }
    },
    [mode, exchangePublicToken, updateAccounts, dispatch]
  );

  const buttonLabel =
    label ?? (mode === "update" ? "Add accounts" : "Connect Bank Account");

  return (
    <>
      {linkToken && (
        <PlaidLinkOverlay linkToken={linkToken} onSuccess={onSuccess} />
      )}
      <button
        onClick={() => createLinkToken.mutate()}
        disabled={createLinkToken.isPending}
        className={
          className ??
          "rounded-lg bg-space-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
        }
      >
        {createLinkToken.isPending ? "Connecting..." : buttonLabel}
      </button>
    </>
  );
}
