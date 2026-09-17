/**
 * Maps the model's extraction onto the review form's contract.
 *
 * A vision-language model answers in one shot and reports no per-field signal, so
 * there is no real confidence to derive.
 *
 * Rather than invent numbers, confidence is reduced to presence:
 *
 *   field present -> 0.5  ("check")   the model read something; verify it
 *   field absent  -> 0    ("missing") the model returned null
 *
 * Every field reads "check" rather than "read" on purpose. The benchmark this
 * model was chosen from measured 74% field accuracy overall, and 61% on dates, so
 * presenting any value as verified would misrepresent it — the whole value of
 * this form is that it tells the user what to look at.
 *
 * `category` is always null because the prompt does not ask for one: the model's
 * contract is merchant/date/total/currency/tax/line_items. Categorising stays the
 * user's job on the form.
 */

import { todayIsoDate, type ManualTransactionType } from "@/src/lib/manual-transactions";
import type { ExtractedReceipt } from "@/src/lib/receipt-vlm-prompt";

/**
 * What the review form renders.
 *
 * Declared here rather than shared from elsewhere because the review form is the
 * only consumer.
 */
export interface ReceiptDraft {
  name: string;
  /** Positive magnitude; the stored sign is derived from `type` when saving. */
  amount: number | null;
  type: ManualTransactionType;
  /** YYYY-MM-DD */
  date: string;
  category: string[] | null;
}

/**
 * Per-field 0–1 confidence, as the form's badge understands it.
 *
 * Coarser than the name suggests: only 0 (absent) and 0.5 (present) are produced,
 * because a vision-language model reports no per-field confidence to convert.
 */
export interface ReceiptConfidence {
  name: number;
  amount: number;
  date: number;
  category: number;
}

/** Photo-quality warnings, retained for the form's contract. */
export interface ReceiptPhotoQuality {
  lineCount: number;
  meanConfidence: number;
  warnings: string[];
}

/** Confidence for a field the model returned, and for one it did not. */
const PRESENT = 0.5;
const ABSENT = 0;

export interface MappedExtraction {
  draft: ReceiptDraft;
  confidence: ReceiptConfidence;
  notes: string[];
  quality: ReceiptPhotoQuality;
}

/**
 * Builds the review form's inputs from the model's extraction.
 *
 * An unreadable extraction still returns a draft so the form opens for manual
 * entry, with a note saying so — reaching a dead end after a 316MB download and a
 * multi-second scan would be the worst possible outcome.
 */
export function mapExtractionToDraft(extraction: ExtractedReceipt): MappedExtraction {
  const notes: string[] = [];

  const date = extraction.date ?? todayIsoDate();
  if (!extraction.date) {
    notes.push("No date was read from the receipt — defaulted to today.");
  }

  if (extraction.total === null) {
    notes.push("No total was read — enter the amount from the receipt.");
  }

  if (!extraction.merchant) {
    notes.push("No merchant name was read.");
  }

  // The model reports no confidence, so the note is where the accuracy
  // expectation is set rather than left for the user to discover.
  notes.push(
    "Values were read by an on-device model, which is not always right — check the amount and the date."
  );

  return {
    draft: {
      name: extraction.merchant ?? "",
      amount: extraction.total === null ? null : Math.abs(extraction.total),
      // This model is not asked to classify income versus expense, and a receipt
      // is an expense far more often than anything else. Wrong guesses here are a
      // single tap to fix; a wrong *amount* is not, which is why the total gets
      // the scrutiny.
      type: "expense" as ManualTransactionType,
      date,
      category: null,
    },
    confidence: {
      name: extraction.merchant ? PRESENT : ABSENT,
      amount: extraction.total === null ? ABSENT : PRESENT,
      date: extraction.date ? PRESENT : ABSENT,
      category: ABSENT,
    },
    notes,
    // Nothing analyses the photo, so there are no quality warnings to report;
    // the model's own failures surface as notes.
    quality: { lineCount: 0, meanConfidence: 0, warnings: [] },
  };
}

/**
 * Describes output that could not be parsed at all.
 *
 * Kept separate from the mapping so a caller can distinguish "the model read the
 * receipt and the fields are imperfect" from "the model's reply was unusable",
 * which are different problems for the user to react to.
 */
export function describeUnparseableOutput(rawText: string): string {
  const preview = rawText.trim().slice(0, 120);
  return preview
    ? `The model's reply could not be read as JSON (${preview}${rawText.length > 120 ? "…" : ""}). Enter the transaction by hand.`
    : "The model returned nothing. Enter the transaction by hand.";
}
