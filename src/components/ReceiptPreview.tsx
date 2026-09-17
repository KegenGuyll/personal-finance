"use client";

/**
 * Shows the photo the model was given.
 *
 * Previously this showed a preprocessed copy, because the old pipeline rescaled
 * and contrast-normalised the image before recognising text and a wrong value was
 * often explained by the preprocessing. That step no longer exists: the model
 * receives the original bytes, so the useful reference is the photo itself.
 *
 * It stays because it answers the question a user actually has when a value looks
 * wrong — "did it even see my receipt?" — which the image answers instantly and
 * no error message can.
 */
export default function ReceiptPreview({
  dataUrl,
  slow,
}: {
  /** Object URL of the original file. */
  dataUrl: string;
  /** True when the model ran on the WASM fallback rather than WebGPU. */
  slow?: boolean;
}) {
  return (
    <div className="rounded-lg border border-space-indigo-100 bg-white p-3">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote asset next/image can optimise */}
        <img
          src={dataUrl}
          alt="The receipt photo that was read"
          className="h-28 w-20 shrink-0 rounded border border-space-indigo-100 object-cover"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-space-indigo-700">
            This is the photo that was read
          </p>
          <p className="mt-1 text-[10px] text-space-indigo-400">
            Read whole by an on-device model, at the original resolution.
          </p>

          {slow && (
            <p className="mt-2 text-[10px] text-amber-700">
              No GPU was available, so this ran on the CPU and will be slow. It
              still works — it just takes much longer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
