import test from "node:test";
import assert from "node:assert/strict";

import {
  groupIntoRows,
  isTextOnly,
  meanConfidence,
} from "../src/lib/receipt-layout.ts";

/** Builds a detection box; y is the top edge and all rows here are 20px tall. */
function box(text, x, y, confidence = 0.95, width = 40, height = 20) {
  return { text, confidence, x, y, width, height };
}

test("groups a label and its value on the same line", () => {
  const rows = groupIntoRows([box("TOTAL", 10, 100), box("54.32", 200, 102)]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "TOTAL");
  assert.equal(rows[0].value, "54.32");
  assert.equal(rows[0].text, "TOTAL 54.32");
  assert.equal(rows[0].y, 100);
});

test("keeps distinct lines apart", () => {
  const rows = groupIntoRows([
    box("CORNER CAFE", 10, 0),
    box("SUBTOTAL", 10, 100),
    box("4.00", 200, 100),
    box("TOTAL", 10, 140),
    box("4.32", 200, 140),
  ]);

  assert.deepEqual(
    rows.map((row) => row.text),
    ["CORNER CAFE", "SUBTOTAL 4.00", "TOTAL 4.32"]
  );
});

test("keeps a drifting row together", () => {
  // A photographed receipt tilts, so the value's baseline sits lower than the
  // label's. A fixed y-bucket would split this into two rows.
  const rows = groupIntoRows([box("TOTAL", 10, 100), box("54.32", 200, 112)]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "TOTAL");
  assert.equal(rows[0].value, "54.32");
});

test("orders boxes left to right within a row", () => {
  const rows = groupIntoRows([
    box("54.32", 200, 100),
    box("TOTAL", 10, 100),
    box("1", 120, 100),
  ]);

  assert.deepEqual(
    rows[0].boxes.map((entry) => entry.text),
    ["TOTAL", "1", "54.32"]
  );
});

test("takes the last amount when a line carries several numbers", () => {
  const rows = groupIntoRows([
    box("1", 10, 50),
    box("12.99", 120, 50),
    box("12.99", 200, 50),
  ]);

  assert.equal(rows[0].value, "12.99");
  assert.equal(rows[0].label, "1 12.99");
});

test("leaves a text-only row without label or value", () => {
  const rows = groupIntoRows([box("THANK YOU FOR VISITING", 10, 0)]);

  assert.equal(rows[0].value, null);
  assert.equal(rows[0].label, null);
  assert.equal(isTextOnly(rows[0]), true);
});

test("does not pair a label with a non-amount box", () => {
  const rows = groupIntoRows([box("CARD", 10, 0), box("VISA", 200, 0)]);

  assert.equal(rows[0].value, null);
  assert.equal(rows[0].label, null);
});

test("ignores empty detections", () => {
  const rows = groupIntoRows([box("   ", 10, 0), box("TOTAL", 10, 100)]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "TOTAL");
});

test("returns nothing for an empty detection list", () => {
  assert.deepEqual(groupIntoRows([]), []);
});

test("weights mean confidence by text length", () => {
  // 5 characters at 0.9 and 3 at 0.3: (5 resp. 3) weights give 0.675, which a
  // plain average of the two confidences would report as 0.6.
  const confidence = meanConfidence([
    box("TOTAL", 10, 0, 0.9, 40, 20),
    box("ABC", 10, 30, 0.3, 40, 20),
  ]);

  assert.equal(Number(confidence.toFixed(3)), 0.675);
});

test("returns zero confidence with no boxes", () => {
  assert.equal(meanConfidence([]), 0);
});
