"use client";

import { useCallback, useEffect, useState } from "react";

import { readBreadcrumbs, type Breadcrumb } from "@/src/lib/scan-breadcrumbs";

/**
 * Shows how far the last scan got, for when it does not finish.
 *
 * The scan can die in a way that leaves nothing behind — the tab is killed, the
 * page reloads, and the error is gone with the memory it lived in. The only
 * surviving evidence is the persisted step log, so surfacing it is the difference
 * between "it crashes" and knowing which step crashes.
 *
 * Rendered only in the failure path: on a working scan it would be noise.
 */
export default function ScanDiagnosticsPanel() {
  const [entries, setEntries] = useState<Breadcrumb[] | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setEntries(await readBreadcrumbs());
  }, []);

  useEffect(() => {
    // From a microtask so no setState runs in the effect body, which this
    // codebase's lint rules reject for the cascading render it causes.
    void Promise.resolve().then(load);
  }, [load]);

  if (!entries || entries.length === 0) return null;

  const text = entries
    .map((entry) => `${String(entry.at).padStart(6)}ms  ${entry.step}${entry.detail ? "  " + entry.detail : ""}`)
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

  return (
    <details className="mt-3 rounded-md border border-space-indigo-100 bg-space-indigo-50 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-medium text-space-indigo-500">
        What the scan did before it stopped ({entries.length} steps)
      </summary>

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
