import test from "node:test";
import assert from "node:assert/strict";

import { mapExtractionToDraft, describeUnparseableOutput } from "../src/lib/receipt-vlm-mapping.ts";

/**
 * Builds an extraction without importing the type: `ExtractedReceipt` is
 * type-only, and Node's type stripping cannot resolve a type used as a value.
 */
function extraction(overrides = {}) {
  return {
    merchant: "GARCIA SUPERMARKET",
    date: "2020-07-23",
    total: 184.89,
    currency: "GBP",
    tax: 30.81,
    line_items: [],
    ...overrides,
  };
}

test("maps a complete extraction onto the form's draft", () => {
  const { draft } = mapExtractionToDraft(extraction());

  assert.equal(draft.name, "GARCIA SUPERMARKET");
  assert.equal(draft.amount, 184.89);
  assert.equal(draft.date, "2020-07-23");
  assert.equal(draft.type, "expense");
});

test("marks every field the model returned as needing a check", () => {
  // The model reports no per-field confidence, and 74% overall accuracy means
  // presenting a value as verified would misrepresent it.
  const { confidence } = mapExtractionToDraft(extraction());

  assert.equal(confidence.amount, 0.5);
  assert.equal(confidence.date, 0.5);
  assert.equal(confidence.name, 0.5);
});

test("marks a field the model omitted as missing", () => {
  const { confidence } = mapExtractionToDraft(
    extraction({ merchant: null, date: null, total: null })
  );

  assert.equal(confidence.amount, 0);
  assert.equal(confidence.date, 0);
  assert.equal(confidence.name, 0);
});

test("always reports category as missing", () => {
  // The prompt does not ask for a category, so there is never one to report.
  const { draft, confidence } = mapExtractionToDraft(extraction());

  assert.equal(draft.category, null);
  assert.equal(confidence.category, 0);
});

test("defaults a missing date to today and says so", () => {
  const { draft, notes } = mapExtractionToDraft(extraction({ date: null }));

  assert.match(draft.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(notes.some((note) => /no date/i.test(note)));
});

test("leaves the amount empty rather than guessing", () => {
  const { draft, notes, confidence } = mapExtractionToDraft(extraction({ total: null }));

  assert.equal(draft.amount, null);
  assert.equal(confidence.amount, 0);
  assert.ok(notes.some((note) => /no total/i.test(note)));
});

test("notes a missing merchant name", () => {
  const { draft, notes } = mapExtractionToDraft(extraction({ merchant: null }));

  assert.equal(draft.name, "");
  assert.ok(notes.some((note) => /merchant/i.test(note)));
});

test("always states that the model can be wrong", () => {
  // The accuracy expectation has to be set somewhere, and the form is the only
  // place the user sees before saving.
  const { notes } = mapExtractionToDraft(extraction());

  assert.ok(notes.some((note) => /check the amount and the date/i.test(note)));
});

test("uses the magnitude of a negative total", () => {
  // The stored sign comes from `type` when saving, so the form shows a magnitude.
  const { draft } = mapExtractionToDraft(extraction({ total: -184.89 }));

  assert.equal(draft.amount, 184.89);
});

test("describes unusable output with a preview of the reply", () => {
  const message = describeUnparseableOutput("I am sorry, I cannot read this.");

  assert.match(message, /could not be read as JSON/);
  assert.match(message, /enter the transaction by hand/i);
});

test("describes an empty reply distinctly", () => {
  const message = describeUnparseableOutput("   ");

  assert.match(message, /returned nothing/i);
});

test("never pre-selects an account", async () => {
  // The review form must not fall back to `accounts[0]`: a scanned transaction
  // booked against an unchosen account is invisible once the select shows a name.
  // The form owns that rule, so this asserts it is not reintroduced by the
  // mapping supplying a default of its own.
  const { mapExtractionToDraft } = await import("../src/lib/receipt-vlm-mapping.ts");
  const mapped = mapExtractionToDraft(extraction());

  assert.equal(
    Object.prototype.hasOwnProperty.call(mapped.draft, "accountId"),
    false,
    "the mapping must not invent an account"
  );
});
