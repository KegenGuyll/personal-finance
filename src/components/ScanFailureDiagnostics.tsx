"use client";

import { useState } from "react";

import {
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
  const [sessions] = useState(() => readBreadcrumbSessions());
  const [copied, setCopied] = useState(false);

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
        <button
          type="button"
          onClick={copy}
          className="text-[10px] font-medium text-cornflower-blue-600 hover:text-cornflower-blue-700"
        >
          {copied ? "Copied" : "Copy"}
        </button>
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

/** The copyable log: one block per page load, so a seam is never ambiguous. */
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
        `── ${sessionLabel(index, currentIndex, sessions.length)} (${count} step${
          count === 1 ? "" : "s"
        }) ──`,
        ...lines,
      ].join("\n");
    })
    .join("\n\n");
}
