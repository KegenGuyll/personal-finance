// Downloads the ONNX models the browser receipt scanner runs on, verifies them
// against scripts/receipt-ocr-models.lock.json, and writes the character
// dictionary the recogniser encodes its output in.
//
// The models are PP-OCRv3 detection + recognition converted to ONNX by the
// RapidOCR project. They are fetched at a pinned revision and SHA-256 verified
// because these files are served to the browser as trusted assets: a silent
// upstream change would be a supply-chain problem, not just a bad OCR result.
//
// The dictionary lives inside the recogniser's ONNX metadata rather than in a
// separate file, so it is extracted here (see readDictFromOnnx) and emitted as
// a plain text file the recogniser decoder reads at runtime.
//
// Usage: node scripts/fetch-receipt-ocr-models.mjs
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "receipt-ocr");
const lockPath = path.join(root, "scripts", "receipt-ocr-models.lock.json");

const REPO = "SWHL/RapidOCR";
const REVISION = "1cfba2e90fc938db55889873735088de210cc173";

/**
 * Copies the ONNX runtime's WASM build into `public/`.
 *
 * Vite-style bundlers emit these as assets and rewrite the runtime's internal
 * paths to match; Turbopack does not, and the runtime would otherwise request
 * `/ort-wasm-simd-threaded.wasm` from the site root. Serving them same-origin
 * next to the models also keeps the scanner free of any third-party CDN.
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

  // Only the single-threaded build is used, so the threaded loader, the WebGPU
  // (jsep) variants and their ~28MB of WASM are left out deliberately.
  const wanted = entries.filter(
    (name) =>
      /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(name) ||
      /^ort-wasm-simd-threaded\.mjs\.map$/.test(name)
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

  // Only the recogniser carries a dictionary; without it the decoded text is
  // indices, so a recogniser that verifies but has no dict is still a failure.
  const rec = lock.models.find((m) => m.kind === "rec");
  if (rec) {
    const bytes = await readFile(path.join(outDir, rec.file));
    const characters = readDictFromOnnx(bytes);
    if (!characters) {
      failures.push(
        `${rec.file}: no "character" entry in ONNX metadata; cannot decode recogniser output`
      );
    } else {
      // Written as one entry per line with no trailing newline, so the file
      // splits back into exactly these entries. The model's final class is the
      // CTC blank and is not part of this list (the metadata entry ends with the
      // space character, not a blank), so a trailing newline here would add a
      // phantom entry and shift every decoded character by one.
      await writeFile(
        path.join(outDir, lock.dict.file),
        characters.join("\n"),
        "utf8"
      );
      console.log(
        `wrote ${lock.dict.file} (${characters.length} entries; the blank is class ${characters.length} of the model)`
      );
    }
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
    `\nReceipt OCR ready in public/receipt-ocr/ (${lock.repo}@${lock.revision.slice(0, 8)})`
  );
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Reads the `character` metadata entry from an ONNX ModelProto.
 *
 * ONNX metadata_props is field 14 of ModelProto and each entry is a
 * StringStringEntryProto (field 1 = key, field 2 = value), so this walks the
 * top-level protobuf wire format rather than pulling in an ONNX parser just to
 * read one string.
 */
function readDictFromOnnx(buffer) {
  let characters = null;

  for (let pos = 0; pos < buffer.length; ) {
    const tag = readVarint(buffer, pos);
    if (!tag) break;
    const [tagValue, afterTag] = tag;
    const field = tagValue >>> 3;
    const wire = tagValue & 7;
    pos = afterTag;

    if (wire === 0) {
      const skipped = readVarint(buffer, pos);
      if (!skipped) break;
      pos = skipped[1];
      continue;
    }
    if (wire === 1) {
      pos += 8;
      continue;
    }
    if (wire === 5) {
      pos += 4;
      continue;
    }
    if (wire !== 2) break;

    const length = readVarint(buffer, pos);
    if (!length) break;
    const [, afterLength] = length;
    const end = afterLength + length[0];
    if (end > buffer.length) break;

    if (field === 14) {
      const entry = readMetadataEntry(buffer.subarray(afterLength, end));
      if (entry && entry.key === "character") characters = entry.value;
    }
    pos = end;
  }

  return characters ? characters.split("\n") : null;
}

function readMetadataEntry(buffer) {
  let key = null;
  let value = null;

  for (let pos = 0; pos < buffer.length; ) {
    const tag = readVarint(buffer, pos);
    if (!tag) break;
    const [tagValue, afterTag] = tag;
    const field = tagValue >>> 3;
    const wire = tagValue & 7;
    pos = afterTag;

    if (wire === 0) {
      const skipped = readVarint(buffer, pos);
      if (!skipped) break;
      pos = skipped[1];
      continue;
    }
    if (wire !== 2) break;

    const length = readVarint(buffer, pos);
    if (!length) break;
    const [, afterLength] = length;
    const end = afterLength + length[0];
    if (end > buffer.length) break;

    if (field === 1) key = buffer.subarray(afterLength, end).toString("utf8");
    if (field === 2) value = buffer.subarray(afterLength, end).toString("utf8");
    pos = end;
  }

  return key === null ? null : { key, value };
}

/** Returns `[value, nextOffset]`, or null when the varint runs off the end. */
function readVarint(buffer, start) {
  let result = 0;
  let shift = 0;
  let pos = start;

  while (pos < buffer.length) {
    const byte = buffer[pos++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7;
    if (shift > 63) return null;
  }

  return null;
}

await main();
