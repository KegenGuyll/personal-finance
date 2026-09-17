"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { areModelsCached, prepareModels } from "@/src/lib/receipt-ocr-client";
import { RECEIPT_OCR_ASSETS } from "@/src/lib/receipt-ocr-runtime";

/**
 * Tracks whether the browser has downloaded the OCR model assets.
 *
 * They are ~25MB, so the scanner offers to fetch them deliberately instead of
 * starting a scan that silently stalls. Not a TanStack Query hook: readiness is
 * a one-off check against the Cache API with nothing to revalidate, and
 * preparing downloads through `fetch` rather than a query function.
 */
export function useModelsReady() {
  const [isCached, setIsCached] = useState<boolean | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: RECEIPT_OCR_ASSETS.length });
  const [error, setError] = useState<string | null>(null);

  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    areModelsCached()
      .then((cached) => {
        if (!cancelled.current) setIsCached(cached);
      })
      .catch(() => {
        if (!cancelled.current) setIsCached(false);
      });

    return () => {
      cancelled.current = true;
    };
  }, []);

  const prepare = useCallback(async () => {
    setIsPreparing(true);
    setError(null);

    try {
      await prepareModels((next) => setProgress(next));
      setIsCached(true);
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "Could not download the OCR model."
      );
    } finally {
      setIsPreparing(false);
    }
  }, []);

  return {
    /** `null` until the cache has been checked. */
    isCached,
    isPreparing,
    progress,
    error,
    prepare,
  };
}
