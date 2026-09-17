"use client";

import { useCallback, useEffect, useState } from "react";

import {
  areVlmWeightsCached,
  prepareVlmModel,
  type VlmProgress,
} from "@/src/lib/receipt-vlm";

export type ModelReadiness =
  /** The cache has not been read yet — nothing can be promised. */
  | "checking"
  /** The weights are not cached; scanning cannot start until they are. */
  | "missing"
  | "downloading"
  | "ready"
  /** A download was attempted and failed. */
  | "failed";

export interface ModelReadinessState {
  readiness: ModelReadiness;
  /** Byte-level detail while downloading. */
  progress: VlmProgress | null;
  /** Which backend the model loaded on: "webgpu", or the slow "wasm" fallback. */
  device: string | null;
  error: string | null;
  startDownload: () => Promise<void>;
  recheck: () => Promise<void>;
}

/**
 * Tracks whether scanning can start, and drives the download when it cannot.
 *
 * One state machine rather than a boolean plus flags, because the scanner has to
 * *refuse* to start until the weights are present: a scan triggered mid-download
 * would sit on a progress bar with no way to tell a slow network from a broken
 * one.
 *
 * Deliberately not a TanStack Query: preparing asks the browser for persistent
 * storage, which is a side effect on the origin, so it must run only when the
 * user asks and never on a refetch, focus or remount. A refusal is what makes the
 * 316MB of weights reclaimable.
 *
 * A download already under way is not cancelled when the scanner closes — the
 * bytes are wanted either way, and aborting would discard everything transferred.
 */
export function useModelReadiness(): ModelReadinessState {
  const [readiness, setReadiness] = useState<ModelReadiness>("checking");
  const [progress, setProgress] = useState<VlmProgress | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    try {
      setReadiness((await areVlmWeightsCached()) ? "ready" : "missing");
    } catch {
      setReadiness("missing");
    }
  }, []);

  const startDownload = useCallback(async () => {
    setReadiness("downloading");
    setError(null);
    setProgress(null);

    try {
      const result = await prepareVlmModel({ onProgress: setProgress });
      setDevice(result.device);
      setReadiness("ready");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not download the receipt model."
      );
      setReadiness("failed");
    }
  }, []);

  useEffect(() => {
    // From a microtask so no setState runs in the effect body, which this
    // codebase's lint rules reject for the cascading render it causes.
    void Promise.resolve().then(recheck);
  }, [recheck]);

  return { readiness, progress, device, error, startDownload, recheck };
}

/**
 * What a scan entry point should tell the user before they tap.
 *
 * A pure mapping so the messaging can be tested, and so the states cannot drift
 * apart across the two screens that render the button. The distinction that
 * matters: only `ready` can actually scan, and saying anything else first would
 * make the modal's download prompt look like a failure rather than the expected
 * first run.
 */
export function describeScanReadiness(readiness: ModelReadiness): {
  label: string;
  hint: string | null;
  canScan: boolean;
} {
  switch (readiness) {
    case "ready":
      return { label: "Scan receipt", hint: null, canScan: true };
    case "downloading":
      return {
        label: "Downloading…",
        hint: "The receipt model is downloading",
        canScan: false,
      };
    case "missing":
      return {
        label: "Scan receipt",
        hint: "Needs a one-time ~316MB download",
        canScan: false,
      };
    case "failed":
      return {
        label: "Scan receipt",
        hint: "The model download did not finish",
        canScan: false,
      };
    default:
      return { label: "Scan receipt", hint: null, canScan: false };
  }
}
