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
/**
 * How much of the start of a run survives trimming.
 *
 * Covers the steps before generation, which are what make the token positions under
 * them mean anything. Trimming only from the tail would drop the device line first —
 * at exactly the moment a late crash is being read.
 */
const MAX_HEAD = 12;
/** Stands where trimming removed steps, so the seam is not read as one long step. */
const ELISION_STEP = "log:elided";

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
  /**
   * Steps appended since this page load began, including any trimming discarded.
   *
   * Carried because the entries cannot say it for themselves: once trimmed, the only
   * record of how much is gone is this count.
   */
  written?: number;
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

/**
 * Trims one page load's entries, keeping both ends.
 *
 * A full generation logs every token to 32 and every 32nd after, which on its own
 * exceeds `MAX_ENTRIES` — so a plain tail slice cuts the setup off the front of a
 * long run. The middle is what goes instead, and it goes visibly: a silent jump in
 * the timestamps is indistinguishable from a step that merely took a long time,
 * which is the misreading this log has already produced once.
 *
 * The dropped count comes from the session's tally rather than from this array.
 * Entries are appended one at a time and every append re-trims, so the previous
 * call's marker has already been discarded by the time the next one counts — it
 * would report what this write dropped, not what is missing.
 */
function trimEntries(session: BreadcrumbSession): Breadcrumb[] {
  const { entries } = session;
  if (entries.length <= MAX_ENTRIES) return entries;

  // The marker occupies one of the slots, so one fewer step is held than the cap.
  const held = MAX_ENTRIES - 1;
  const dropped = (session.written ?? entries.length) - held;

  return [
    ...entries.slice(0, MAX_HEAD),
    { at: entries[MAX_HEAD].at, step: ELISION_STEP, detail: dropped + " steps dropped" },
    ...entries.slice(-(MAX_ENTRIES - MAX_HEAD - 1)),
  ];
}

function write(sessions: BreadcrumbSession[]): void {
  try {
    const kept = sessions
      .slice()
      .sort((a, b) => a.id - b.id)
      .slice(-MAX_SESSIONS)
      .map((session) => ({
        id: session.id,
        entries: trimEntries(session),
        written: session.written,
      }));

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
  const session = currentSession(sessions);
  session.entries.push({
    at: Date.now() - SESSION_STARTED_AT,
    step,
    detail,
  });
  session.written = (session.written ?? 0) + 1;
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
  const session = currentSession(sessions);
  session.entries = [];
  session.written = 0;
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
 * Identity of the page load doing the reading.
 *
 * It is usually missing from the stored sessions, because the log is worth reading
 * exactly when this page load has logged nothing yet: a crash reloads the page, and
 * nothing runs until the user acts. Callers need the id rather than the last
 * position, or the run that died gets labelled as the page load now showing it.
 */
export function currentBreadcrumbSessionId(): number {
  return SESSION_STARTED_AT;
}

/**
 * Removes every stored page load, including ones this page load never wrote.
 *
 * Deliberately not scoped like `startScanLog`, which spares other page loads so a
 * crash stays readable. This is the discard the reader asked for: it exists so a
 * spent run stops showing up, and holding back sessions the button appears to
 * remove would defeat that.
 */
export function clearBreadcrumbs(): void {
  write([]);
}

/**
 * Records the page being hidden or torn down, until the returned teardown runs.
 *
 * A tab the system reclaims for memory dies without firing any of this, so its
 * absence beside a crash is itself evidence: the kill was not a backgrounding. If
 * one of these lines does turn up next to a crash, the answer changes completely —
 * nothing to do with inference, and nothing a smaller model would fix.
 */
export function watchPageLifecycle(): () => void {
  const onVisibilityChange = () => breadcrumb("page:" + document.visibilityState);
  const onPageHide = (event: PageTransitionEvent) =>
    breadcrumb("page:hide", "bfcache=" + event.persisted);

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
  };
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
