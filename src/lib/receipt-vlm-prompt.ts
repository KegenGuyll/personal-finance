/**
 * The extraction prompt and output contract for the receipt model.
 *
 * Prompt wording is the single biggest lever on sub-1B VLM accuracy — these
 * models fail less often because they cannot read the receipt than because they
 * wrap output in prose, invent fields, or truncate before the closing brace. The
 * benchmark tested six variants; this is the one that scored 74.1%: it states the
 * exact key set, demands JSON only, defines `null` for absent fields, and fixes
 * the key order so decoding stays on-rails.
 *
 * The vocabulary deliberately mirrors what a receipt prints ("TOTAL", "TAX",
 * "VAT") to narrow the gap between the text in the image and the key the model is
 * asked to fill.
 *
 * `totalFirst` is not cosmetic. Autoregressive decoders commit to early tokens
 * and truncation loses whatever comes last; a variant that put `total` first
 * exists for exactly that reason, and the fields are ordered here with the ones
 * that create a transaction first.
 */

export const RECEIPT_PROMPT = `You are a receipt parser. Read the receipt image and output JSON.

Output ONLY a JSON object with exactly these keys:
{
  "total": number or null,
  "currency": string or null,
  "merchant": string or null,
  "date": string or null,
  "tax": number or null,
  "line_items": array
}

Rules:
- "total" is the final amount paid, as a number with no currency symbol. It is the amount printed next to "TOTAL" or "AMOUNT DUE", never "SUBTOTAL".
- "currency" is the 3-letter code, e.g. "USD", "GBP", "EUR".
- "merchant" is the store name at the top of the receipt.
- "date" is the purchase date as YYYY-MM-DD.
- "tax" is the amount printed next to "TAX", "VAT" or "GST", as a number. null if not shown.
- "line_items" is an array of {"description": string, "amount": number}. Empty array if not shown.
- Use null for anything you cannot read. Do not guess.
- No explanation, no markdown, no code fences. Just the JSON object.`;

/** The fields a transaction can be created from, in confidence-priority order. */
export interface ExtractedReceipt {
  merchant: string | null;
  /** YYYY-MM-DD, or null when unreadable. */
  date: string | null;
  total: number | null;
  currency: string | null;
  tax: number | null;
  line_items: Array<{ description: string | null; amount: number | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Pulls the JSON object out of the model's reply.
 *
 * Models wrap output in prose or code fences even when told not to, and this is
 * cheaper to tolerate than to keep re-prompting for. A malformed document is not
 * a total loss either: the benchmark measured that tiny models emit JSON which is
 * invalid *as a document* while containing individually perfect fields
 * (`"merchant": "Garcia Supermarket"` beside `"price": +345150-243`), so field
 * level salvage is attempted before giving up.
 */
export function parseReceiptJson(raw: string): ExtractedReceipt | null {
  const direct = tryParseObject(raw);
  if (direct) return normalise(direct);

  // Code fences, or prose around the object.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = tryParseObject(fenced[1]);
    if (parsed) return normalise(parsed);
  }

  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) {
    const parsed = tryParseObject(braced[0]);
    if (parsed) return normalise(parsed);

    // Generation hit the token ceiling mid-object: close the brackets and retry
    // rather than discarding fields that are individually fine.
    const salvaged = tryParseObject(closeBrackets(braced[0]));
    if (salvaged) return normalise(salvaged);
  }

  return salvageFields(raw);
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Appends the braces a truncated document is missing, ignoring string state. */
function closeBrackets(text: string): string {
  let openBraces = 0;
  let openBrackets = 0;

  for (const character of text) {
    if (character === "{") openBraces++;
    else if (character === "}") openBraces--;
    else if (character === "[") openBrackets++;
    else if (character === "]") openBrackets--;
  }

  let repaired = text.replace(/,\s*$/, "");
  repaired += "]".repeat(Math.max(0, openBrackets));
  repaired += "}".repeat(Math.max(0, openBraces));

  return repaired;
}

/**
 * Recovers individual well-formed keys from output that cannot be parsed whole.
 *
 * Returns null when nothing usable was found, so a genuinely empty response is
 * reported as such rather than as a receipt full of nulls.
 */
function salvageFields(raw: string): ExtractedReceipt | null {
  const pick = (key: string): string | null => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|[-+0-9.]+|null)`, "i"));
    if (!match) return null;
    const value = match[1];
    return value.toLowerCase() === "null" ? null : value.replace(/^"|"$/g, "");
  };

  const strings = ["merchant", "date", "currency"];
  const numbers = ["total", "tax"];

  if (![...strings, ...numbers].some((key) => pick(key) !== null)) return null;

  return normalise({
    merchant: pick("merchant"),
    date: pick("date"),
    total: pick("total"),
    currency: pick("currency"),
    tax: pick("tax"),
    line_items: [],
  });
}

/** Coerces the model's values into the contract, rejecting what cannot be used. */
function normalise(raw: Record<string, unknown>): ExtractedReceipt {
  return {
    merchant: asText(raw.merchant),
    date: asDate(raw.date),
    total: asAmount(raw.total),
    currency: asCurrency(raw.currency),
    tax: asAmount(raw.tax),
    line_items: Array.isArray(raw.line_items)
      ? raw.line_items
          .filter(isRecord)
          .map((item) => ({
            description: asText(item.description),
            amount: asAmount(item.amount),
          }))
      : [],
  };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

/**
 * Accepts a number or a numeric string, stripping currency symbols.
 *
 * Models return `"£184.89"` and `"184.89."` as readily as `184.89`, and the
 * benchmark's own single-field probe recorded exactly those. Rejecting them
 * would discard correct values for a formatting quibble.
 */
function asAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function asCurrency(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;

  // The prompt asks for a 3-letter code, but models answer "$" or "£".
  const symbol = text.match(/[$£€¥]/)?.[0];
  if (symbol) {
    return { $: "USD", "£": "GBP", "€": "EUR", "¥": "JPY" }[symbol] ?? null;
  }

  const code = text.toUpperCase().match(/\b[A-Z]{3}\b/);
  return code ? code[0] : null;
}

/**
 * Accepts the ISO date the prompt asks for, plus the formats models emit instead.
 *
 * Only unambiguous forms are converted: a bare `03/04/2026` is left as null
 * rather than guessed, because the read is already the shakiest field (61%) and
 * silently choosing a day/month order would turn a miss into a plausible wrong
 * answer. Ambiguity is for the user to resolve on the form.
 */
function asDate(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;

  const iso = text.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return isValidIso(text) ? text : null;

  const dayFirst = text.match(/^(\d{1,2})[ /.-](\d{1,2})[ /.-](\d{4})$/);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    // Only when one side cannot be a month is the order actually determined.
    if (first > 12 && second <= 12) return isoFrom(dayFirst[3], second, first);
    if (second > 12 && first <= 12) return isoFrom(dayFirst[3], first, second);
    return null;
  }

  const monthName = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const month = monthNumber(monthName[1]);
    if (month) return isoFrom(monthName[3], month, Number(monthName[2]));
  }

  return null;
}

function isoFrom(year: string, month: number, day: number): string | null {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidIso(iso) ? iso : null;
}

function isValidIso(iso: string): boolean {
  const parsed = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}
