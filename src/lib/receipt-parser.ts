/**
 * Turns OCR rows from a photographed receipt into a draft manual transaction.
 *
 * This is deliberately rule-based rather than model-based: the two fields that
 * have to be right on a receipt are the amount and the date, and regexes over
 * laid-out rows are repeatable and testable where a small model's guess is not.
 * Every field carries a confidence so the review form can point at the ones
 * worth checking instead of presenting a plausible wrong number as fact.
 *
 * Pure and dependency-free (bar the shared manual-transaction rules) so it runs
 * directly under `node --test`.
 */

import {
  MAX_AMOUNT,
  MAX_NAME_LENGTH,
  parseCategoryInput,
  todayIsoDate,
  type ManualTransactionType,
} from "./manual-transactions";
import {
  groupIntoRows,
  isTextOnly,
  type ReceiptBox,
  type ReceiptRow,
} from "./receipt-layout";

export type { ReceiptBox, ReceiptRow };

export interface ReceiptDraft {
  name: string;
  /** Positive magnitude; sign is derived from `type` when saving. */
  amount: number | null;
  type: ManualTransactionType;
  /** YYYY-MM-DD */
  date: string;
  category: string[] | null;
}

/** Per-field 0–1 confidence, so the form can flag what to verify. */
export interface ReceiptConfidence {
  name: number;
  amount: number;
  date: number;
  category: number;
}

export interface ReceiptPhotoQuality {
  /** Recognised text rows; a near-empty result means the photo was unusable. */
  lineCount: number;
  meanConfidence: number;
  /** Human-readable warnings about the scan itself, not the values. */
  warnings: string[];
}

export interface ReceiptParseResult {
  draft: ReceiptDraft;
  confidence: ReceiptConfidence;
  notes: string[];
  quality: ReceiptPhotoQuality;
}

export interface ReceiptParseContext {
  /** Existing category paths ("Parent > Child"), as the app stores them. */
  knownCategories: string[];
  today?: Date;
}

const TOTAL_LABEL = /\b(?:grand\s+)?total\b|\bamount\s+due\b|\bbalance\s+due\b/i;
const EXCLUDED_TOTAL_LABEL =
  /\bsub\s?-?total\b|\btax\b|\btip\b|\bgratuity\b|\bchange\b|\bdiscount\b|\bsavings\b|\bbalance\s+forward\b|\bamount\s+tendered\b|\bcash\b|\bprev(?:ious)?\b/i;
const DATE_LABEL = /\bdate\b/i;
const INCOME_HINT = /\brefund\b|\breturned\b|\breversal\b|\bcredit\b|\bdeposit\b|\bcash\s?back\b/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Labels that mean the line is receipt furniture rather than the shop name. */
const NAME_NOISE =
  /\breceipt\b|\binvoice\b|\border\b|\btotal\b|\bthank\b|\bwelcome\b|\bcustomer\b|\bcard\b|\bvisa\b|\bmastercard\b|\bdebit\b|\bcredit\b|\bchange\b|\bwww\.|\.com\b|\bwww\b|\btel\b|\bphone\b|\bstore\s*#|\bterminal\b|\bapproval\b|\bauth\b|\bcashier\b|\bserver\b|\btable\b|\bdate\b|\btime\b|\bqty\b|\bitem\b/i;

const ADDRESS_HINT =
  /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|suite|ste|unit|apt|floor|fl)\b\.?|\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b|\b\d{5}\b/i;

