"use client";

import { useEffect, useState } from "react";

import type { VlmProgress } from "@/src/lib/receipt-vlm";
import { formatBytes } from "@/src/lib/receipt-vlm";

/**
 * Shows how far along the model download is.
 *
 * This is 316MB, and for most of it nothing else on screen changes — so a bar
 * that does not move is indistinguishable from a hang. The byte count and the
 * file being fetched are what separate "slow connection" from "stuck", and the
 * file names reveal the honest shape of the transfer: weight shards plus config,
 * not one file.
 */
export default function ModelDownloadProgress({
  progress,
  isPreparing,
}: {
  progress: VlmProgress | null;
  isPreparing: boolean;
}) {
  const percent = percentOf(progress);
  const stalled = useStalled(percent, isPreparing);

  return (
    <div className="mt-3" aria-live="polite">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-space-indigo-100"
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Model download progress"
      >
        <div
          // Indeterminate only while the total is still unknown; once bytes
          // arrive the bar is determinate and honest.
          className={
            percent === null
              ? "h-full w-1/3 animate-pulse rounded-full bg-cornflower-blue-500"
              : "h-full rounded-full bg-cornflower-blue-500 transition-[width] duration-200"
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>

      <div className="mt-1 flex justify-between gap-2 text-[10px]">
        <span className="truncate text-space-indigo-500">
          {progress?.file ? shortenFile(progress.file) : isPreparing ? "Starting…" : "Waiting"}
        </span>

        <span className="shrink-0 tabular-nums text-space-indigo-500">
          {progress
            ? `${formatBytes(progress.loadedBytes)}${
                progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : ""
              }`
            : ""}
          {percent !== null ? ` · ${percent}%` : ""}
        </span>
      </div>

      {stalled && (
        <p className="mt-1 text-[10px] text-amber-700">
          No progress for 20 seconds — the connection may have stalled. You can
          close this and enter the transaction by hand.
        </p>
      )}
    </div>
  );
}

function percentOf(progress: VlmProgress | null): number | null {
  if (!progress || progress.totalBytes <= 0) return null;
  return Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100));
}

/**
 * True when the percentage has not moved for a while.
 *
 * Worth saying out loud because a stalled download and a large shard look
 * identical on a progress bar, and the manual-entry alternative is only useful
 * while the user still believes the scan might finish.
 *
 * The timer is only ever *armed* in the effect and fired from its callback, never
 * set synchronously — this codebase's lint rules reject that for the cascading
 * render it causes. A stale `true` is harmless because the notice only renders
 * when there is a percentage to be stalled at.
 */
function useStalled(percent: number | null, isPreparing: boolean): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!isPreparing || percent === null) return;

    const timer = setTimeout(() => setStalled(true), 20_000);
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
  }, [percent, isPreparing]);

  return stalled;
}

/** Trims the `onnx/` prefix so the long shard names fit on a phone. */
function shortenFile(file: string): string {
  return file.replace(/^onnx\//, "");
}
