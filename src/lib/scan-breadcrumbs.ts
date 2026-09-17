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
 *    short and few — a few dozen per scan, which costs nothing next to inference.
 *
 * The effect is that each step is durable the instant it completes, so the last
 * line after a crash is the last step that ran.
 *
 * Entries are grouped by page load, because the store outlives the page. A killed
 * scan reloads the page, the reloaded page goes on logging into the same key, and
 * an ungrouped list presents those two runs as one: the killed run's last entry
 * followed directly by the new run's first, with the seam reading as a single long
 * step. That is not hypothetical — it is how a reload was once read as a
 * 3.2-second stall inside generation, which sent the search after the wrong
 * failure entirely.
 */

const STORAGE_KEY = "receipt-scan:log";
const MAX_ENTRIES = 60;
/** Enough to keep a killed run through the reloads that follow it. */
const MAX_SESSIONS = 3;

export interface Breadcrumb {
  /** Milliseconds since this page load began. */
  at: number;
  step: string;
  detail?: string;
}

/** One page load's entries. */
export interface BreadcrumbSession {
  /** Page-load identity, which is also the epoch millisecond it started. */
  id: number;
  entries: Breadcrumb[];
}

/** Identity and time origin for this page load. A reload produces a new one. */
const SESSION_STARTED_AT = Date.now();

function parse(raw: string | null): BreadcrumbSession[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Shape-checked rather than trusted: an entry written by an older version of
    // this module is not in this format, and reading it as one would produce
    // timestamps and steps that never happened.
    return parsed.filter(
      (session): session is BreadcrumbSession =>
        typeof session === "object" &&
        session !== null &&
        typeof (session as BreadcrumbSession).id === "number" &&
        Array.isArray((session as BreadcrumbSession).entries)
    );
  } catch {
    return [];
  }
}

function read(): BreadcrumbSession[] {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function write(sessions: BreadcrumbSession[]): void {
  try {
    const kept = sessions
      .slice()
      .sort((a, b) => a.id - b.id)
      .slice(-MAX_SESSIONS)
      .map((session) => ({ id: session.id, entries: session.entries.slice(-MAX_ENTRIES) }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Quota or a private-mode refusal. Losing the log is acceptable; throwing at
    // the moment of a crash is not.
  }
}

/**
 * This page load's session, added to the stored list the first time it is needed.
 *
 * Looked up by identity rather than by position so a second tab, which has its own
 * session, cannot be mistaken for this one or overwrite it.
 */
function currentSession(sessions: BreadcrumbSession[]): BreadcrumbSession {
  const existing = sessions.find((session) => session.id === SESSION_STARTED_AT);
  if (existing) return existing;

  const created: BreadcrumbSession = { id: SESSION_STARTED_AT, entries: [] };
  sessions.push(created);
  return created;
}

/**
 * Records one step and returns only once it is durable.
 *
 * Callers log on both sides of anything that can fail, so a missing trailing entry
 * is itself the signal: the step it would have described is the one that died.
 */
export function breadcrumb(step: string, detail?: string): void {
  const sessions = read();
  currentSession(sessions).entries.push({
    at: Date.now() - SESSION_STARTED_AT,
    step,
    detail,
  });
  write(sessions);
}

/**
 * Marks the beginning of a scan.
 *
 * Clears this page load only. Clearing everything would delete the previous page
 * load at the moment it is worth reading — a killed scan reloads the page, and the
 * next scan would wipe the run that needs explaining.
 */
export function startScanLog(): void {
  const sessions = read();
  currentSession(sessions).entries = [];
  write(sessions);
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

/** Every stored page load, oldest first. */
export function readBreadcrumbSessions(): BreadcrumbSession[] {
  return read().sort((a, b) => a.id - b.id);
}

/**
 * Describes the GPU adapter, including the buffer limits that bound what the
 * device can upload at all.
 *
 * Recorded rather than assumed, because the spec defaults understate what real
 * adapters report by a wide margin; the reported numbers are what separate a
 * device that cannot hold these weights from one that can.
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
