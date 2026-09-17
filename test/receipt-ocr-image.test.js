import test from "node:test";
import assert from "node:assert/strict";

import {
  computeDetectionSize,
  computeRecognitionCropSize,
  decodeCtc,
  describeQuality,
  dilateMask,
  luminance,
  measureQuality,
  probabilityMapToBoxes,
  resampleToRgbPlanar,
  stretchContrast,
  unclipBox,
} from "../src/lib/receipt-ocr-image.ts";

test("scales a large photo down inside the detector's size window", () => {
  const size = computeDetectionSize({ width: 4032, height: 3024 });

  assert.equal(size.width, 1600);
  assert.equal(size.height, 1216);
  assert.equal(size.width % 32, 0);
  assert.equal(size.height % 32, 0);
});

test("scales a small image up and keeps it divisible by 32", () => {
  const size = computeDetectionSize({ width: 200, height: 100 });

  assert.ok(size.width >= 640);
  assert.equal(size.width % 32, 0);
  assert.equal(size.height % 32, 0);
});

test("preserves aspect ratio when resizing", () => {
  const size = computeDetectionSize({ width: 2000, height: 1000 });

  assert.equal(Number((size.width / size.height).toFixed(2)), 2);
});

test("resamples pixels into a planar RGB tensor", () => {
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  const out = resampleToRgbPlanar(
    rgba,
    { width: 2, height: 2 },
    { width: 2, height: 2 },
    { mean: [0, 0, 0], std: [1, 1, 1] }
  );

  // Planar layout: every red, then every green, then every blue.
  assert.equal(out.length, 12);
  assert.deepEqual(
    [...out.slice(0, 4)].map((value) => Math.round(value * 255)),
    [255, 0, 0, 255]
  );
  assert.deepEqual(
    [...out.slice(4, 8)].map((value) => Math.round(value * 255)),
    [0, 255, 0, 255]
  );
  assert.deepEqual(
    [...out.slice(8, 12)].map((value) => Math.round(value * 255)),
    [0, 0, 255, 255]
  );
});

test("applies the per-channel normalisation to each plane", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
  const out = resampleToRgbPlanar(
    rgba,
    { width: 1, height: 1 },
    { width: 1, height: 1 },
    { mean: [1, 0, 0], std: [1, 1, 1] }
  );

  assert.deepEqual([...out], [0, 0, 0]);
});

test("scales down to the requested size", () => {
  const rgba = new Uint8ClampedArray(16).fill(255);
  const out = resampleToRgbPlanar(
    rgba,
    { width: 2, height: 2 },
    { width: 1, height: 1 },
    { mean: [0, 0, 0], std: [1, 1, 1] }
  );

  assert.equal(out.length, 3);
});

test("uses the greyscale weights the models were trained on", () => {
  assert.equal(Math.round(luminance(255, 0, 0)), 76);
  assert.equal(Math.round(luminance(0, 255, 0)), 150);
  assert.equal(Math.round(luminance(0, 0, 255)), 29);
  assert.equal(Math.round(luminance(255, 255, 255)), 255);
});

test("stretches a washed-out scan to full range", () => {
  const grayscale = new Uint8Array(100).fill(120);
  for (let i = 0; i < 10; i++) grayscale[i] = 100;
  for (let i = 90; i < 100; i++) grayscale[i] = 140;

  stretchContrast(grayscale);

  assert.equal(grayscale[0], 0);
  assert.equal(grayscale[99], 255);
});

test("leaves a flat image alone rather than amplifying noise", () => {
  const grayscale = new Uint8Array(64).fill(128);
  stretchContrast(grayscale);

  assert.ok(grayscale.every((value) => value === 128));
});

test("measures contrast, brightness and darkness", () => {
  const grayscale = new Uint8Array([0, 0, 255, 255]);
  const stats = measureQuality(grayscale);

  assert.equal(stats.brightness, 127.5);
  assert.equal(stats.darkRatio, 0.5);
  assert.ok(stats.contrast > 100);
});

test("warns about a low-contrast image", () => {
  const warnings = describeQuality({ contrast: 10, darkRatio: 0.1, brightness: 150 });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /low contrast/i);
});

test("warns about a dark image", () => {
  const warnings = describeQuality({ contrast: 60, darkRatio: 0.7, brightness: 40 });

  assert.ok(warnings.some((warn) => /looks dark/i.test(warn)));
});

test("says nothing about a good photo", () => {
  assert.deepEqual(describeQuality({ contrast: 60, darkRatio: 0.1, brightness: 160 }), []);
});

test("pads a box outwards without leaving the image", () => {
  const padded = unclipBox(
    { x: 2, y: 2, width: 10, height: 20, confidence: 0.9 },
    { width: 100, height: 100 }
  );

  assert.equal(padded.x, 0);
  assert.equal(padded.y, 0);
  assert.ok(padded.width > 10);
});

