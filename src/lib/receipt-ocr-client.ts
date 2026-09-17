"use client";

/**
 * Main-thread facade for the receipt scanner: runs the OCR pipeline, reports
 * progress, and loads or pre-downloads the model assets.
 *
 * There is deliberately no Web Worker. Bundling one requires the pipeline to be
 * reachable through an asset URL that the runtime then has to fetch, which Next's
 * bundler rewrites into a path the ONNX runtime rejects — and the failure only
 * appears at build/prerender time, far from the change that caused it. Scans
 * instead run in batches with a yield between them, which keeps the progress
 * indicator honest without that fragility.
 *
 * The image is prepared here rather than deeper in because canvas and
 * `createImageBitmap` are main-thread APIs, and because the prepared preview is
 * what the user approves.
 */

import {
  RECEIPT_OCR_ASSETS,
  RECEIPT_OCR_BASE_PATH,
  runScan,
  type OcrLine,
  type ScanPhase,
} from "@/src/lib/receipt-ocr-runtime";

export interface ScannedReceipt {
  lines: OcrLine[];
}

export interface ScanProgress {
  phase: ScanPhase | "preparing";
  done?: number;
  total?: number;
}

/**
 * Reads text lines out of a prepared image.
 *
 * `signal` is checked between recognition batches: a single WASM inference call
 * cannot be interrupted once started, so cancellation takes effect at the next
 * boundary rather than instantly.
 */
export async function recogniseReceipt(
  image: {
    pixels: Uint8ClampedArray;
    size: { width: number; height: number };
  },
  options: { onProgress?: (progress: ScanProgress) => void; signal?: AbortSignal } = {}
): Promise<ScannedReceipt> {
  const { onProgress, signal } = options;

  const lines = await runScan(image, {
    basePath: RECEIPT_OCR_BASE_PATH,
    signal,
    onProgress: (phase, detail) =>
      onProgress?.({ phase, done: detail?.done, total: detail?.total }),
  });

  return { lines };
}

/** True when every model asset is already in the browser cache. */
export async function areModelsCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;

  try {
    const cache = await caches.open("receipt-ocr");
    const matches = await Promise.all(
      RECEIPT_OCR_ASSETS.map((url) => cache.match(url))
    );
    return matches.every((match) => match !== undefined);
  } catch {
    return false;
  }
}

/**
 * Downloads the model assets into the Cache API.
 *
 * Doing this before the first scan turns a long wait in the middle of a scan
 * into a setup step the user triggers deliberately. A cache failure is not fatal
 * — the assets are still served from `public/`, just not cached.
 */
export async function prepareModels(
  onProgress?: (progress: { loaded: number; total: number }) => void
): Promise<void> {
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open("receipt-ocr");

      // ~25MB is large enough for the browser to evict under storage pressure;
      // asking for persistence is best-effort and a refusal is not an error.
      await navigator.storage?.persist?.().catch(() => undefined);

      for (const [index, url] of RECEIPT_OCR_ASSETS.entries()) {
        if (!(await cache.match(url))) {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Could not download the OCR model (HTTP ${response.status}).`
            );
          }
          await cache.put(url, response.clone());
        }
        onProgress?.({ loaded: index + 1, total: RECEIPT_OCR_ASSETS.length });
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Could not download")) {
        throw error;
      }
      // Cache API unavailable (private mode, storage disabled): the scan can
      // still fetch the assets directly, so this is not worth failing over.
    }
  }

  onProgress?.({ loaded: RECEIPT_OCR_ASSETS.length, total: RECEIPT_OCR_ASSETS.length });
}
