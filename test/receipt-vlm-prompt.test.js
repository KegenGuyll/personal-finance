import test from "node:test";
import assert from "node:assert/strict";

import { parseReceiptJson } from "../src/lib/receipt-vlm-prompt.ts";

const FULL = `{
  "total": 184.89,
  "currency": "GBP",
  "merchant": "GARCIA SUPERMARKET",
  "date": "2020-07-23",
  "tax": 30.81,
  "line_items": [{"description": "Coffee", "amount": 3.5}]
}`;

test("parses a clean JSON reply", () => {
  const result = parseReceiptJson(FULL);

  assert.equal(result?.total, 184.89);
  assert.equal(result?.currency, "GBP");
  assert.equal(result?.merchant, "GARCIA SUPERMARKET");
  assert.equal(result?.date, "2020-07-23");
  assert.equal(result?.tax, 30.81);
  assert.equal(result?.line_items.length, 1);
});

test("recovers JSON from a code fence", () => {
  // Models wrap output in fences despite being told not to.
  const result = parseReceiptJson("```json\n" + FULL + "\n```");

  assert.equal(result?.total, 184.89);
});

test("recovers JSON surrounded by prose", () => {
  const result = parseReceiptJson(`Here is the receipt:\n${FULL}\nLet me know if you need more.`);

  assert.equal(result?.merchant, "GARCIA SUPERMARKET");
});

test("repairs a document truncated by the token ceiling", () => {
  // Generation hitting the limit mid-object otherwise scores a correct
  // extraction as zero.
  const truncated = `{"total": 184.89, "currency": "GBP", "merchant": "GARCIA", "line_items": [{"description": "Coffee", "amount": 3.5`;

  const result = parseReceiptJson(truncated);

  assert.equal(result?.total, 184.89);
  assert.equal(result?.merchant, "GARCIA");
});

test("salvages individual fields from a document that cannot be parsed", () => {
  // Measured failure mode: individually perfect fields inside output that is
  // invalid as a document.
  const broken = `"merchant": "Garcia Supermarket" ... "total": 184.89 ... "price": +345150-243`;

  const result = parseReceiptJson(broken);

  assert.equal(result?.merchant, "Garcia Supermarket");
  assert.equal(result?.total, 184.89);
});

test("returns null when there is nothing usable", () => {
  assert.equal(parseReceiptJson(""), null);
  assert.equal(parseReceiptJson("I could not read this receipt."), null);
});

test("accepts the numeric formats models actually emit", () => {
  // A single-field probe recorded these exact replies for a true total of 184.89.
  const cases = [
    ['"£184.89"', 184.89],
    ['"184.89."', 184.89],
    ['"184.89"', 184.89],
    ["184.89", 184.89],
    ['"$1,234.56"', 1234.56],
  ];

  for (const [literal, expected] of cases) {
    const result = parseReceiptJson(`{"total": ${literal}}`);
    assert.equal(result?.total, expected, `failed on ${literal}`);
  }
});

test("strips thousands separators", () => {
  assert.equal(parseReceiptJson('{"total": "$1,234.56"}')?.total, 1234.56);
});

test("maps currency symbols to codes", () => {
  assert.equal(parseReceiptJson('{"currency": "$"}')?.currency, "USD");
  assert.equal(parseReceiptJson('{"currency": "£"}')?.currency, "GBP");
  assert.equal(parseReceiptJson('{"currency": "€"}')?.currency, "EUR");
});

test("keeps an already-correct currency code", () => {
  assert.equal(parseReceiptJson('{"currency": "usd"}')?.currency, "USD");
});

test("refuses to guess an ambiguous date", () => {
  // 03/04 is March 4th or April 3rd; date is already the weakest field, so a
  // silent choice would turn a miss into a plausible wrong answer.
  assert.equal(parseReceiptJson('{"date": "03/04/2026"}')?.date, null);
});

test("converts a date whose order is determined", () => {
  assert.equal(parseReceiptJson('{"date": "25/12/2025"}')?.date, "2025-12-25");
  assert.equal(parseReceiptJson('{"date": "12/25/2025"}')?.date, "2025-12-25");
});

test("converts a month-name date", () => {
  assert.equal(parseReceiptJson('{"date": "Jul 23, 2020"}')?.date, "2020-07-23");
});

test("rejects an impossible calendar date", () => {
  assert.equal(parseReceiptJson('{"date": "2026-02-31"}')?.date, null);
});

test("treats null and empty strings as absent", () => {
  const result = parseReceiptJson('{"merchant": null, "date": "", "total": null}');

  assert.equal(result?.merchant, null);
  assert.equal(result?.date, null);
  assert.equal(result?.total, null);
});

test("returns an empty line_items array when the field is missing", () => {
  assert.deepEqual(parseReceiptJson('{"total": 1}')?.line_items, []);
});

test("ignores a line item that is not an object", () => {
  const result = parseReceiptJson('{"line_items": [{"description":"Coffee","amount":3.5}, "garbage"]}');

  assert.equal(result?.line_items.length, 1);
});
