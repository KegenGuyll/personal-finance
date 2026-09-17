"use client";

/**
 * A breadcrumb log that survives the tab being killed.
 *
 * The scan crashes on a real device in a way that cannot be reproduced here, and
 * the failure destroys the evidence: the page reloads and anything held in memory
 * — including the error — goes with it.
 *
 * Progress is therefore persisted as it happens, in the **Cache API**, for one
 * specific reason: this runs inside the inference Worker. `localStorage` is not
 * available there at all, so a log written through it would be silent for exactly
 * the steps that matter — model load and generation. `sessionStorage` and
 * `IndexedDB` have the same problem, and `IndexedDB` is async at a moment when a
 * crash may be milliseconds away.
 *
 * The Cache API is available in both contexts and its writes survive a reload, so
 * the last entry recorded before a crash is the last step that completed. That is
 * the single most useful fact available.
 */

const CACHE_NAME = "receipt-scan-diagnostics";
const LOG_URL = "/__receipt-scan-log";
const MAX_ENTRIES = 80;

export interface Breadcrumb {
  /** Milliseconds since the log was started. */
  at: number;
  step: string;
  detail?: string;
}

let startedAt = Date.now();

function cachesAvailable(): boolean {
  return typeof caches !== "undefined";
}

async function read(): Promise<Breadcrumb[]> {
  if (!cachesAvailable()) return [];

  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(LOG_URL);
    if (!response) return [];

    const parsed: unknown = await response.json();
    return Array.isArray(parsed) ? (parsed as Breadcrumb[]) : [];
  } catch {
    return [];
  }
}

async function write(entries: Breadcrumb[]): Promise<void> {
  if (!cachesAvailable()) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      LOG_URL,
      new Response(JSON.stringify(entries.slice(-MAX_ENTRIES)), {
        headers: { "content-type": "application/json" },
      })
    );
  } catch {
    // Quota or a private-mode refusal. Losing the log is acceptable; throwing at
    // the moment of a crash is not.
  }
}

/**
 * Records one step.
 *
 * Deliberately not awaited by callers: a breadcrumb must never be the thing that
 * fails a scan, and the write is fire-and-forget by design. Callers record on both
 * sides of anything that can fail, so a missing trailing entry is itself the
 * signal.
 */
export function breadcrumb(step: string, detail?: string): void {
  void (async () => {
    const entries = await read();
    entries.push({ at: Date.now() - startedAt, step, detail });
    await write(entries);
  })();
}

/** Marks the beginning of a scan, so each run is separable in the log. */
export function startScanLog(): void {
  startedAt = Date.now();
  void write([]);
  breadcrumb("scan:start", describeEnvironment());
}

/** Everything known about the device before any work begins. */
export function describeEnvironment(): string {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  return [
    `ua=${typeof navigator === "undefined" ? "?" : nav.userAgent}`,
    `cores=${nav.hardwareConcurrency ?? "?"}`,
    `mem=${nav.deviceMemory ?? "?"}`,
    `gpu=${typeof nav.gpu !== "undefined"}`,
    `secure=${typeof isSecureContext === "undefined" ? "?" : isSecureContext}`,
  ].join(" ");
}

export function readBreadcrumbs(): Promise<Breadcrumb[]> {
  return read();
}

export function clearBreadcrumbs(): Promise<void> {
  return write([]);
}

/**
 * Describes the GPU adapter, including the buffer limits that decide whether a
 * model this size can be uploaded at all.
 */
export async function describeGpu(): Promise<string> {
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) return "no navigator.gpu";

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return "no adapter";

    const info = adapter.info;
    const parts = [
      `vendor=${info?.vendor ?? "?"}`,
      `arch=${info?.architecture ?? "?"}`,
      `f16=${adapter.features?.has("shader-f16") ?? "?"}`,
    ];

    const limits = adapter.limits;
    if (limits) {
      parts.push(`maxBufferMB=${Math.round((limits.maxBufferSize ?? 0) / 1e6)}`);
      parts.push(
        `maxStorageMB=${Math.round((limits.maxStorageBufferBindingSize ?? 0) / 1e6)}`
      );
    }

    return parts.join(" ");
  } catch (error) {
    return `adapter probe failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

interface GpuLike {
  requestAdapter(options?: {
    powerPreference?: "low-power" | "high-performance";
  }): Promise<GpuAdapterLike | null>;
}

interface GpuAdapterLike {
  features?: { has(feature: string): boolean };
  info?: { vendor?: string; architecture?: string; description?: string };
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
  };
}