const CATEGORY_KEYWORDS: Array<{ match: RegExp; leaves: RegExp }> = [
  { match: /coffee|cafe|espresso|roasters|starbucks|dunkin/i, leaves: /coffee|cafe|restaurant|food|dining/i },
  { match: /restaurant|grill|kitchen|bistro|diner|pizzeria|pizza|taco|sushi|thai|bbq|bar\b|pub\b|brewery/i, leaves: /restaurant|dining|food|bar/i },
  { match: /grocery|groceries|supermarket|market|whole\s?foods|trader\s?joe|kroger|safeway|publix|aldi|costco|walmart/i, leaves: /grocer|supermarket|food/i },
  { match: /pharmacy|drug\s?store|cvs|walgreens|rite\s?aid/i, leaves: /pharmac|drug|health/i },
  { match: /gas\b|fuel|petro|shell|chevron|exxon|bp\b|speedway|circle\s?k/i, leaves: /gas|fuel|transport|auto/i },
  { match: /uber|lyft|taxi|transit|metro|parking|toll/i, leaves: /transport|travel|parking|taxi|ride/i },
  { match: /airline|flight|hotel|motel|airbnb|delta|united|southwest/i, leaves: /travel|hotel|airline/i },
  { match: /hardware|home\s?depot|lowe'?s|ace\s?hardware/i, leaves: /home|hardware|improvement/i },
  { match: /book|amazon|target|best\s?buy|store\b|shop|boutique|outlet|mall/i, leaves: /shop|merchandise|retail|clothing|general/i },
  { match: /gym|fitness|yoga|pilates/i, leaves: /fitness|gym|health|recreation/i },
  { match: /salon|barber|spa\b|nails?\b/i, leaves: /personal\s?care|salon|beauty|spa/i },
  { match: /netflix|spotify|hulu|disney|subscription|prime\b/i, leaves: /entertainment|subscription|streaming|service/i },
  { match: /electric|utility|water\s?works|internet|comcast|verizon|at&?t|t-?mobile/i, leaves: /utilit|bill|service/i },
  { match: /insurance|premium/i, leaves: /insur/i },
  { match: /rent\b|property|apartment/i, leaves: /rent|housing|mortgage/i },
  { match: /bank|atm|fee\b|interest/i, leaves: /bank|fee|financial|interest/i },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `true` when every digit in the text is part of one number. */
function mostlyNumeric(text: string): boolean {
  const stripped = text.replace(/[^0-9a-z]/gi, "");
  if (stripped.length === 0) return false;
  return stripped.replace(/[0-9]/g, "").length / stripped.length <= 0.25;
}

function hasLetters(text: string): boolean {
  return /[a-z]{2}/i.test(text);
}

/**
 * Parses a money value.
 *
 * Both `1,234.56` and `1.234,56` appear on real receipts, so the last separator
 * is treated as the decimal point when it is followed by exactly two digits —
 * otherwise "1.234" would be read as 1.234 instead of 1234. A dot is only
 * accepted as a thousands separator when no comma is present, which keeps
 * "12.99" from being read as 1299.
 */
export function parseAmountValue(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  // The number may sit inside a larger text run when the detector merged the
  // label and its value into one box ("TOTAL 54.32").
  const matches = text.match(/-?\d[\d.,]*\d|-?\d/g);
  if (!matches || matches.length === 0) return null;

  const candidate = matches[matches.length - 1].replace(/,+$/, "");
  const negative = candidate.startsWith("-");
  const digits = candidate.replace(/^-/, "");

  let normalised: string;
  const lastDot = digits.lastIndexOf(".");
  const lastComma = digits.lastIndexOf(",");

  if (lastComma > lastDot) {
    normalised =
      digits.slice(0, lastComma).replace(/[.,]/g, "") +
      "." +
      digits.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const decimals = digits.length - lastDot - 1;
    if (decimals === 3 && !digits.includes(",")) {
      normalised = digits.replace(/\./g, "");
    } else {
      normalised = digits.slice(0, lastDot).replace(/[.,]/g, "") + "." + digits.slice(lastDot + 1);
    }
  } else {
    normalised = digits.replace(/[.,]/g, "");
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;

  const signed = negative ? -value : value;
  const rounded = round2(Math.abs(signed));
  if (rounded < 0.01 || rounded > MAX_AMOUNT) return null;
  return rounded;
}

/**
 * `true` when a box holds a money-looking value.
 *
 * Used to reject the numbers that share a receipt with its prices: a date
 * ("03/04/2026"), a quantity ("2"), a phone number. Requiring either two decimal
 * places, a thousands group or a currency marker is what keeps a four-digit year
 * from being chosen as the amount on a receipt whose total row went unread.
 */
const AMOUNT_LIKE = /^[$€£]?\s?-?[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?(?:\s?(?:USD|EUR|GBP))?$/i;

function isAmountLike(text: string): boolean {
  const trimmed = text.trim();
  if (!AMOUNT_LIKE.test(trimmed)) return false;
  // A bare integer is only a price when it carries a separator or decimals;
  // otherwise "2026" and "2" would qualify.
  return /[.,$€£]/.test(trimmed);
}

/**
 * Ranks a fallback value by how much it looks like a receipt total.
 *
 * A price with exactly two decimals beats a bare integer, and beating a
 * three-decimal figure matters because "11.234" is usually gallons or a unit
 * price on a fuel receipt rather than a total.
 */
function amountRank(raw: string): number {
  const digits = raw.replace(/[^0-9.,]/g, "");
  const decimals = digits.includes(".") ? digits.length - digits.lastIndexOf(".") - 1 : 0;
  if (decimals === 2) return 3;
  if (decimals === 0) return 2;
  return 1;
}

interface DateCandidate {
  date: string;
  /** Position in the row list, used to prefer the receipt's own date lines. */
  index: number;
  labelled: boolean;
  ambiguous: boolean;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const fullYear = year < 100 ? (year < 70 ? 2000 + year : 1900 + year) : year;
  const iso = `${String(fullYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Rejects 02/31 and similar by round-tripping through a real calendar date.
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== iso) return null;

  return iso;
}

/**
 * Finds date candidates in a line of text.
 *
 * Month/day order is ambiguous outside the US. Where one number exceeds 12 the
 * reading is forced, otherwise `MM/DD` is assumed and the candidate is flagged
 * so the form can show the assumption rather than hide it.
 */
export function findDates(
  text: string
): Array<{ date: string; ambiguous: boolean }> {
  const found: Array<{ date: string; ambiguous: boolean }> = [];
  const seen = new Set<string>();

  const push = (iso: string | null, ambiguous: boolean) => {
    if (!iso || seen.has(iso)) return;
    seen.add(iso);
    found.push({ date: iso, ambiguous });
  };

  for (const match of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    push(buildDate(Number(match[1]), Number(match[2]), Number(match[3])), false);
  }

  for (const match of text.matchAll(/\b(\d{1,2})([-/.])(\d{1,2})\2(\d{2,4})\b/g)) {
    const first = Number(match[1]);
    const second = Number(match[3]);
    const year = Number(match[4]);

    if (first > 12 && second <= 12) {
      push(buildDate(year, second, first), false);
    } else if (second > 12 && first <= 12) {
      push(buildDate(year, first, second), false);
    } else if (first <= 12 && second <= 12) {
      push(buildDate(year, first, second), true);
    }
  }

  for (const match of text.matchAll(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g
  )) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month) push(buildDate(Number(match[3]), month, Number(match[2])), false);
  }

  for (const match of text.matchAll(
    /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g
  )) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month) push(buildDate(Number(match[3]), month, Number(match[1])), false);
  }

  return found;
}

function chooseDate(rows: ReceiptRow[]): DateCandidate | null {
  const candidates: DateCandidate[] = [];

  rows.forEach((row, index) => {
    for (const found of findDates(row.text)) {
      candidates.push({
        date: found.date,
        index,
        labelled: DATE_LABEL.test(row.text),
        ambiguous: found.ambiguous,
      });
    }
  });

  if (candidates.length === 0) return null;

  const labelled = candidates.filter((candidate) => candidate.labelled);
  const pool = labelled.length > 0 ? labelled : candidates;

  // Receipts put their own date near the top, so the earliest labelled line wins
  // over a "valid until" or loyalty-expiry date further down.
  return pool.reduce((best, candidate) =>
    candidate.index < best.index ? candidate : best
  );
}

function chooseAmount(rows: ReceiptRow[]): {
  amount: number | null;
  labelledTotal: boolean;
  matchedLabel: string | null;
} {
  const totalRows: Array<{ amount: number; label: string }> = [];
  const valueRows: Array<{ amount: number; label: string; index: number; raw: string }> = [];

  rows.forEach((row, index) => {
    const raw = row.value ?? (isTextOnly(row) ? row.text : null);
    if (raw === null) return;
    if (!isAmountLike(raw)) return;

    const amount = parseAmountValue(raw);
    if (amount === null) return;

    const label = (row.label ?? (row.value === null ? row.text : "")).trim();
    valueRows.push({ amount, label, index, raw });

    if (!label || !TOTAL_LABEL.test(label) || EXCLUDED_TOTAL_LABEL.test(label)) {
      return;
    }
    totalRows.push({ amount, label });
  });

  if (totalRows.length > 0) {
    const chosen = totalRows[totalRows.length - 1];
    return { amount: chosen.amount, labelledTotal: true, matchedLabel: chosen.label };
  }

  if (valueRows.length === 0) {
    return { amount: null, labelledTotal: false, matchedLabel: null };
  }

  // No labelled total: fall back to the most total-shaped value in the bottom
  // half, where a receipt's total sits below its line items. An "amount due"
  // the detector garbled is still usually both the largest and the
  // best-formatted number on the page.
  const bottomHalf = valueRows.filter(
    (row) => row.index >= Math.floor(rows.length / 2)
  );
  const pool = bottomHalf.length > 0 ? bottomHalf : valueRows;
  const largest = pool.reduce((best, row) => {
    const rank = amountRank(row.raw);
    const bestRank = amountRank(best.raw);
    if (rank !== bestRank) return rank > bestRank ? row : best;
    return row.amount > best.amount ? row : best;
  });

  return {
    amount: largest.amount,
    labelledTotal: false,
    matchedLabel: largest.label || null,
  };
}

function chooseName(rows: ReceiptRow[]): { name: string; confident: boolean } {
  const candidates: Array<{ text: string; score: number }> = [];

  rows.slice(0, 12).forEach((row, index) => {
    const text = (row.label ?? row.text).trim();
    if (text.length < 3) return;
    if (!hasLetters(text)) return;
    if (mostlyNumeric(text)) return;
    if (DATE_LABEL.test(text) || /\b\d{1,2}:\d{2}/.test(text)) return;
    if (NAME_NOISE.test(text)) return;
    if (ADDRESS_HINT.test(text)) return;

    // Shorter, earlier, letter-only lines are shop names; long trailing lines
    // are usually the address or a marketing footer.
    const score = index * 2 + (text.length > 40 ? 10 : 0) + (/\d/.test(text) ? 3 : 0);
    candidates.push({ text, score });
  });

  if (candidates.length === 0) return { name: "", confident: false };

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0].text.replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);

  return { name: best, confident: true };
}

/**
 * Picks the existing category whose leaf best matches the receipt's text.
 *
 * Only categories the app already knows are returned, so a suggestion is always
 * a value the category field would accept — the alternative, inventing a path,
 * would create a category the budget views never seeded.
 */
export function chooseCategory(
  rows: ReceiptRow[],
  knownCategories: string[]
): { category: string[] | null; confident: boolean } {
  if (knownCategories.length === 0) return { category: null, confident: false };

  const haystack = rows
    .map((row) => row.label ?? row.text)
    .join(" ")
    .slice(0, 2000);

  const parsed = knownCategories
    .map((path) => ({ path, levels: parseCategoryInput(path) }))
    .filter(
      (entry): entry is { path: string; levels: { ok: true; value: string[] } } =>
        entry.levels.ok && entry.levels.value !== null && entry.levels.value.length > 0
    );

  let best: { path: string; levels: string[]; score: number } | null = null;

  for (const { path, levels } of parsed) {
    const leaf = levels.value[levels.value.length - 1];

    for (const keyword of CATEGORY_KEYWORDS) {
      if (!keyword.match.test(haystack) || !keyword.leaves.test(leaf)) continue;

      // A deeper match is more specific, and a direct leaf hit beats a parent
      // hit, so "Food and Drink > Coffee" wins over "Food and Drink".
      const depthBonus = levels.value.length;
      const score = depthBonus * 2 + (haystack && keyword.match.test(leaf) ? 2 : 0);

      if (!best || score > best.score) {
        best = { path, levels: levels.value, score };
      }
      break;
    }
  }

  if (!best) return { category: null, confident: false };
  return { category: best.levels, confident: true };
}

function assessQuality(rows: ReceiptRow[], boxes: ReceiptBox[]): ReceiptPhotoQuality {
  const lineCount = rows.length;
  const meanConfidence =
    boxes.length === 0
      ? 0
      : boxes.reduce((sum, box) => sum + box.confidence, 0) / boxes.length;

  const warnings: string[] = [];
  if (lineCount === 0) {
    warnings.push("No text was recognised — the photo may be blurry or too dark.");
  } else if (lineCount < 3) {
    // Two lines is a plausible short receipt rather than a failed scan, so the
    // warning waits for a count that no real receipt produces.
    warnings.push("Very little text was recognised; only part of the receipt may be readable.");
  }
  if (boxes.length > 0 && meanConfidence < 0.6) {
    warnings.push("Low recognition confidence — check the values against the receipt.");
  }

  return { lineCount, meanConfidence, warnings };
}

/**
 * Builds the draft the review form opens with.
 *
 * Fields the parser cannot establish are left empty (null amount, empty name)
 * rather than guessed, because an empty field prompts the user to fill it while
 * a confident-looking wrong value gets saved.
 *
 * Boxes rather than rows are the input so the quality assessment can weigh the
 * raw detections, and so a caller that already has rows does not have to
 * reconstruct them.
 */
export function parseReceipt(
  boxes: ReceiptBox[],
  context: ReceiptParseContext
): ReceiptParseResult {
  const rows = groupIntoRows(boxes);
  const notes: string[] = [];
  const quality = assessQuality(rows, boxes);

  const amountResult = chooseAmount(rows);
  let amount = amountResult.amount;
  if (amount === null) {
    notes.push("No total found — enter the amount from the receipt.");
  } else if (!amountResult.labelledTotal) {
    notes.push(
      `No labelled total found; used the largest value on the lower half of the receipt${
        amountResult.matchedLabel ? ` (from "${amountResult.matchedLabel}")` : ""
      }.`
    );
  }

  const dateCandidate = chooseDate(rows);
  const today = context.today ?? new Date();
  const date = dateCandidate?.date ?? todayIsoDate(today);
  if (!dateCandidate) {
    notes.push("No date found — defaulted to today.");
  } else if (dateCandidate.ambiguous) {
    notes.push(
      `Date ${date} was ambiguous (day/month order); read as month/day.`
    );
  }

  const incomeHint = INCOME_HINT.test(rows.map((row) => row.text).join(" "));
  const type: ManualTransactionType = incomeHint && !amountResult.labelledTotal ? "income" : "expense";
  if (type === "income") {
    notes.push("This looks like a refund or credit — check the type.");
  }

  const nameResult = chooseName(rows);
  if (!nameResult.confident) {
    notes.push("Could not identify the merchant name.");
  }

  const categoryResult = chooseCategory(rows, context.knownCategories);
  if (categoryResult.category === null) {
    notes.push("No matching category found — pick one if you want it categorised.");
  }

  // A refund is stored negative via `toSignedAmount`, so the magnitude the form
  // shows stays positive either way.
  if (type === "income" && amount !== null) amount = Math.abs(amount);

  return {
    draft: {
      name: nameResult.name,
      amount,
      type,
      date,
      category: categoryResult.category,
    },
    confidence: {
      name: nameResult.confident ? 0.7 : 0,
      amount: amount === null ? 0 : amountResult.labelledTotal ? 0.9 : 0.45,
      date: dateCandidate ? (dateCandidate.ambiguous ? 0.5 : 0.9) : 0.1,
      category: categoryResult.confident ? 0.6 : 0,
    },
    notes,
    quality,
  };
}
