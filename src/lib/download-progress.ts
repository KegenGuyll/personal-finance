/**
 * Turns transformers.js download callbacks into a single progress figure.
 *
 * The library reports progress one file at a time, so its `progress` value
 * restarts at zero for every file. Showing that directly would make the bar jump
 * backwards as each file begins, which reads as a failure rather than as
 * progress — and the recogniser's weights are three files, so it would happen
 * repeatedly across what feels like one download.
 */

import { TROCR_MODEL_ID, trocrFileNames } from "@/src/lib/receipt-ocr-model";

/** The subset of transformers.js's ProgressInfo this module consumes. */
export interface ModelProgressInfo {
  status: "initiate" | "download" | "progress" | "done" | "ready";
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export interface DownloadProgress {
  /** 0–100 across every file, or `null` while the total size is unknown. */
  percent: number | null;
  loadedBytes: number;
  totalBytes: number | null;
  /** File currently transferring, for "downloading decoder_model_merged.onnx". */
  file: string | null;
  /** Files finished so far. */
  filesDone: number;
  filesTotal: number;
}

/**
 * Sizes of the three files that make up nearly all of the download.
 *
 * Used only to show a total before the first byte arrives. The files that carry
 * the weights are fixed by the export, so these stay valid until the model is
 * repinned; everything else is a config or tokenizer file worth a few hundred KB
 * and is not worth hardcoding.
 */
const KNOWN_FILE_BYTES: Record<string, number> = {
  "onnx/encoder_model_quantized.onnx": 23_080_000,
  "onnx/decoder_model_merged_quantized.onnx": 40_530_000,
  "tokenizer.json": 4_490_000,
  "sentencepiece.bpe.model": 1_360_000,
};

/**
 * Fallback sizes used when the Hub API cannot be reached.
 *
 * Only the three files that carry real bytes, so the estimate is ~4MB light
 * rather than wrong in a way that makes the bar stall at the end.
 */
export const FALLBACK_MODEL_SIZES: Record<string, number> = { ...KNOWN_FILE_BYTES };

/**
 * Accumulates per-file callbacks into whole-download progress.
 *
 * Two details of the library's reporting shape this:
 *
 * - Its `progress` value restarts at zero for every file, so bytes are summed
 *   per file and each file keeps a **high-water mark**: a retry inside one file
 *   reports a smaller `loaded`, and letting that through would move the bar
 *   backwards, which reads as failure.
 * - A file already in the cache reports `done` **without** ever reporting bytes.
 *   Crediting it zero would leave the bar at 0% while every file listed as
 *   finished, so a finished file is credited its known size instead.
 */
export function createProgressTracker(
  knownSizes: Record<string, number> = {}
): {
  onProgress: (info: ModelProgressInfo) => void;
  snapshot: () => DownloadProgress;
} {
  const loadedByFile = new Map<string, number>();
  const done = new Set<string>();

  /** Best known size for a file, from the manifest or from its own callbacks. */
  const observedSizes = new Map<string, number>();
  for (const [file, bytes] of Object.entries(knownSizes)) {
    if (bytes > 0) observedSizes.set(file, bytes);
  }

  let current: string | null = null;
  const listedTotal = Object.values(knownSizes).reduce((sum, bytes) => sum + bytes, 0);
  let observedTotal = 0;

  return {
    onProgress(info) {
      const file = info.file ?? null;

      if (file) {
        current = file;

        const reported = info.total ?? info.loaded ?? 0;
        if (reported > 0) {
          observedSizes.set(file, Math.max(observedSizes.get(file) ?? 0, reported));
        }

        if (info.status === "done") {
          done.add(file);
          // A cached file arrives here having never sent a byte count.
          const size = observedSizes.get(file) ?? loadedByFile.get(file) ?? 0;
          loadedByFile.set(file, Math.max(loadedByFile.get(file) ?? 0, size));
        } else if (info.status === "progress" && typeof info.loaded === "number") {
          loadedByFile.set(
            file,
            Math.max(loadedByFile.get(file) ?? 0, info.loaded)
          );
        }
      }

      if (info.status === "progress" && info.total) {
        observedTotal = Math.max(observedTotal, info.total);
      }
    },

    snapshot() {
      // Files that finished with no size information are counted from the
      // manifest, so a fully cached model reads as complete rather than as 0%.
      let loadedBytes = 0;
      for (const bytes of loadedByFile.values()) loadedBytes += bytes;
      for (const file of done) {
        if (!loadedByFile.has(file)) loadedBytes += observedSizes.get(file) ?? 0;
      }

      const sizes = [...observedSizes.values()];
      const totalBytes =
        Math.max(listedTotal, observedTotal, sizes.reduce((a, b) => a + b, 0)) || null;

      return {
        percent:
          totalBytes && totalBytes > 0
            ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
            : null,
        loadedBytes,
        totalBytes,
        file: current,
        filesDone: done.size,
        filesTotal: Object.keys(knownSizes).length || done.size,
      };
    },
  };
}

/**
 * Sizes for the files the recogniser actually downloads, from the Hub API.
 *
 * Filtered to `trocrFileNames()` rather than taking the whole repository: the
 * model ships fp32 weights and a decoder-with-past variant that a q8 load never
 * requests, and including them inflated the total from ~69MB to ~830MB, so a
 * finished download displayed as 8%.
 *
 * Fetched rather than hardcoded because the weights are the point of the
 * display: a total that is a few MB off is invisible, but one that makes the bar
 * stall near the end is worse than no bar. A failed request is not an error —
 * the caller falls back to `FALLBACK_MODEL_SIZES`.
 */
export async function fetchModelFileSizes(
  modelId: string = TROCR_MODEL_ID
): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(
      `https://huggingface.co/api/models/${modelId}?blobs=true`
    );
    if (!response.ok) return null;

    const body = (await response.json()) as {
      siblings?: Array<{ rfilename: string; size?: number }>;
    };
    if (!Array.isArray(body.siblings)) return null;

    const all = new Map(
      body.siblings
        .filter((entry) => typeof entry.size === "number")
        .map((entry) => [entry.rfilename, entry.size as number])
    );

    const sizes: Record<string, number> = {};
    for (const name of trocrFileNames(modelId)) {
      const size = all.get(name);
      if (size !== undefined) sizes[name] = size;
    }

    return Object.keys(sizes).length > 0 ? sizes : null;
  } catch {
    return null;
  }
}
