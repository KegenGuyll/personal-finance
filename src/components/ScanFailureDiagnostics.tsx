"use client";

import { useState } from "react";

import {
  clearBreadcrumbs,
  currentBreadcrumbSessionId,
  readBreadcrumbSessions,
  type BreadcrumbSession,
} from "@/src/lib/scan-breadcrumbs";

/**
 * Shows how far the last scan got, for when it does not finish.
 *
 * The scan can die in a way that leaves nothing else behind: the renderer is
 * killed, the page reloads, and the error goes with the memory it lived in. The
 * only surviving evidence is the step log, so surfacing it is the difference
 * between "it crashes" and knowing which step crashes.
 *
 * The read is synchronous and happens on mount, so what is shown is what the last
 * run actually persisted — including a run that ended by killing the process.
 *
 * Shown whatever the download state, because the crash that leaves a log behind
 * also empties the model cache. Hiding this behind "ready" would put the evidence
 * behind the 316MB download that the crash itself forced.
 *
 * Each page load gets its own heading, told apart by identity rather than by
 * position: a crash reloads the page, so the run worth reading is usually the one
 * before this page load, which has not logged anything yet.
 */
export default function ScanFailureDiagnostics() {
  // Read once, synchronously: the log is already durable by the time this renders.
  const [sessions, setSessions] = useState(() => readBreadcrumbSessions());
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (sessions.length === 0) return null;

  // -1 when this page load has logged nothing yet, which is the usual state after a
  // crash: nothing has run since the reload.
  const currentIndex = sessions.findIndex(
    (session) => session.id === currentBreadcrumbSessionId()
  );
  // The run a reload interrupted. With none, the only thing to point at is this
  // page load's own.
  const interruptedIndex = currentIndex === -1 ? sessions.length - 1 : currentIndex - 1;
  const focusIndex = interruptedIndex >= 0 ? interruptedIndex : Math.max(currentIndex, 0);

  const text = describeSessions(sessions, currentIndex);
  const steps = sessions.reduce((total, session) => total + session.entries.length, 0);
  const scope =
    sessions.length > 1
      ? `${steps} steps across ${sessions.length} page loads`
      : `${steps} steps`;

  const focused = sessions[focusIndex];
  const last = focused.entries[focused.entries.length - 1];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the log is still on screen to read.
    }
  };

  // Two taps. This store holds the only copy of what a crash did, and on a phone a
  // stray tap on a 10px target would destroy it with nothing to restore from.
  const clear = () => {
    if (!clearing) {
      setClearing(true);
      setTimeout(() => setClearing(false), 3000);
      return;
    }

    clearBreadcrumbs();
    setSessions([]);
  };

  return (
    <details className="mt-3 rounded-md border border-space-indigo-100 bg-space-indigo-50 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-medium text-space-indigo-500">
        What the last scan did before it stopped ({scope})
      </summary>

      {last && (
        <p className="mt-2 text-[10px] text-amber-700">
          {interruptedIndex >= 0 ? "Last step before the reload: " : "Last step: "}
          <span className="font-medium">{last.step}</span>
          {last.detail ? ` — ${last.detail}` : ""}
        </p>
      )}

      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-tight text-space-indigo-700">
        {text}
      </pre>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-space-indigo-400">
          Last line = last step that completed
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="text-[10px] font-medium text-cornflower-blue-600 hover:text-cornflower-blue-700"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={clear}
            className="text-[10px] font-medium text-amber-700 hover:text-amber-800"
          >
            {clearing ? "Clear?" : "Clear"}
          </button>
        </div>
      </div>
    </details>
  );
}

/**
 * Names a page load from the reader's position. `currentIndex` of -1 means this page
 * load has not logged anything, which makes the newest stored one the run before it.
 */
function sessionLabel(index: number, currentIndex: number, total: number): string {
  if (index === currentIndex) return "this page load";

  const interrupted = currentIndex === -1 ? total - 1 : currentIndex - 1;
  if (index === interrupted) return "the page load before this one";

  return `page load ${index + 1} of ${total}`;
}

/**
 * The copyable log: one block per page load, so a seam is never ambiguous.
 *
 * The idle time between blocks is stated rather than left to be inferred, because
 * each block's timestamps are relative to its own page load and reading across the
 * seam as one clock is exactly the mistake this grouping exists to prevent.
 */
function describeSessions(sessions: BreadcrumbSession[], currentIndex: number): string {
  return sessions
    .map((session, index) => {
      const count = session.entries.length;
      const lines = session.entries.map(
        (entry) =>
          `${String(entry.at).padStart(6)}ms  ${entry.step}${
            entry.detail ? "  " + entry.detail : ""
          }`
      );

      return [
        ...(index === 0 ? [] : [`──── ${describeIdle(sessions[index - 1], session)} ────`]),
        `── ${sessionLabel(index, currentIndex, sessions.length)} (${count} step${
          count === 1 ? "" : "s"
        } · ${clockOf(session.id)}) ──`,
        ...lines,
      ].join("\n");
    })
    .join("\n\n");
}

/** When a page load started, so the log lines up with anything else observed. */
function clockOf(id: number): string {
  return new Date(id).toTimeString().slice(0, 8);
}

/**
 * Time between one page load's last step and the next page load starting.
 *
 * Elapsed time only, deliberately. It contains both the process dying and however
 * long it was before the page came back, so it bounds the death from above rather
 * than timing it — read as a duration of the crash it would overstate every one.
 */
function describeIdle(previous: BreadcrumbSession, next: BreadcrumbSession): string {
  const last = previous.entries[previous.entries.length - 1];
  if (!last) return "later";

  const gap = next.id - (previous.id + last.at);
  if (gap < 1000) return Math.max(Math.round(gap), 0) + "ms later";
  if (gap < 60000) return (gap / 1000).toFixed(1) + "s later";

  return Math.round(gap / 60000) + "min later";
}
