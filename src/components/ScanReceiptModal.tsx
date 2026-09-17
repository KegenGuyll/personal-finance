"use client";

import type { Account, Transaction } from "@/src/features/plaid/plaidSlice";
import { useModelReadiness } from "@/src/hooks/useModelReadiness";
import { useReceiptScan } from "@/src/hooks/useReceiptScan";
import ImageDropZone from "@/src/components/ImageDropZone";
import ScanFailureDiagnostics from "@/src/components/ScanFailureDiagnostics";
import ReceiptPreview from "@/src/components/ReceiptPreview";
import ReceiptReviewForm from "@/src/components/ReceiptReviewForm";
import ModelDownloadProgress from "@/src/components/ModelDownloadProgress";

export interface ScanReceiptModalProps {
  accounts: Account[];
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
  fallbackAccount,
  onClose,
  onSaved,
  onManualEntry,
}: ScanReceiptModalProps) {
  const models = useModelReadiness();
  const scan = useReceiptScan();

  const handleSaved = (transaction: Transaction) => {
    onSaved(transaction);
    onClose();
  };

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

        {scan.stage === "pick" && models.readiness === "checking" && (
          <p className="mt-4 text-xs text-space-indigo-400">
            Checking the on-device models…
          </p>
        )}

        {scan.stage === "pick" && models.readiness === "missing" && (
          <div className="mt-4 rounded-lg border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-3">
            <p className="text-sm font-medium text-soft-periwinkle-800">
              This needs a one-time download first
            </p>
            <p className="mt-1 text-xs text-soft-periwinkle-700">
              Scanning runs on this device, so the OCR model has to be here
              first. About 85MB, downloaded once and then reused offline.
            </p>

            <button
              type="button"
              onClick={models.startDownload}
              className="mt-3 w-full rounded-lg bg-space-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700"
            >
              Download the OCR model
            </button>
          </div>
        )}

        {scan.stage === "pick" && models.readiness === "failed" && (
          <div className="mt-4 rounded-lg border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-3">
            <p className="text-sm font-medium text-soft-periwinkle-800">
              The download did not finish
            </p>
            <p className="mt-1 text-xs text-soft-periwinkle-700">
              {models.error ?? "The model could not be downloaded."}
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={models.startDownload}
                className="rounded-lg bg-space-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-space-indigo-700"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onManualEntry}
                className="rounded-lg border border-space-indigo-200 px-4 py-2 text-sm font-medium text-space-indigo-600 transition-colors hover:bg-space-indigo-50"
              >
                Enter it by hand
              </button>
            </div>
          </div>
        )}

        {scan.stage === "pick" && models.readiness === "downloading" && (
          <div className="mt-4 rounded-lg border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-3">
            <p className="text-sm font-medium text-soft-periwinkle-800">
              Downloading the OCR model — you can keep this open
            </p>
            <p className="mt-1 text-xs text-soft-periwinkle-700">
              Scanning starts automatically once it finishes.
            </p>

            <ModelDownloadProgress progress={models.progress} isPreparing />
          </div>
        )}

        {scan.stage === "pick" && models.readiness === "ready" && (
          <>
            <div className="mt-4">
              <ImageDropZone onSelect={scan.scanFile} />
            </div>

            <ScanFailureDiagnostics />

            {scan.error && (
              <div className="mt-3 rounded-md border border-soft-periwinkle-200 bg-soft-periwinkle-50 px-3 py-2">
                <p className="text-xs text-soft-periwinkle-800">{scan.error.message}</p>
                {scan.error.rawText && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-soft-periwinkle-700">
                      What the model replied
                    </summary>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-space-indigo-600">
                      {scan.error.rawText}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </>
        )}


        {scan.stage === "reading" && (
          <div className="mt-4">
            {scan.preview && (
              <ReceiptPreview dataUrl={scan.preview.dataUrl} />
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
                <ReceiptPreview dataUrl={scan.preview.dataUrl} />
              </div>
            )}

            <ReceiptReviewForm
              draft={scan.result.draft}
              confidence={scan.result.confidence}
              notes={scan.result.notes}
              quality={scan.result.quality}
              accounts={accounts}
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