test("scales a crop to the recognition height", () => {
  const size = computeRecognitionCropSize({ x: 0, y: 0, width: 200, height: 25, confidence: 1 });

  assert.equal(size.height, 128);
  // Width follows the source aspect ratio, up to the cap.
  assert.equal(size.width, 1024);
});

test("keeps a very wide line within the recognition width", () => {
  const size = computeRecognitionCropSize({ x: 0, y: 0, width: 4000, height: 30, confidence: 1 });

  assert.equal(size.width, 1024);
});

test("preserves a normal line's aspect ratio", () => {
  const size = computeRecognitionCropSize({ x: 0, y: 0, width: 300, height: 60, confidence: 1 });

  assert.equal(size.height, 128);
  assert.equal(size.width, 640);
});

test("bridges single-pixel gaps in a mask", () => {
  const mask = new Uint8Array([1, 0, 1, 0, 0]);
  dilateMask(mask, 5, 1);

  assert.deepEqual([...mask], [1, 1, 1, 1, 0]);
});

test("decodes CTC output, collapsing repeats and dropping blanks", () => {
  // Dictionary "AB" with the model's blank as class 2.
  const characters = ["A", "B"];
  // A A blank A B B -> "AAB"
  const probabilities = new Float32Array([
    0.9, 0.05, 0.05,
    0.9, 0.05, 0.05,
    0.05, 0.05, 0.9,
    0.9, 0.05, 0.05,
    0.05, 0.9, 0.05,
    0.05, 0.9, 0.05,
  ]);

  const result = decodeCtc(probabilities, 6, 3, characters, 2);

  assert.equal(result.text, "AAB");
  assert.equal(Number(result.confidence.toFixed(2)), 0.9);
});

test("reports zero confidence for an all-blank decode", () => {
  const result = decodeCtc(new Float32Array([0, 0, 1]), 1, 3, ["A", "B"], 2);

  assert.equal(result.text, "");
  assert.equal(result.confidence, 0);
});

test("turns a probability map into boxes in source-image coordinates", () => {
  // A 4x4 map with one 2x2 blob, scaled up to a 40x40 image.
  const probabilities = new Float32Array(16);
  probabilities[5] = 0.9;
  probabilities[6] = 0.9;
  probabilities[9] = 0.9;
  probabilities[10] = 0.9;

  const boxes = probabilityMapToBoxes(probabilities, { width: 4, height: 4 }, { width: 40, height: 40 });

  assert.equal(boxes.length, 1);
  assert.equal(Number(boxes[0].x.toFixed(1)), 10);
  assert.equal(Number(boxes[0].y.toFixed(1)), 10);
  assert.equal(Number(boxes[0].width.toFixed(1)), 20);
  assert.equal(Number(boxes[0].confidence.toFixed(2)), 0.9);
});

test("keeps two stacked lines as separate boxes", () => {
  // Rows 0-1 and 3-4 of a 6x6 map, a blank row apart: adjacent lines must never
  // be fused, or the parser would read the two rows as one label/value pair.
  const probabilities = new Float32Array(36);
  for (const index of [1, 2, 7, 8, 19, 20, 25, 26]) probabilities[index] = 0.9;

  const boxes = probabilityMapToBoxes(probabilities, { width: 6, height: 6 }, { width: 60, height: 60 });

  assert.equal(boxes.length, 2);
  assert.ok(boxes[0].y < boxes[1].y);
});

test("splits two blobs separated by a wide gap", () => {
  const probabilities = new Float32Array(36);
  probabilities[7] = 0.9;
  probabilities[10] = 0.9;

  const boxes = probabilityMapToBoxes(probabilities, { width: 6, height: 6 }, { width: 60, height: 60 });

  assert.equal(boxes.length, 2);
});

test("drops a detection smaller than the minimum box area", () => {
  // One map cell covers 3x3 source pixels here, which is under the 12px floor a
  // speck of scanner noise should fail.
  const probabilities = new Float32Array(16);
  probabilities[5] = 0.9;

  const boxes = probabilityMapToBoxes(probabilities, { width: 4, height: 4 }, { width: 12, height: 12 });

  assert.equal(boxes.length, 0);
});

test("returns boxes in reading order", () => {
  const probabilities = new Float32Array(100);
  for (const index of [22, 23, 32, 33]) probabilities[index] = 0.9;
  for (const index of [72, 73, 82, 83]) probabilities[index] = 0.9;

  const boxes = probabilityMapToBoxes(probabilities, { width: 10, height: 10 }, { width: 100, height: 100 });

  assert.equal(boxes.length, 2);
  assert.ok(boxes[0].y < boxes[1].y);
});

test("returns no boxes for a blank page", () => {
  const boxes = probabilityMapToBoxes(new Float32Array(64), { width: 8, height: 8 }, { width: 80, height: 80 });

  assert.deepEqual(boxes, []);
});
