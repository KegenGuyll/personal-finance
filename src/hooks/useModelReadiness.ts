"use client";

import { useCallback, useEffect, useState } from "react";

import { areModelsCached, prepareModels } from "@/src/lib/receipt-ocr-client";
import type { DownloadProgress } from "@/src/lib/download-progress";

export type ModelReadiness =
  /** The cache has not been read yet — nothing can be promised. */
  | "checking"
  /** The models are not cached; scanning cannot start until they are. */
  | "missing"
  | "downloading"
  | "ready"
  /** A download was attempted and failed. */
  | "failed";

export interface ModelReadinessState {
  readiness: ModelReadiness;
  /** Byte-level detail while downloading. */
  download: DownloadProgress | null;
  error: string | null;
  /** Begins the download, or retries it after a failure. */
  startDownload: () => Promise<void>;
  /** Re-reads the cache, for after a download that finished elsewhere. */
  recheck: () => Promise<void>;
}

/**
 * Tracks whether scanning can start, and drives the download when it cannot.
 *
 * Exists as one state machine rather than a boolean plus a flags object because
 * the scanner has to *refuse* to start until the models are present: a scan
 * triggered mid-download would sit silently on a progress bar with no way to
 * tell a slow network from a broken one. Keeping the states distinct is what
 * lets the modal show a download prompt instead of a photo picker.
 *
 * Deliberately not a TanStack Query: preparing asks the browser for persistent
 * storage, which is a side effect on the origin, so it must run only when the
 * user asks for it and never on a refetch, focus or remount.
 *
 * A download already under way is not cancelled when the scanner closes. The
 * bytes are wanted either way, and aborting on close would throw away everything
 * transferred so far; the setters that follow are no-ops once unmounted.
 */
export function useModelReadiness(): ModelReadinessState {
  const [readiness, setReadiness] = useState<ModelReadiness>("checking");
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    try {
      setReadiness((await areModelsCached()) ? "ready" : "missing");
    } catch {
      setReadiness("missing");
    }
  }, []);

  const startDownload = useCallback(async () => {
    setReadiness("downloading");
    setError(null);
    setDownload(null);

    try {
      await prepareModels((next) => setDownload(next.download));
      setReadiness("ready");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not download the OCR model."
      );
      setReadiness("failed");
    }
  }, []);

  useEffect(() => {
    // From a microtask so no setState runs in the effect body, which this
    // codebase's lint rules reject for the cascading render it causes.
    void Promise.resolve().then(recheck);
  }, [recheck]);

  return { readiness, download, error, startDownload, recheck };
}
