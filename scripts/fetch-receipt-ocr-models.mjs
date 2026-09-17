// Downloads the ONNX text detector the browser receipt scanner runs on, verifies
// it against scripts/receipt-ocr-models.lock.json, and stages the ONNX runtime's
// WASM build alongside it.
//
// Only the detector is fetched here. Line recognition is done by TrOCR, whose
// weights the browser downloads from Hugging Face and caches on first scan — see
// src/lib/receipt-ocr-recogniser.ts and docs/receipt-scanning.md.
//
// The detector is fetched at a pinned revision and SHA-256 verified because it is
// served to the browser as a trusted asset: a silent upstream change would be a
// supply-chain problem, not just a bad OCR result.
//
// Usage: node scripts/fetch-receipt-ocr-models.mjs
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "receipt-ocr");
const lockPath = path.join(root, "scripts", "receipt-ocr-models.lock.json");

/**
 * Copies the ONNX runtime's WASM build into `public/`.
 *
 * Vite-style bundlers emit these as assets and rewrite the runtime's internal
 * paths to match; Turbopack does not, and the runtime would otherwise request
 * `/ort-wasm-simd-threaded.wasm` from the site root. Serving them same-origin next
 * to the detector also keeps the scanner free of any third-party CDN.
 */
async function copyRuntimeAssets() {
  const distDir = path.join(root, "node_modules", "onnxruntime-web", "dist");
  let entries;
  try {
    entries = await readdir(distDir);
  } catch {
    throw new Error(
      "node_modules/onnxruntime-web/dist is missing — run `npm install` first"
    );
  }

  // Only the single-threaded build is used, so the threaded loader and the WebGPU
  // (jsep) variants and their ~28MB of WASM are left out deliberately.
  const wanted = entries.filter((name) =>
    /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(name)
  );

  if (wanted.length === 0) {
    throw new Error("no onnxruntime-web WASM assets found to copy");
  }

  const assetDir = path.join(outDir, "ort");
  await mkdir(assetDir, { recursive: true });

  for (const name of wanted) {
    await copyFile(path.join(distDir, name), path.join(assetDir, name));
    console.log(`staged ort/${name}`);
  }
}

async function main() {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  await mkdir(outDir, { recursive: true });

  const failures = [];
  for (const model of lock.models) {
    const url = `https://huggingface.co/${lock.repo}/resolve/${lock.revision}/${model.source}`;
    const target = path.join(outDir, model.file);

    let bytes;
    try {
      bytes = await download(url);
    } catch (error) {
      failures.push(`${model.file}: download failed (${error.message})`);
      continue;
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== model.sha256) {
      // Keep the mismatched file out of public/ so a tampered or moved upstream
      // file can never be served by accident.
      failures.push(
        `${model.file}: sha256 mismatch\n    expected ${model.sha256}\n    actual   ${digest}`
      );
      continue;
    }

    await writeFile(target, bytes);
    console.log(`verified ${model.file} (${bytes.length} bytes)`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} model(s) failed verification:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  try {
    await copyRuntimeAssets();
  } catch (error) {
    console.error(`\nCould not stage the ONNX runtime: ${error.message}`);
    process.exit(1);
  }

  console.log(
    `\nReceipt detection ready in public/receipt-ocr/ (${lock.repo}@${lock.revision.slice(0, 8)})`
  );
  console.log(
    "Line recognition uses TrOCR, downloaded by the browser from Hugging Face on first scan."
  );
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

await main();
