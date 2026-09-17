"use client";

import type { Account, Transaction } from "@/src/features/plaid/plaidSlice";
import { useCategories } from "@/src/hooks/useCategories";
import { useModelsReady } from "@/src/hooks/useModelsReady";
import { useReceiptScan } from "@/src/hooks/useReceiptScan";
import ImageDropZone from "@/src/components/ImageDropZone";
import ReceiptPreview from "@/src/components/ReceiptPreview";
import ReceiptReviewForm from "@/src/components/ReceiptReviewForm";

export interface ScanReceiptModalProps {
  accounts: Account[];
  defaultAccountId?: string;
  fallbackAccount?: Account | null;
  onClose: () => void;
  onSaved: (transaction: Transaction) => void;
  /** Escape hatch to the plain manual-entry form, with nothing pre-filled. */
  onManualEntry: () => void;
}

/**
 * Reads a receipt photo and hands the extracted fields to a pre-filled form.
 *
 * The scan is entirely local — the models and the recognition both run in the
 * browser — so the only network traffic this feature causes is the one-time
 * model download, which is requested here explicitly rather than discovered
 * mid-scan when the user is waiting on a progress bar.
 *
 * Every failure path offers a way forward (manual entry, or pasting text), so a
 * missing model or an unreadable photo costs the user a retry, not the ability
 * to record the transaction.
 */
export default function ScanReceiptModal({
  accounts,
  defaultAccountId,
  fallbackAccount,
  onClose,
  onSaved,
  onManualEntry,
}: ScanReceiptModalProps) {
  const { data: categoryData } = useCategories();
  const models = useModelsReady();
  const scan = useReceiptScan(categoryData?.categories);

  const handleSaved = (transaction: Transaction) => {
    onSaved(transaction);
    onClose();
  };

  const needsDownload = models.isCached === false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-space-indigo-900/40 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-space-indigo-100 bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-space-indigo-800">
          {scan.stage === "review" ? "Check the scanned receipt" : "Scan a receipt"}
        </h3>
        <p className="mt-1 text-sm text-space-indigo-400">
          {scan.stage === "review"
            ? "Correct anything the scan got wrong, then add it."
            : "The photo is read on this device — it is never uploaded."}
        </p>

        {scan.stage === "pick" && (
          <>
            {needsDownload && (
              <div className="mt-4 rounded-lg border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-3">
                <p className="text-xs font-medium text-soft-periwinkle-800">
                  One-time setup: download the on-device OCR model (~25MB)
                </p>
                <p className="mt-1 text-[10px] text-soft-periwinkle-700">
                  Stored in this browser and reused for every later scan, including
                  offline.
                </p>

                {models.error && (
                  <p className="mt-2 text-[10px] text-space-indigo-700">{models.error}</p>
                )}

                <button
                  type="button"
                  onClick={models.prepare}
                  disabled={models.isPreparing}
                  className="mt-3 rounded-lg bg-space-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-space-indigo-700 disabled:opacity-50"
                >
                  {models.isPreparing
                    ? `Downloading ${models.progress.loaded}/${models.progress.total}…`
                    : "Download the OCR model"}
                </button>
              </div>
            )}

            <div className="mt-4">
              <ImageDropZone onSelect={scan.scanFile} disabled={scan.stage !== "pick"} />
            </div>

            {scan.error && (
              <p className="mt-3 rounded-md border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-2 text-xs text-soft-periwinkle-800">
                {scan.error}
              </p>
            )}
          </>
        )}

        {scan.stage === "reading" && (
          <div className="mt-4">
            {scan.preview && (
              <ReceiptPreview dataUrl={scan.preview.dataUrl} quality={scan.preview.quality} />
            )}

            <div className="mt-4 rounded-lg border border-space-indigo-100 bg-space-indigo-50 px-3 py-3">
              <p className="text-xs font-medium text-space-indigo-700">
                {scan.progress ?? "Reading the receipt…"}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-space-indigo-100">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-cornflower-blue-500" />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={scan.cancel}
                className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
              >
                Cancel scan
              </button>
            </div>
          </div>
        )}

        {scan.stage === "review" && scan.result && (
          <div className="mt-4">
            {scan.preview && (
              <div className="mb-3">
                <ReceiptPreview dataUrl={scan.preview.dataUrl} quality={scan.preview.quality} />
              </div>
            )}

            <ReceiptReviewForm
              draft={scan.result.draft}
              confidence={scan.result.confidence}
              notes={scan.result.notes}
              quality={scan.result.quality}
              accounts={accounts}
              defaultAccountId={defaultAccountId}
              fallbackAccount={fallbackAccount}
              onSaved={handleSaved}
              onBack={scan.reset}
            />
          </div>
        )}

        {scan.stage !== "review" && (
          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              onClick={onManualEntry}
              className="text-xs font-medium text-space-indigo-500 underline transition-colors hover:text-space-indigo-700"
            >
              Enter it by hand instead
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
