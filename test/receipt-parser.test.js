import test from "node:test";
import assert from "node:assert/strict";

import { groupIntoRows } from "../src/lib/receipt-layout.ts";
import {
  chooseCategory,
  findDates,
  parseAmountValue,
  parseReceipt,
} from "../src/lib/receipt-parser.ts";

const TODAY = new Date("2026-03-04T12:00:00Z");
const KNOWN_CATEGORIES = [
  "Food and Drink",
  "Food and Drink > Coffee",
  "Food and Drink > Groceries",
  "Food and Drink > Restaurants",
  "Transportation > Gas",
  "Shops > Pharmacy",
];

let nextY = 0;

/** A left-column label and a right-column value, as the detector reports them. */
function row(label, value, confidence = 0.95) {
  const boxes = [
    { text: label, confidence, x: 10, y: nextY, width: label.length * 8, height: 20 },
  ];
  if (value !== undefined) {
    boxes.push({ text: value, confidence, x: 200, y: nextY, width: 60, height: 20 });
  }
  nextY += 30;
  return boxes;
}

/** A single full-width line, e.g. a shop name or a footer. */
function line(text, confidence = 0.95) {
  const boxes = [
    { text, confidence, x: 10, y: nextY, width: text.length * 8, height: 20 },
  ];
  nextY += 30;
  return boxes;
}

function build(...lines) {
  nextY = 0;
  const boxes = lines.flat();
  const rows = groupIntoRows(boxes);
  return { rows, boxes };
}

function parse(...lines) {
  const { boxes } = build(...lines);
  return parseReceipt(boxes, { knownCategories: KNOWN_CATEGORIES, today: TODAY });
}

test("reads a plain printed receipt", () => {
  const result = parse(
    line("CORNER CAFE"),
    line("123 Main Street"),
    row("DATE", "03/04/2026"),
    row("SUBTOTAL", "4.00"),
    row("TAX", "0.32"),
    row("TOTAL", "4.32")
  );

  assert.equal(result.draft.amount, 4.32);
  assert.equal(result.draft.date, "2026-03-04");
  assert.equal(result.draft.name, "CORNER CAFE");
  assert.equal(result.draft.type, "expense");
  assert.deepEqual(result.draft.category, ["Food and Drink", "Coffee"]);
  assert.equal(result.confidence.amount, 0.9);
});

test("uses the total, never the subtotal or tax line", () => {
  const result = parse(
    line("CORNER CAFE"),
    row("SUBTOTAL", "4.00"),
    row("TAX", "0.32"),
    row("TOTAL", "4.32")
  );

  assert.equal(result.draft.amount, 4.32);
});

test("reads a restaurant receipt where the tip is inside the total", () => {
  const result = parse(
    line("THE GRILL HOUSE"),
    row("DATE", "02/18/2026"),
    row("SUBTOTAL", "80.00"),
    row("TAX", "6.40"),
    row("TIP", "16.00"),
    row("TOTAL", "102.40")
  );

  assert.equal(result.draft.amount, 102.4);
  assert.equal(result.draft.name, "THE GRILL HOUSE");
  assert.deepEqual(result.draft.category, ["Food and Drink", "Restaurants"]);
});

test("ignores price-per-gallon figures on a gas receipt", () => {
  const result = parse(
    line("SPEEDWAY 4421"),
    row("GALLONS", "11.234"),
    row("PRICE/GAL", "3.459"),
    row("FUEL TOTAL", "38.86"),
    row("DATE", "01/09/2026")
  );

  assert.equal(result.draft.amount, 38.86);
  assert.deepEqual(result.draft.category, ["Transportation", "Gas"]);
});

test("treats a refund as income", () => {
  const result = parse(
    line("WHOLE FOODS MARKET"),
    row("DATE", "03/04/2026"),
    row("REFUND", "23.47")
  );

  assert.equal(result.draft.type, "income");
  assert.equal(result.draft.amount, 23.47);
});

test("reads an unambiguous international-style date", () => {
  const result = parse(line("BOOKSHOP"), row("DATE", "25/12/2025"), row("TOTAL", "18.00"));

  assert.equal(result.draft.date, "2025-12-25");
  assert.equal(result.confidence.date, 0.9);
});

test("flags an ambiguous date instead of hiding the assumption", () => {
  const result = parse(line("CORNER CAFE"), row("TOTAL", "4.32"), row("DATE", "03/04/2026"));

  assert.equal(result.draft.date, "2026-03-04");
  assert.equal(result.confidence.date, 0.5);
  assert.ok(result.notes.some((note) => /ambiguous/i.test(note)));
});

