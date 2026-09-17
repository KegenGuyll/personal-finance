"use client";

/**
 * Main-thread facade for the receipt vision model.
 *
 * Owns the worker, its lifecycle, and the readiness question. Everything here is
 * about keeping a 316MB model and multi-second generation tolerable: the work
 * happens off the main thread, the download reports real bytes, and a missing
 * GPU is surfaced as a warning rather than discovered as a stall.
 */

import {
  LFM2_VL_DOWNLOAD_MB,
  LFM2_VL_MODEL_ID,
  type VlmDtype,
} from "@/src/lib/receipt-vlm-model";
import type { VlmResponse } from "@/src/lib/receipt-vlm-worker";

export { LFM2_VL_DOWNLOAD_MB, LFM2_VL_MODEL_ID };
export type { VlmDtype };

/** Cached by transformers.js under this name; used for the readiness probe. */
export const VLM_CACHE_NAME = "transformers-cache";

export interface VlmProgress {
  file: string | null;
  loadedBytes: number;
  totalBytes: number;
}

export interface VlmScanOutcome {
  /** Raw model text; parsed by the caller so this stays free of schema rules. */
  text: string;
  device: string;
  dtype: string;
  generateMs: number;
  outputTokens: number | null;
  /** False when no WebGPU adapter was available and WASM was used instead. */
  accelerated: boolean;
}

export interface VlmScanOptions {
  onProgress?: (progress: VlmProgress) => void;
  /** Called as tokens stream, so the UI can show the model is working. */
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

/**
 * Files this model downloads, for the cache probe and the progress total.
 *
 * Listed explicitly because the readiness check runs before anything is loaded:
 * asking transformers.js "is this cached?" would require loading it, which is the
 * download being avoided. The `q4f16` variants are the dtype chosen when the
 * adapter reports `shader-f16`; without it the `q4` names are used instead and
 * the probe is simply conservative.
 */
export const LFM2_VL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "processor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/decoder_model_merged_q4f16.onnx",
  "onnx/decoder_model_merged_q4f16.onnx_data",
  "onnx/embed_tokens_q4f16.onnx",
  "onnx/embed_tokens_q4f16.onnx_data",
  "onnx/vision_encoder_q4f16.onnx",
  "onnx/vision_encoder_q4f16.onnx_data",
] as const;

/** Cache key transformers.js uses: the full request URL. */
export function lfm2VlCacheUrls(modelId: string = LFM2_VL_MODEL_ID): string[] {
  const base = `https://huggingface.co/${modelId}/resolve/main`;
  return LFM2_VL_FILES.map((file) => `${base}/${file}`);
}

/** True when every weight file is already cached, so a scan costs no download. */
export async function areVlmWeightsCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;

  try {
    const cache = await caches.open(VLM_CACHE_NAME);
    const matches = await Promise.all(
      lfm2VlCacheUrls().map((url) => cache.match(url))
    );
    return matches.every((match) => match !== undefined);
  } catch {
    return false;
  }
}

/**
 * Asks the browser to persist this origin's storage, and reports what it said.
 *
 * A refusal matters more here than for the previous 69MB model: at 316MB the
 * weights are far likelier to be reclaimed, and re-downloading them is a much
 * bigger cost. WebKit has been reported as always refusing, which is why the
 * answer is surfaced rather than assumed.
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
 * The in-flight request's handler.
 *
 * Progress and token messages arrive many times per request while only one is
 * terminal, so the handler is invoked rather than being a promise resolver that
 * would have to re-arm itself after every intermediate message.
 */
interface PendingRequest {
  onMessage: (message: VlmResponse) => void;
}

let worker: Worker | null = null;
let pending: PendingRequest | null = null;
let loadedOnce = false;
let requestCounter = 0;
let lastWorkerError: Error | null = null;

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./receipt-vlm-worker.ts", import.meta.url), {
    type: "module",
    name: "receipt-vlm",
  });

  worker.addEventListener("message", (event: MessageEvent<VlmResponse>) => {
    pending?.onMessage(event.data);
  });

  worker.addEventListener("error", (event) => {
    // A worker-level error is not delivered as a message, so it is recorded and
    // handed to whichever request is waiting.
    lastWorkerError = new Error(
      event.message || "The receipt model worker crashed"
    );
    pending?.onMessage({
      type: "error",
      step: "worker",
      message: lastWorkerError.message,
    });
  });

  return worker;
}

