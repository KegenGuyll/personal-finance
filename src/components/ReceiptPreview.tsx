"use client";

import { describeQuality, type QualityStats } from "@/src/lib/receipt-ocr-image";

/**
 * Shows the image the scanner actually read, not the one the user chose.
 *
 * Preparation rescales and re-exposes the photo before OCR, so when a value
 * comes out wrong the fastest explanation is to look at what the recogniser
 * saw. That is the whole reason this preview exists rather than a thumbnail of
 * the original file.
 */
export default function ReceiptPreview({
  dataUrl,
  quality,
}: {
  dataUrl: string;
  quality: QualityStats;
}) {
  const warnings = describeQuality(quality);

  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-3">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, not a remote asset next/image can optimise */}
        <img
          src={dataUrl}
          alt="The receipt as the scanner read it"
          className="h-28 w-20 shrink-0 rounded border border-space-indigo-100 object-cover"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-space-indigo-700">
            This is the image the scanner read
          </p>
          <p className="mt-1 text-[10px] text-space-indigo-400">
            Downscaled and contrast-normalised for text recognition.
          </p>

          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {warnings.map((warning) => (
                <li key={warning} className="text-[10px] text-amber-700">
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
