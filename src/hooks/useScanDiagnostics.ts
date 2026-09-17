"use client";

import { useCallback, useEffect, useState } from "react";

import {
  probeCachedModels,
  probeScanEnvironment,
  type ScanDiagnostics,
} from "@/src/lib/scan-diagnostics";

/**
 * Collects the browser facts the receipt scanner depends on.
 *
 * The probe is async, so every setter runs from a promise callback rather than
 * in the effect body — calling setState synchronously in an effect causes
 * cascading renders and is rejected by this codebase's lint rules. The same
 * reason rules out a lazy state initialiser, which React may re-invoke.
 *
 * Deliberately not a TanStack Query: `persist()` has an observable side effect
 * on the origin (it asks the browser to grant persistence), so the snapshot is
 * taken once and again only when the caller asks — a query would re-run it on
 * focus and on remounts, repeatedly requesting a grant the user cannot control.
 */
export function useScanDiagnostics() {
  const [snapshot, setSnapshot] = useState<ScanDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setSnapshot(await probeScanEnvironment());
    } catch (probeError) {
      setError(
        probeError instanceof Error
          ? probeError.message
          : "Could not read the scan environment"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred by a microtask so the first setState happens after the effect
    // body returns, which is what keeps this out of the cascading-render case.
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return { snapshot, isLoading, error, refresh };
}

/**
 * Re-reads only the cache state.
 *
 * Split from the full probe because the useful before/after comparison — scan
 * once, come back days later, check whether the weights survived — should not
 * re-request storage persistence or spin up a GPU adapter each time.
 */
export function useCachePresence() {
  const [present, setPresent] = useState<{
    detector: boolean;
    recogniser: boolean;
  } | null>(null);

  const check = useCallback(async () => {
    const models = await probeCachedModels();
    setPresent({
      detector: models.detectorCached,
      recogniser: models.recogniserCached,
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(check);
  }, [check]);

  return { present, check };
}
