import type {
  SyncItemResult,
  SyncSummary,
} from "@/src/hooks/useSyncAllTransactions";

interface SyncIndicatorProps {
  isSyncing: boolean;
  currentLabel: string | null;
  results: SyncItemResult[];
  total: number;
  addedCount: number;
  summary: SyncSummary | null;
}

export default function SyncIndicator({
  isSyncing,
  currentLabel,
  results,
  total,
  addedCount,
  summary,
}: SyncIndicatorProps) {
  if (!isSyncing && summary) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-cornflower-blue-600">
        <span aria-hidden>✓</span>
        Sync complete &mdash; {summary.synced} updated
        {summary.skipped > 0 ? `, ${summary.skipped} up to date` : ""}
        {summary.errors > 0 ? `, ${summary.errors} failed` : ""}
      </span>
    );
  }

  const done = results.length;
  const updated = results.filter((r) => r.status === "synced").length;

  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-space-indigo-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-space-indigo-200 border-t-cornflower-blue-500" />
      <span>
        {currentLabel ? `Syncing ${currentLabel}…` : "Syncing…"}
        {total > 0 && (
          <span className="text-space-indigo-300">
            {" "}
            ({Math.min(done + 1, total)}/{total})
          </span>
        )}
      </span>
      {addedCount > 0 && (
        <span className="text-space-indigo-300">· {addedCount} new</span>
      )}
      {updated > 0 && (
        <span className="text-space-indigo-300">· {updated} updated</span>
      )}
    </span>
  );
}