/**
 * Sends one request and resolves on its terminal message.
 *
 * The handler is installed as `pending` so the worker's single message listener
 * can dispatch, then cleared on settle so a late message from a finished request
 * cannot resolve the next one.
 */
function send<T>(request: Record<string, unknown>, options: VlmScanOptions = {}): Promise<T> {
  const target = getWorker();
  const id = `req-${++requestCounter}`;

  if (options.signal?.aborted) {
    return Promise.reject(new DOMException("Cancelled", "AbortError"));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      if (pending === handler) pending = null;
      reject(new DOMException("Cancelled", "AbortError"));
    };

    const handler: PendingRequest = {
      onMessage(message) {
        const messageId = (message as { id?: string }).id;
        if (messageId && messageId !== id) return;

        if (message.type === "progress") {
          options.onProgress?.({
            file: message.file,
            loadedBytes: message.loadedBytes,
            totalBytes: message.totalBytes,
          });
          return;
        }
        if (message.type === "token") {
          options.onToken?.(message.token);
          return;
        }

        if (pending === handler) pending = null;
        options.signal?.removeEventListener("abort", onAbort);

        if (message.type === "error") {
          reject(new Error(`${message.step} failed: ${message.message}`));
        } else {
          resolve(message as T);
        }
      },
    };

    pending = handler;
    options.signal?.addEventListener("abort", onAbort, { once: true });

    target.postMessage({ id, request });
  });
}

export interface VlmLoadOutcome {
  device: string;
  dtype: string;
  downloadBytes: number;
}

/**
 * Downloads and loads the model.
 *
 * Idempotent per page: a second call returns without touching the worker once a
 * model is loaded, so callers do not have to track that themselves.
 */
export async function loadVlmModel(options: VlmScanOptions = {}): Promise<VlmLoadOutcome> {
  if (loadedOnce) return { device: "webgpu", dtype: "cached", downloadBytes: 0 };

  const result = await send<VlmLoadOutcome>({ op: "load" }, options);
  loadedOnce = true;
  return result;
}

/**
 * Reads one receipt image.
 *
 * `imageBytes` is the file exactly as the camera or upload produced it: decoding
 * happens once inside the worker, and re-encoding on the main thread would add
 * work and lose quality.
 */
export async function scanReceiptImage(
  imageBytes: ArrayBuffer,
  imageMime: string,
  options: VlmScanOptions = {}
): Promise<VlmScanOutcome> {
  const result = await send<{
    text: string;
    device: string;
    dtype: string;
    generateMs: number;
    outputTokens: number | null;
  }>({ op: "run", imageBytes, imageMime }, options);

  return {
    ...result,
    // WASM works but takes minutes rather than seconds on this model, so the UI
    // needs to know which backend it actually got.
    accelerated: result.device === "webgpu",
  };
}

/** Releases the model's GPU memory and tears down the worker. */
export async function disposeVlmModel(): Promise<void> {
  if (!worker) return;
  const target = worker;
  try {
    await send({ op: "dispose" });
  } finally {
    target.terminate();
    if (worker === target) worker = null;
    pending = null;
    loadedOnce = false;
  }
}

/** The most recent worker-level failure, for diagnostics. */
export function lastVlmWorkerError(): Error | null {
  return lastWorkerError;
}

/**
 * Requests persistent storage and loads the model.
 *
 * Persistence is asked for before the transfer rather than at scan time, because
 * it applies to the origin and this is the only moment it can influence whether
 * those 316MB survive.
 */
export async function prepareVlmModel(options: VlmScanOptions = {}): Promise<
  VlmLoadOutcome & { persistGranted: boolean }
> {
  const persistGranted = await requestPersistentStorage();
  return { ...(await loadVlmModel(options)), persistGranted };
}

/**
 * Formats a byte count for display.
 *
 * `null` (unknown) and 0 (nothing stored) are reported distinctly: collapsing
 * them would misreport an empty cache as unmeasurable.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