test("falls back to the largest value and says so", () => {
  const result = parse(
    line("HARDWARE STORE"),
    row("HAMMER", "12.00"),
    row("NAILS", "3.50"),
    row("PAINT", "24.99")
  );

  assert.equal(result.draft.amount, 24.99);
  assert.equal(result.confidence.amount, 0.45);
  assert.ok(result.notes.some((note) => /no labelled total/i.test(note)));
});

test("defaults the date to today when the receipt shows none", () => {
  const result = parse(line("CORNER CAFE"), row("TOTAL", "4.32"));

  assert.equal(result.draft.date, "2026-03-04");
  assert.equal(result.confidence.date, 0.1);
  assert.ok(result.notes.some((note) => /no date found/i.test(note)));
});

test("leaves the amount empty when the scan is unusable", () => {
  const { boxes } = build(line("@@@@"));
  const result = parseReceipt(boxes, {
    knownCategories: KNOWN_CATEGORIES,
    today: TODAY,
  });

  assert.equal(result.draft.amount, null);
  assert.equal(result.confidence.amount, 0);
  assert.ok(result.notes.some((note) => /no total found/i.test(note)));
});

test("never reads a date's year as the amount", () => {
  const result = parse(line("CORNER CAFE"), row("DATE", "03/04/2026"));

  assert.equal(result.draft.amount, null);
  assert.equal(result.draft.date, "2026-03-04");
});

test("prefers a two-decimal price over a unit figure when no total is labelled", () => {
  const result = parse(
    line("SPEEDWAY 4421"),
    row("GALLONS", "11.234"),
    row("FUEL", "38.86")
  );

  assert.equal(result.draft.amount, 38.86);
});

test("warns when almost no text was recognised", () => {
  const result = parse(line("STORE", 0.4), row("TOTAL", "1.00", 0.4));

  assert.ok(result.quality.warnings.some((warn) => /low recognition confidence/i.test(warn)));
});

test("warns when nothing was recognised at all", () => {
  const result = parseReceipt([], {
    knownCategories: KNOWN_CATEGORIES,
    today: TODAY,
  });

  assert.ok(result.quality.warnings.some((warn) => /no text was recognised/i.test(warn)));
});

test("skips address lines when choosing the merchant name", () => {
  const result = parse(
    line("CORNER CAFE"),
    line("123 MAIN STREET"),
    line("PORTLAND OR 97201"),
    row("TOTAL", "4.32")
  );

  assert.equal(result.draft.name, "CORNER CAFE");
});

test("skips receipt furniture when choosing the merchant name", () => {
  const result = parse(
    line("RECEIPT"),
    line("ORDER #4471"),
    line("BLUE BOTTLE COFFEE"),
    row("TOTAL", "6.50")
  );

  assert.equal(result.draft.name, "BLUE BOTTLE COFFEE");
});

test("parses money values in both separator conventions", () => {
  assert.equal(parseAmountValue("$4.32"), 4.32);
  assert.equal(parseAmountValue("1,234.56"), 1234.56);
  assert.equal(parseAmountValue("1.234,56"), 1234.56);
  assert.equal(parseAmountValue("12.99"), 12.99);
  assert.equal(parseAmountValue("54.32 USD"), 54.32);
  assert.equal(parseAmountValue("TOTAL 54.32"), 54.32);
  assert.equal(parseAmountValue("no digits here"), null);
  assert.equal(parseAmountValue("0.00"), null);
});

test("finds dates in the formats receipts actually print", () => {
  const cases = [
    ["03/04/2026", "2026-03-04"],
    ["3/4/26", "2026-03-04"],
    ["2026-03-04", "2026-03-04"],
    ["Mar 4, 2026", "2026-03-04"],
    ["4 March 2026", "2026-03-04"],
    ["25/12/2025", "2025-12-25"],
  ];

  for (const [text, expected] of cases) {
    const found = findDates(text);
    assert.equal(found[0]?.date, expected, `expected ${text} to read as ${expected}`);
  }
});

test("rejects an impossible calendar date", () => {
  assert.equal(findDates("02/31/2026").length, 0);
});

test("matches a category only when the leaf exists", () => {
  const { rows } = build(line("SHELL"), row("FUEL TOTAL", "38.86"));
  const result = chooseCategory(rows, KNOWN_CATEGORIES);

  assert.deepEqual(result.category, ["Transportation", "Gas"]);
});

test("returns no category when nothing matches", () => {
  const { rows } = build(line("ZQX 991"), row("TOTAL", "9.99"));
  const result = chooseCategory(rows, KNOWN_CATEGORIES);

  assert.equal(result.category, null);
  assert.equal(result.confident, false);
});

test("returns no category when the app has no categories yet", () => {
  const { rows } = build(line("SHELL"), row("FUEL TOTAL", "38.86"));
  const result = chooseCategory(rows, []);

  assert.equal(result.category, null);
});
