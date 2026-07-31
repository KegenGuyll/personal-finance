"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

const DEBOUNCE_MS = 300;

export default function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = searchParams.get("q") ?? "";

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const pushQuery = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      startTransition(() => {
        router.replace(`?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  const handleChange = useCallback(
    (value: string) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        pushQuery(value);
      }, DEBOUNCE_MS);
    },
    [pushQuery]
  );

  return (
    <div className="relative">
      <input
        type="text"
        defaultValue={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search transactions..."
        className="w-full rounded-lg border border-space-indigo-200 bg-white px-4 py-2.5 pr-10 text-sm text-space-indigo-800 placeholder-space-indigo-300 outline-none transition-colors focus:border-space-indigo-400"
      />
      {isPending && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-space-indigo-300 border-t-transparent" />
        </div>
      )}
    </div>
  );
}
