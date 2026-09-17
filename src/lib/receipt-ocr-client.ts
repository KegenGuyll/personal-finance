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
import { loadRecogniser } from "@/src/lib/receipt-ocr-recogniser";
import {
  createProgressTracker,
  FALLBACK_MODEL_SIZES,
  fetchModelFileSizes,
  type DownloadProgress,
} from "@/src/lib/download-progress";
import { DETECTOR_CACHE_NAME, TRANSFORMERS_CACHE_NAME } from "@/src/lib/scan-diagnostics";
import { trocrCacheUrls } from "@/src/lib/receipt-ocr-model";

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

/**
 * True when every asset a scan needs is already cached.
 *
 * Both caches are checked, and the recogniser is not optional: the detector and
 * runtime are 16MB, while the TrOCR weights transformers.js stores in its own
 * cache are ~72MB and dominate first-run cost. Reporting ready on the detector
 * alone would promise a fast scan and then stall on the largest download.
 */
export async function areModelsCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;

  try {
    const detectorCache = await caches.open(DETECTOR_CACHE_NAME);
    const detectorPresent = await Promise.all(
      RECEIPT_OCR_ASSETS.map((url) => detectorCache.match(url))
    );
    if (!detectorPresent.every((match) => match !== undefined)) return false;

    const transformersCache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const recogniserPresent = await Promise.all(
      trocrCacheUrls().map((url) => transformersCache.match(url))
    );
    return recogniserPresent.every((match) => match !== undefined);
  } catch {
    return false;
  }
}

/**
 * Asks the browser to make this origin's storage persistent, and reports what it
 * said.
 *
 * The result is returned rather than discarded because a refusal has a concrete
 * consequence worth surfacing: the cached weights become reclaimable, so a later
 * scan may silently re-download all 72MB. WebKit's implementation has been
 * reported as always refusing, which is why the value is measured on the device
 * rather than assumed — see `scan-diagnostics.ts`.
 *
 * Failure to call it is not an error: without the grant the scanner still works,
 * it just re-downloads more readily.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Downloads every asset a scan needs into the browser caches.
 *
 * Doing this before the first scan turns a long wait in the middle of a scan
 * into a setup step the user triggers deliberately, and the progress it reports
 * is byte level because ~69MB of the ~85MB total is the recognition weights.
 *
 * A cache failure is not fatal: the assets are still served from `public/`, just
 * not cached.
 */
export async function prepareModels(
  onProgress?: (progress: {
    loaded: number;
    total: number;
    download: DownloadProgress;
  }) => void
): Promise<void> {
  const persistGranted = await requestPersistentStorage();

  // Real sizes let the bar show a percentage from the first byte; the fallback
  // constants are only a few MB out, and a failed request is not an error.
  const sizes =
    (await fetchModelFileSizes()) ??
    // Without real sizes the bar still works; it is just a few MB light, which
    // costs a second of completeness rather than a stalled bar.
    FALLBACK_MODEL_SIZES;
  const tracker = createProgressTracker(sizes);

  const report = (loaded: number, total: number) =>
    onProgress?.({ loaded, total, download: tracker.snapshot() });

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(DETECTOR_CACHE_NAME);

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
        report(index + 1, RECEIPT_OCR_ASSETS.length);
      }

      // Loading the recogniser downloads and caches the TrOCR weights, so it
      // runs here to keep that cost inside the deliberate setup action rather
      // than mid-scan. Its callback is what drives the byte level.
      await loadRecogniser((info) => {
        tracker.onProgress(info);
        report(RECEIPT_OCR_ASSETS.length, RECEIPT_OCR_ASSETS.length);
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Could not download")) {
        throw error;
      }
      // Cache API unavailable (private mode, storage disabled): the scan can
      // still fetch the assets directly, so this is not worth failing over.
    }
  }

  report(RECEIPT_OCR_ASSETS.length, RECEIPT_OCR_ASSETS.length);
  if (!persistGranted) {
    console.info(
      "[receipt-scan] persistent storage not granted; cached models may be reclaimed"
    );
  }
}
