/**
 * Read-only diagnostics for the browser storage and GPU facts the receipt
 * scanner depends on but cannot control.
 *
 * Two of those facts decide whether scanning is pleasant or painful on a given
 * device, and neither can be established from documentation:
 *
 * - **Whether WebGPU is actually available.** Recognition runs on WASM today,
 *   which is correct everywhere but slow. iOS enabled WebGPU by default in
 *   Safari 26, so the fast path may already exist on the device while this code
 *   still avoids it. Nothing here should be assumed from a browser version.
 * - **Whether the cached models survive.** The weights are ~72MB across two
 *   caches, and a browser may reclaim them at any time. WebKit's storage
 *   persistence API is documented but has been reported as always returning
 *   false, and whether that still happens is exactly what this measures.
 *
 * Everything here is observational: it reads state and never writes, deletes or
 * warms anything, so running it cannot change the answer it reports.
 */

import { trocrCacheUrls } from "@/src/lib/receipt-ocr-model";

/**
 * Caches the scanner populates; names come from the libraries that own them.
 */
export const DETECTOR_CACHE_NAME = "receipt-ocr";
export const TRANSFORMERS_CACHE_NAME = "transformers-cache";

export interface GpuDiagnostics {
  /** `navigator.gpu` exists at all. */
  apiPresent: boolean;
  /** An adapter was returned; without one nothing can run on the GPU. */
  adapterAvailable: boolean;
  adapterInfo: string | null;
  /** Feature names the adapter reports, e.g. `shader-f16`. */
  features: string[];
  error: string | null;
}

export interface StorageDiagnostics {
  /**
   * What `navigator.storage.persist()` answered, or `null` when the API is
   * absent. On WebKit this has been reported as always false — the point of
   * measuring is that the report may no longer hold.
   */
  persistGranted: boolean | null;
  /** What `navigator.storage.persisted()` reports now. */
  alreadyPersisted: boolean | null;
  quotaBytes: number | null;
  usageBytes: number | null;
  cacheStorageAvailable: boolean;
  error: string | null;
}

export interface CachedModelDiagnostics {
  /** Detection model and runtime, cached by this app under `receipt-ocr`. */
  detectorCached: boolean;
  detectorBytes: number;
  /** Recognition weights as transformers.js stores them. */
  recogniserCached: boolean;
  recogniserFiles: number;
  /** Weight files the recogniser fetches; used to interpret `recogniserFiles`. */
  recogniserExpectedFiles: number;
  error: string | null;
}

export interface ScanDiagnostics {
  gpu: GpuDiagnostics;
  storage: StorageDiagnostics;
  models: CachedModelDiagnostics;
  /** When this snapshot was taken, for comparing before/after eviction. */
  capturedAt: string;
}

/**
 * Probes WebGPU.
 *
 * `requestAdapter` is the only honest test: `navigator.gpu` can be present while
 * no adapter is obtainable — which is the reported situation in some embedded
 * web views — and a version check would miss that entirely.
 */
export async function probeGpu(): Promise<GpuDiagnostics> {
  const gpu = (navigator as Navigator & { gpu?: WebGpuLike }).gpu;

  if (!gpu) {
    return {
      apiPresent: false,
      adapterAvailable: false,
      adapterInfo: null,
      features: [],
      error: null,
    };
  }

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        apiPresent: true,
        adapterAvailable: false,
        adapterInfo: null,
        features: [],
        error: "navigator.gpu exists but returned no adapter",
      };
    }

    return {
      apiPresent: true,
      adapterAvailable: true,
      adapterInfo: describeAdapter(adapter),
      features: [...(adapter.features ?? [])],
      error: null,
    };
  } catch (error) {
    return {
      apiPresent: true,
      adapterAvailable: false,
      adapterInfo: null,
      features: [],
      error: error instanceof Error ? error.message : "requestAdapter failed",
    };
  }
}

/**
 * Minimal WebGPU surface, declared rather than pulled from `@webgpu/types`:
 * the probe needs four members, and adding a global type package for them would
 * change how every other file sees `navigator`.
 */
interface WebGpuLike {
  requestAdapter(): Promise<WebGpuAdapterLike | null>;
}

interface WebGpuAdapterLike {
  features?: Iterable<string>;
  info?: { vendor?: string; architecture?: string; description?: string };
  requestAdapterInfo?: () => Promise<{
    vendor?: string;
    architecture?: string;
    description?: string;
  }>;
}

function describeAdapter(adapter: WebGpuAdapterLike): string {
  const info = adapter.info;
  if (info) {
    const parts = [info.vendor, info.architecture, info.description].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
  }
  return "adapter reported, no details";
}

/**
 * Probes origin storage.
 *
 * `persist()` is called because its return value is the only way to learn
 * whether the browser will protect the cached models: a refusal means every scan
 * risks re-downloading them, and there is no other signal for that.
 */
export async function probeStorage(): Promise<StorageDiagnostics> {
  const result: StorageDiagnostics = {
    persistGranted: null,
    alreadyPersisted: null,
    quotaBytes: null,
    usageBytes: null,
    cacheStorageAvailable: typeof caches !== "undefined",
    error: null,
  };

  try {
    const manager = navigator.storage as StorageManager | undefined;

    if (manager?.persisted) {
      result.alreadyPersisted = await manager.persisted();
    }

    if (manager?.persist) {
      result.persistGranted = await manager.persist();
    }

    if (manager?.estimate) {
      const estimate = await manager.estimate();
      result.quotaBytes = estimate.quota ?? null;
      result.usageBytes = estimate.usage ?? null;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "storage probe failed";
  }

  return result;
}

/**
 * Counts the cached scanner assets in both caches.
 *
 * The recogniser is counted by matching its own URLs rather than by opening the
 * cache and listing keys, because the cache is shared with any other
 * transformers.js model on the origin and an aggregate size would attribute
 * another model's bytes to this feature.
 */
export async function probeCachedModels(): Promise<CachedModelDiagnostics> {
  const urls = trocrCacheUrls();
  const result: CachedModelDiagnostics = {
    detectorCached: false,
    detectorBytes: 0,
    recogniserCached: false,
    recogniserFiles: 0,
    recogniserExpectedFiles: urls.length,
    error: null,
  };

  if (typeof caches === "undefined") {
    result.error = "Cache Storage unavailable in this context";
    return result;
  }

  try {
    const detectorCache = await caches.open(DETECTOR_CACHE_NAME);
    const detectorKeys = await detectorCache.keys();
    // `keys()` rather than a fixed URL list so a cached asset at a stale path is
    // still counted, which is what makes "present but will 404" visible.
    for (const request of detectorKeys) {
      const response = await detectorCache.match(request);
      if (!response) continue;
      result.detectorCached = true;
      const length = Number(response.headers.get("content-length") ?? 0);
      result.detectorBytes += Number.isFinite(length) ? length : 0;
    }

    const transformersCache = await caches.open(TRANSFORMERS_CACHE_NAME);
    for (const url of urls) {
      if (await transformersCache.match(url)) result.recogniserFiles++;
    }
    result.recogniserCached = result.recogniserFiles === urls.length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "cache probe failed";
  }

  return result;
}

/** Takes one snapshot of everything the scanner depends on. */
export async function probeScanEnvironment(): Promise<ScanDiagnostics> {
  const [gpu, storage, models] = await Promise.all([
    probeGpu(),
    probeStorage(),
    probeCachedModels(),
  ]);

  return { gpu, storage, models, capturedAt: new Date().toISOString() };
}

/** Formats a byte count for display; `null` unknown, `0` means nothing stored. */
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
