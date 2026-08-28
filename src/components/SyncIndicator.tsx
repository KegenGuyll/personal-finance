import type { PlaidSyncResponse } from "@/src/hooks/usePlaidSync";

interface SyncIndicatorProps {
  isSyncing: boolean;
  data?: PlaidSyncResponse | null;
}

export default function SyncIndicator({
  isSyncing,
  data,
}: SyncIndicatorProps) {
  if (isSyncing) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-space-indigo-400">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-space-indigo-200 border-t-cornflower-blue-500" />
        <span>Syncing accounts…</span>
      </span>
    );
  }

  if (data) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-cornflower-blue-600">
        <span aria-hidden>✓</span>
        <span>
          Sync complete &mdash; {data.synced} updated
          {data.skipped > 0 ? `, ${data.skipped} up to date` : ""}
          {data.errors > 0 ? `, ${data.errors} failed` : ""}
          {data.totalAdded > 0 ? ` · ${data.totalAdded} new` : ""}
        </span>
      </span>
    );
  }

  return null;
}
