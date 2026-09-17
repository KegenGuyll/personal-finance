"use client";

/**
 * A step log that survives the process being killed, written synchronously.
 *
 * The scan dies on a real device in a way that takes its own evidence with it:
 * iOS kills the renderer, the page reloads, and anything held in memory — or
 * queued in an asynchronous write — is gone. An earlier version of this logged
 * through the Cache API, which was wrong for exactly that reason: `cache.put()` is
 * asynchronous, so a log written that way is the code most likely to be cut off
 * mid-flight by the crash it is meant to describe.
 *
 * `localStorage` is the only store that is synchronous and survives a reload. That
 * constrains the design in two non-obvious ways:
 *
 * 1. It does not exist in a Worker. Inference runs in one, so the worker cannot log
 *    directly; it forwards each entry and the main thread writes it.
 * 2. Being synchronous, every write blocks the main thread. Entries are therefore
 *    short and few — a dozen or so per scan, which costs nothing next to inference.
 *
 * The effect is that each step is durable the instant it completes, so the last
 * line after a crash is the last step that ran.
 */

const STORAGE_KEY = "receipt-scan:log";
const MAX_ENTRIES = 60;

export interface Breadcrumb {
  /** Milliseconds since the log was started. */
  at: number;
  step: string;
  detail?: string;
}

let startedAt = Date.now();

function read(): Breadcrumb[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Breadcrumb[]) : [];
  } catch {
    return [];
  }
}

function write(entries: Breadcrumb[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Quota or a private-mode refusal. Losing the log is acceptable; throwing at
    // the moment of a crash is not.
  }
}

/**
 * Records one step and returns only once it is durable.
 *
 * Callers log on both sides of anything that can fail, so a missing trailing entry
 * is itself the signal: the step it would have described is the one that died.
 */
export function breadcrumb(step: string, detail?: string): void {
  const entries = read();
  entries.push({ at: Date.now() - startedAt, step, detail });
  write(entries);
}

/**
 * Marks the beginning of a scan.
 *
 * Clearing first is what makes the last line unambiguous: everything present
 * belongs to the run being diagnosed, not to an earlier one.
 */
export function startScanLog(): void {
  startedAt = Date.now();
  write([]);
  breadcrumb("scan:start", describeEnvironment());
}

/** Everything known about the device before any work begins. */
export function describeEnvironment(): string {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  return [
    "gpu=" + (typeof nav.gpu !== "undefined"),
    "cores=" + (nav.hardwareConcurrency ?? "?"),
    "mem=" + (nav.deviceMemory ?? "?"),
    "secure=" + (typeof isSecureContext === "undefined" ? "?" : isSecureContext),
    "ua=" + nav.userAgent.slice(0, 80),
  ].join(" ");
}

export function readBreadcrumbs(): Breadcrumb[] {
  return read();
}

export function clearBreadcrumbs(): void {
  write([]);
}

/**
 * Describes the GPU adapter, including the buffer limits that decide whether a
 * model this size can be uploaded at all.
 *
 * The leading suspect for the crash: the decoder shard is 221MB and the
 * spec-default `maxBufferSize` is 256MB, so a device reporting a smaller limit
 * would fail at model load rather than during generation.
 */
export async function describeGpu(): Promise<string> {
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) return "no navigator.gpu";

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return "no adapter";

    const info = adapter.info;
    const parts = [
      "vendor=" + (info?.vendor ?? "?"),
      "arch=" + (info?.architecture ?? "?"),
      "f16=" + (adapter.features?.has("shader-f16") ?? "?"),
    ];

    const limits = adapter.limits;
    if (limits) {
      parts.push("maxBufferMB=" + Math.round((limits.maxBufferSize ?? 0) / 1e6));
      parts.push(
        "maxStorageMB=" + Math.round((limits.maxStorageBufferBindingSize ?? 0) / 1e6)
      );
    }

    return parts.join(" ");
  } catch (error) {
    return "adapter probe failed: " + (error instanceof Error ? error.message : String(error));
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
