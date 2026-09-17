/**
 * Turns raw OCR detections into receipt rows.
 *
 * The detector returns one box per text run, so the text alone loses the thing
 * that matters most on a receipt: which number belongs to which label. Sorting
 * by position and grouping boxes that share a line recovers that — "TOTAL" on
 * the left and "54.32" on the right become one row — which is what lets a
 * deterministic parser find the total without a language model.
 *
 * Pure and dependency-free so it can be tested directly under `node --test`.
 */

/** A detected text box in image pixel coordinates. */
export interface ReceiptBox {
  text: string;
  /** Normalised 0–1 recogniser confidence. */
  confidence: number;
  /** Left edge, in pixels. */
  x: number;
  /** Top edge, in pixels. */
  y: number;
  width: number;
  height: number;
}

/** A set of boxes that sit on the same line of the receipt. */
export interface ReceiptRow {
  /** Boxes ordered left to right. */
  boxes: ReceiptBox[];
  /** Row text, boxes joined by a single space. */
  text: string;
  /** Mean box confidence. */
  confidence: number;
  /** Distance from the top of the image, in pixels. */
  y: number;
  /** Leftmost box's text, when the row looks like a "label  value" pair. */
  label: string | null;
  /** The value a label is paired with. */
  value: string | null;
}

/**
 * A row is read as "label ... value" when it has at least two boxes and the
 * rightmost box looks like an amount, so an all-text row ("THANK YOU") is never
 * mistaken for a priced one.
 */
const VALUE_PATTERN = /^[$€£]?\s?-?\d[\d.,]*(?:\s?(?:USD|EUR|GBP))?$/i;

function looksLikeValue(text: string): boolean {
  return VALUE_PATTERN.test(text.trim());
}

function isEmptyText(box: ReceiptBox): boolean {
  return box.text.trim().length === 0;
}

/**
 * Groups boxes into rows by vertical overlap.
 *
 * Boxes are matched greedily against the nearest line rather than by a fixed
 * y-bucket: receipts are photographed at an angle, so a row drifts vertically
 * across the image and a bucket boundary would split it in half.
 */
export function groupIntoRows(boxes: ReceiptBox[]): ReceiptRow[] {
  const usable = boxes.filter((box) => !isEmptyText(box));
  if (usable.length === 0) return [];

  const sorted = [...usable].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2)
  );

  const groups: ReceiptBox[][] = [];
  for (const box of sorted) {
    const group = groups[groups.length - 1];
    if (group && overlapsVertically(group, box)) {
      group.push(box);
    } else {
      groups.push([box]);
    }
  }

  return groups.map((group) => buildRow(group));
}

/**
 * Treats a box as part of the previous row when their vertical centres are
 * close relative to line height.
 *
 * Centre proximity rather than span overlap: a tilted photo shifts a value box
 * down by more than half its height without moving it to the next printed line,
 * so an overlap test splits single rows in two. Single-spaced receipts put line
 * centres roughly one height apart, which is why the tolerance stays below 1.
 */
function overlapsVertically(row: ReceiptBox[], box: ReceiptBox): boolean {
  const centre =
    row.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / row.length;
  const boxCentre = box.y + box.height / 2;
  const typicalHeight =
    row.reduce((sum, entry) => sum + entry.height, 0) / row.length;

  return Math.abs(boxCentre - centre) <= typicalHeight * 0.8;
}

function buildRow(group: ReceiptBox[]): ReceiptRow {
  const boxes = [...group].sort((a, b) => a.x - b.x);
  const { label, value } = pairLabelAndValue(boxes);

  return {
    boxes,
    text: boxes
      .map((box) => box.text.trim())
      .filter(Boolean)
      .join(" "),
    confidence:
      boxes.reduce((sum, box) => sum + box.confidence, 0) / boxes.length,
    y: Math.min(...boxes.map((box) => box.y)),
    label,
    value,
  };
}

/**
 * Splits a row into the thing being described and the number describing it.
 *
 * The rightmost amount wins rather than the leftmost, because receipt rows often
 * carry several numbers ("1 12.99 12.99") where only the last one is the line
 * total. Everything left of the value becomes the label, so "SUBTOTAL" rows
 * keep enough context for the parser to exclude them.
 */
function pairLabelAndValue(boxes: ReceiptBox[]): {
  label: string | null;
  value: string | null;
} {
  if (boxes.length < 2) return { label: null, value: null };

  let valueIndex = -1;
  for (let i = boxes.length - 1; i >= 0; i--) {
    if (looksLikeValue(boxes[i].text)) {
      valueIndex = i;
      break;
    }
  }
  if (valueIndex <= 0) return { label: null, value: null };

  const label = boxes
    .slice(0, valueIndex)
    .map((box) => box.text.trim())
    .filter(Boolean)
    .join(" ");

  return {
    label: label || null,
    value: boxes[valueIndex].text.trim(),
  };
}

/**
 * True when a row carries no value but does carry text — a heading, address or
 * footer. The parser uses this to tell a shop name from a priced line.
 */
export function isTextOnly(row: ReceiptRow): boolean {
  return row.value === null;
}

/**
 * Mean confidence across every box, weighted by text length so a long misread
 * line counts for more than a short one. Returns 0 when there is no text.
 */
export function meanConfidence(boxes: ReceiptBox[]): number {
  let weighted = 0;
  let total = 0;

  for (const box of boxes) {
    const weight = box.text.trim().length;
    weighted += box.confidence * weight;
    total += weight;
  }

  return total === 0 ? 0 : weighted / total;
}
