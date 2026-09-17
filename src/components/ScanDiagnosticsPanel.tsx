"use client";

import { useScanDiagnostics } from "@/src/hooks/useScanDiagnostics";
import { formatBytes } from "@/src/lib/scan-diagnostics";

/**
 * Shows what the browser is actually providing for on-device scanning.
 *
 * This exists because several assumptions behind the scanner can only be settled
 * on the device being used: whether WebGPU is really available (recognition uses
 * WASM regardless, which is slow), whether the ~72MB of cached weights survived,
 * and what `navigator.storage.persist()` answers — WebKit's implementation has
 * been reported as always refusing, and whether that still holds decides if a
 * model must be re-downloaded. Reading them here beats trusting a version number.
 *
 * The load-bearing use is the before/after comparison: scan once, then open this
 * days later. If the weights are gone, eviction is real for this usage pattern.
 */
export default function ScanDiagnosticsPanel() {
  const { snapshot, isLoading, error, refresh } = useScanDiagnostics();

  return (
    <details className="mt-4 rounded-lg border border-space-indigo-100 bg-space-indigo-50 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-medium text-space-indigo-500">
        Scan diagnostics (device storage and GPU)
      </summary>

      {isLoading && !snapshot && (
        <p className="mt-2 text-[10px] text-space-indigo-400">Reading…</p>
      )}

      {error && <p className="mt-2 text-[10px] text-red-600">{error}</p>}

      {snapshot && (
        <div className="mt-2 space-y-2 text-[10px] text-space-indigo-600">
          <section>
            <h4 className="font-medium text-space-indigo-700">Models cached</h4>
            <Row
              label="Detector + runtime"
              value={
                snapshot.models.detectorCached
                  ? `present (${formatBytes(snapshot.models.detectorBytes)})`
                  : "absent"
              }
              ok={snapshot.models.detectorCached}
            />
            <Row
              label="Recogniser weights"
              value={
                snapshot.models.recogniserCached
                  ? `present (${snapshot.models.recogniserFiles}/${snapshot.models.recogniserExpectedFiles} files)`
                  : `${snapshot.models.recogniserFiles}/${snapshot.models.recogniserExpectedFiles} files — will re-download`
              }
              ok={snapshot.models.recogniserCached}
            />
          </section>

          <section>
            <h4 className="font-medium text-space-indigo-700">WebGPU</h4>
            <Row
              label="navigator.gpu"
              value={snapshot.gpu.apiPresent ? "present" : "missing"}
              ok={snapshot.gpu.apiPresent}
            />
            <Row
              label="Adapter"
              value={snapshot.gpu.adapterAvailable ? "available" : "none returned"}
              ok={snapshot.gpu.adapterAvailable}
            />
            {snapshot.gpu.adapterInfo && (
              <p className="text-space-indigo-400">{snapshot.gpu.adapterInfo}</p>
            )}
            {snapshot.gpu.features.length > 0 && (
              <p className="text-space-indigo-400">
                f16 shading:{" "}
                {snapshot.gpu.features.includes("shader-f16") ? "yes" : "no"}
              </p>
            )}
            {!snapshot.gpu.adapterAvailable && (
              <p className="text-space-indigo-400">
                Recognition runs on WASM, which works but is slow.
              </p>
            )}
          </section>

          <section>
            <h4 className="font-medium text-space-indigo-700">Storage</h4>
            <Row
              label="persist() granted"
              value={
                snapshot.storage.persistGranted === null
                  ? "API missing"
                  : snapshot.storage.persistGranted
                    ? "yes"
                    : "refused"
              }
              ok={snapshot.storage.persistGranted === true}
            />
            <Row
              label="Already persisted"
              value={
                snapshot.storage.alreadyPersisted === null
                  ? "API missing"
                  : snapshot.storage.alreadyPersisted
                    ? "yes"
                    : "no"
              }
              ok={snapshot.storage.alreadyPersisted === true}
            />
            <p className="text-space-indigo-400">
              Used {formatBytes(snapshot.storage.usageBytes)} of{" "}
              {formatBytes(snapshot.storage.quotaBytes)} quota
            </p>
            {snapshot.storage.persistGranted === false && (
              <p className="text-amber-700">
                The browser will not protect these files — it may reclaim them,
                and the next scan would re-download.
              </p>
            )}
          </section>

          <div className="flex items-center justify-between pt-1">
            <p className="text-space-indigo-400">
              Taken {new Date(snapshot.capturedAt).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={isLoading}
              className="font-medium text-cornflower-blue-600 hover:text-cornflower-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Reading…" : "Re-check"}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}

function Row({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <p className="flex justify-between gap-2">
      <span className="text-space-indigo-400">{label}</span>
      <span className={ok ? "text-emerald-700" : "text-amber-700"}>{value}</span>
    </p>
  );
}
