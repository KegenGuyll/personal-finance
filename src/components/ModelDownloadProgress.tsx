"use client";

import { useEffect, useState } from "react";

import type { DownloadProgress } from "@/src/lib/download-progress";
import { formatBytes } from "@/src/lib/scan-diagnostics";

/**
 * Shows how far along the on-device model download is.
 *
 * The download is ~85MB, and for most of it nothing else on screen changes — so
 * a bar that does not move is indistinguishable from a hang. This reports the
 * byte count and the file being fetched, because those are what distinguish
 * "slow connection" from "stuck", and it is the file names that reveal the
 * honest shape of the transfer: three large files, not one.
 *
 * Progress here is genuinely monotonic: the tracker keeps a per-file high-water
 * mark, so a retry inside one file cannot make the bar jump backwards.
 */
export default function ModelDownloadProgress({
  download,
  isPreparing,
}: {
  download: DownloadProgress | null;
  isPreparing: boolean;
}) {
  const percent = download?.percent ?? null;
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
          // Indeterminate only when the total size could not be established at
          // all; with sizes known the bar is determinate from zero.
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
          {download?.file
            ? shortenFile(download.file)
            : isPreparing
              ? "Preparing…"
              : "Waiting"}
          {download && download.filesTotal > 0 && (
            <span className="text-space-indigo-400">
              {" "}
              · {download.filesDone}/{download.filesTotal} files
            </span>
          )}
        </span>

        <span className="shrink-0 tabular-nums text-space-indigo-500">
          {download
            ? `${formatBytes(download.loadedBytes)}${
                download.totalBytes ? ` / ${formatBytes(download.totalBytes)}` : ""
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

/**
 * True when the percentage has not moved for a while.
 *
 * Worth saying out loud because a stalled download and a large file look
 * identical on a progress bar, and the user's alternative — entering the
 * transaction by hand — is only useful while they still believe the scan might
 * not finish.
 *
 * The timer is only ever *armed* here, never fired synchronously inside the
 * effect: a stale `true` left over from an earlier stall is harmless because the
 * only caller renders this notice when there is a percentage to be stalled at.
 */
function useStalled(percent: number | null, isPreparing: boolean): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!isPreparing || percent === null) return;

    const timer = setTimeout(() => setStalled(true), 20_000);
    return () => {
      clearTimeout(timer);
      // Cleared from the cleanup rather than the effect body so no setState runs
      // during the render pass.
      setStalled(false);
    };
  }, [percent, isPreparing]);

  return stalled;
}

/** Trims the `onnx/` prefix so the long file names fit on a phone. */
function shortenFile(file: string): string {
  return file.replace(/^onnx\//, "");
}
