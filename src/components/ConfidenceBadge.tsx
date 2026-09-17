"use client";

/**
 * Per-field confidence marker for scanned receipt values.
 *
 * The scanner's job is to make verification fast rather than to be right every
 * time, and that only works if the fields worth checking are visibly different
 * from the ones that are safe to skim. Semantic colours are used here rather
 * than the app palette: green/amber/red carry the meaning, and a shade of
 * indigo would not.
 */
export default function ConfidenceBadge({
  confidence,
  label,
}: {
  /** 0–1, where 0 means the field was not established at all. */
  confidence: number;
  label: string;
}) {
  if (confidence >= 0.8) {
    return (
      <span
        title="Read clearly from the receipt"
        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
      >
        {label}: read
      </span>
    );
  }

  if (confidence >= 0.4) {
    return (
      <span
        title="Uncertain — please check this against the receipt"
        className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
      >
        {label}: check
      </span>
    );
  }

  return (
    <span
      title="Not found on the receipt — please fill this in"
      className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700"
    >
      {label}: missing
    </span>
  );
}
