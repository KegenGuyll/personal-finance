import test from "node:test";
import assert from "node:assert/strict";

import {
  createProgressTracker,
  describeScanReadiness,
  FALLBACK_MODEL_SIZES,
} from "../src/lib/download-progress.ts";

const SIZES = {
  "onnx/encoder_model_quantized.onnx": 23_080_000,
  "onnx/decoder_model_merged_quantized.onnx": 40_530_000,
};
const FILES = Object.keys(SIZES);
const TOTAL = Object.values(SIZES).reduce((a, b) => a + b, 0);

test("reports zero percent once the total is known, before any bytes arrive", () => {
  const tracker = createProgressTracker(SIZES);
  const snapshot = tracker.snapshot();

  // The bar is determinate from the start when the file sizes are known: an
  // empty bar is honest at 0%, whereas an indeterminate one would suggest the
  // size is unknown when it is not.
  assert.equal(snapshot.percent, 0);
  assert.equal(snapshot.loadedBytes, 0);
  assert.ok(snapshot.totalBytes !== null && snapshot.totalBytes > 0);
});

test("reports no percentage when no sizes could be established", () => {
  const tracker = createProgressTracker([]);

  assert.equal(tracker.snapshot().percent, null);
  assert.equal(tracker.snapshot().totalBytes, null);
});

test("reports per-file progress as bytes and a percentage", () => {
  const tracker = createProgressTracker(SIZES);

  tracker.onProgress({
    status: "progress",
    file: FILES[0],
    loaded: SIZES[FILES[0]],
    total: SIZES[FILES[0]],
  });

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.loadedBytes, SIZES[FILES[0]]);
  assert.equal(snapshot.percent, Math.round((SIZES[FILES[0]] / TOTAL) * 100));
  assert.equal(snapshot.file, FILES[0]);
});

test("credits a cached file its known size when it reports no bytes", () => {
  // Measured against the real model: a file already in the cache reports "done"
  // without ever sending a byte count. Crediting it zero left the bar at a low
  // percentage while every file was listed as finished.
  const tracker = createProgressTracker(SIZES);

  for (const file of FILES) tracker.onProgress({ status: "done", file });

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.filesDone, FILES.length);
  assert.equal(snapshot.loadedBytes, TOTAL);
  assert.equal(snapshot.percent, 100);
});

test("keeps a monotonic high-water mark within one file", () => {
  // A retry inside a file reports a smaller `loaded`; letting that through would
  // make the bar jump backwards, which reads as failure rather than progress.
  const tracker = createProgressTracker(SIZES);
  const total = TOTAL;

  tracker.onProgress({ status: "progress", file: FILES[0], loaded: 10_000_000, total });
  tracker.onProgress({ status: "progress", file: FILES[0], loaded: 4_000_000, total });

  assert.equal(tracker.snapshot().loadedBytes, 10_000_000);
});

test("sums bytes across files instead of restarting per file", () => {
  // transformers.js reports progress one file at a time and its own `progress`
  // value restarts at zero for each, which would show the bar going backwards.
  const tracker = createProgressTracker(SIZES);
  const total = TOTAL;

  tracker.onProgress({ status: "progress", file: FILES[0], loaded: SIZES[FILES[0]], total: SIZES[FILES[0]] });
  tracker.onProgress({ status: "done", file: FILES[0], total: SIZES[FILES[0]] });
  tracker.onProgress({ status: "progress", file: FILES[1], loaded: 5_000_000, total: SIZES[FILES[1]] });

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.loadedBytes, SIZES[FILES[0]] + 5_000_000);
  assert.ok(snapshot.percent !== null && snapshot.percent > 40 && snapshot.percent < 45);
});

test("never reports more than one hundred percent", () => {
  const tracker = createProgressTracker(SIZES);
  const total = TOTAL;

  tracker.onProgress({ status: "progress", file: FILES[0], loaded: TOTAL * 2, total: TOTAL });
  tracker.onProgress({ status: "progress", file: FILES[1], loaded: TOTAL * 2, total: TOTAL });

  assert.equal(tracker.snapshot().percent, 100);
});

test("counts finished files", () => {
  const tracker = createProgressTracker(SIZES);

  tracker.onProgress({ status: "done", file: FILES[0], total: SIZES[FILES[0]] });
  const snapshot = tracker.snapshot();

  assert.equal(snapshot.filesDone, 1);
  assert.equal(snapshot.filesTotal, FILES.length);
});

test("grows the total when an unlisted file is fetched", () => {
  // Guards against a model whose file set changed: the percentage must not
  // exceed 100 just because the package shipped an extra file.
  const tracker = createProgressTracker(SIZES);

  tracker.onProgress({
    status: "progress",
    file: "onnx/unexpected.onnx",
    loaded: 1_000,
    total: 1_000_000_000,
  });

  const snapshot = tracker.snapshot();
  assert.ok(snapshot.totalBytes !== null && snapshot.totalBytes >= 1_000_000_000);
  assert.equal(snapshot.percent, 0);
});

test("carries a fallback size map for when the Hub API cannot be reached", () => {
  // The weights are the bulk of the download; a fallback that omitted them
  // would leave the bar stuck near zero for the whole transfer.
  const total = Object.values(FALLBACK_MODEL_SIZES).reduce((a, b) => a + b, 0);

  assert.ok(total > 60_000_000, `expected a substantial fallback, got ${total}`);
});

test("ignores callbacks without a file or byte count", () => {
  const tracker = createProgressTracker(SIZES);

  tracker.onProgress({ status: "ready" });
  tracker.onProgress({ status: "progress" });

  assert.equal(tracker.snapshot().loadedBytes, 0);
});

test("only the ready state can start a scan", () => {
  // The modal shows a download prompt instead of a photo picker in every other
  // state, so a hint that promised scanning would send the user to a dead end.
  const states = ["checking", "missing", "downloading", "ready", "failed"];

  for (const state of states) {
    const described = describeScanReadiness(state);
    assert.equal(
      described.canScan,
      state === "ready",
      `${state} should report canScan=${state === "ready"}`
    );
  }
});

test("names the one-time download before the user taps", () => {
  const described = describeScanReadiness("missing");

  assert.match(described.hint ?? "", /one-time/i);
  assert.match(described.hint ?? "", /85MB/);
});

test("shows download progress on the entry button", () => {
  const described = describeScanReadiness("downloading");

  assert.equal(described.label, "Downloading…");
  assert.ok(described.hint);
});

test("offers a retry hint after a failed download", () => {
  const described = describeScanReadiness("failed");

  assert.match(described.hint ?? "", /did not finish/i);
});

test("says nothing extra when everything is ready", () => {
  const described = describeScanReadiness("ready");

  assert.equal(described.label, "Scan receipt");
  assert.equal(described.hint, null);
});

test("stays neutral while the cache is still being read", () => {
  const described = describeScanReadiness("checking");

  // Claiming a download is needed before the cache has been read would flash a
  // wrong warning on every open for users who already have the model.
  assert.equal(described.hint, null);
  assert.equal(described.canScan, false);
});
