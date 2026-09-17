"use client";

import { useState } from "react";

import { readBreadcrumbs } from "@/src/lib/scan-breadcrumbs";

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
 * Rendered only in the failure path; on a working scan it would be noise.
 */
export default function ScanFailureDiagnostics() {
  // Read once, synchronously: the log is already durable by the time this renders.
  const [entries] = useState(() => readBreadcrumbs());
  const [copied, setCopied] = useState(false);

  if (entries.length === 0) return null;

  const text = entries
    .map(
      (entry) =>
        `${String(entry.at).padStart(6)}ms  ${entry.step}${entry.detail ? "  " + entry.detail : ""}`
    )
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the log is still on screen to read.
    }
  };

  const last = entries[entries.length - 1];

  return (
    <details className="mt-3 rounded-md border border-space-indigo-100 bg-space-indigo-50 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-medium text-space-indigo-500">
        What the last scan did before it stopped ({entries.length} steps)
      </summary>

      <p className="mt-2 text-[10px] text-amber-700">
        Last step: <span className="font-medium">{last.step}</span>
        {last.detail ? ` — ${last.detail}` : ""}
      </p>

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
