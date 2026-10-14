"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";
import TextInput from "@/src/components/ui/TextInput";

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
    <TextInput
      type="text"
      defaultValue={query}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Search transactions..."
      className="py-2.5 pl-4"
      // The slot must stay mounted: toggling it would swap TextInput's root
      // between input and wrapper, remounting this uncontrolled field mid-typing
      // and losing focus/caret to the debounced URL state.
      trailing={
        <div
          className={
            isPending
              ? "h-4 w-4 animate-spin rounded-full border-2 border-space-indigo-300 border-t-transparent"
              : "hidden"
          }
        />
      }
    />
  );
}
