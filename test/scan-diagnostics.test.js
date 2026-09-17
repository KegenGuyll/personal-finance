import test from "node:test";
import assert from "node:assert/strict";

import { formatBytes } from "../src/lib/scan-diagnostics.ts";
import { trocrCacheUrls } from "../src/lib/receipt-ocr-model.ts";

test("builds cache URLs in the shape transformers.js stores them", () => {
  // These keys are matched against the Cache API, so the format has to be
  // exactly what the library writes: remoteHost + model + resolve + revision.
  const urls = trocrCacheUrls("Xenova/trocr-small-printed");

  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /^https:\/\/huggingface\.co\/Xenova\/trocr-small-printed\/resolve\/main\//);
  }
});

test("includes the quantised weights the recogniser actually loads", () => {
  const urls = trocrCacheUrls("Xenova/trocr-small-printed");

  // q8 is the dtype the recogniser requests, so a probe that omitted these would
  // report "cached" while the largest files were still missing.
  assert.ok(urls.some((url) => url.endsWith("encoder_model_quantized.onnx")));
  assert.ok(urls.some((url) => url.endsWith("decoder_model_merged_quantized.onnx")));
});

test("includes the tokenizer and config files", () => {
  const urls = trocrCacheUrls("Xenova/trocr-small-printed");

  assert.ok(urls.some((url) => url.endsWith("/tokenizer.json")));
  assert.ok(urls.some((url) => url.endsWith("/config.json")));
});

test("uses the given model id rather than a hardcoded one", () => {
  const urls = trocrCacheUrls("some-org/some-model");

  assert.ok(urls.every((url) => url.includes("some-org/some-model")));
  assert.ok(!urls.some((url) => url.includes("trocr-small-printed")));
});

test("formats byte counts for display", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(75 * 1024 * 1024), "75 MB");
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), "2.0 GB");
});

test("reports unknown and zero distinctly", () => {
  // `null` means the API could not tell us; 0 means it told us nothing is
  // stored. Collapsing them would misreport an empty cache as unmeasurable.
  assert.equal(formatBytes(null), "unknown");
  assert.equal(formatBytes(0), "0 B");
});
