/**
 * The receipt OCR pipeline: text detection through ONNX, line recognition
 * through TrOCR.
 *
 * All of it runs on the main thread in batches — see `receipt-ocr-client.ts` for
 * why the worker was removed. Only the model calls are impure; the maths they
 * call into (`receipt-ocr-image.ts`) is unit-tested.
 */

import type * as OrtNamespace from "onnxruntime-web/wasm";

import {
  computeDetectionSize,
  computeRecognitionCropSize,
  probabilityMapToBoxes,
  PADDLE_MEAN,
  PADDLE_STD,
  resampleToRgbPlanar,
  unclipBox,
  type Box,
  type Size,
} from "./receipt-ocr-image";
import { loadRecogniser, recogniseLine } from "./receipt-ocr-recogniser";

export interface OcrLine {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanImage {
  /** RGBA pixels of the prepared image. */
  pixels: Uint8ClampedArray;
  size: Size;
}

export interface RunScanOptions {
  /** Directory holding det.onnx, rec.onnx, rec-dict.txt and ort/. */
  basePath: string;
  onProgress?: (phase: ScanPhase, detail?: { done: number; total: number }) => void;
  /** Checked between recognition batches; a running inference call cannot be interrupted. */
  signal?: AbortSignal;
  /**
   * Backends to try, in order. Defaults to WASM, which is the only one that
   * needs no cross-origin isolation headers and works in every target browser;
   * it is overridable so the pipeline can run under a different runtime (a
   * WebGPU build, or a native binding in tests) without editing this module.
   */
  executionProviders?: string[];
}

export type ScanPhase = "loading" | "detecting" | "recognising";

/**
 * Hands control back to the browser so it can paint the progress update before
 * the next batch of inference work starts.
 *
 * The pipeline runs on the main thread (see `receipt-ocr-client.ts` for why the
 * alternative was worse), so without this the whole scan would be one long
 * blocking task and the "reading line 16 of 40" text would never appear.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
}

type Ort = typeof OrtNamespace;

interface Sessions {
  detector: OrtNamespace.InferenceSession;
}

/**
 * Loads the ONNX runtime on first use.
 *
 * The runtime is imported dynamically because its module body resolves the path
 * to its own WASM bundle when evaluated. Importing it at the top level makes that
 * resolution happen while Next prerenders the pages that render the scanner's
 * parent, which fails with "Invalid URL" against the bundler's asset path — long
 * before any user opens the scanner. Deferring to first use keeps module
 * evaluation out of the server render entirely.
 */
let ortPromise: Promise<Ort> | null = null;

function getOrt(): Promise<Ort> {
  ortPromise ??= import("onnxruntime-web/wasm");
  return ortPromise;
}

/**
 * Lines recognised between progress updates and cancellation checks.
 *
 * Lines are recognised one at a time rather than batched: the exported graphs
 * declare a dynamic input width and the pooled feature width follows it, so
 * padding several crops to one width would distort every line but the widest.
 */
const PROGRESS_EVERY = 4;

let cached: Sessions | null = null;
let runtimeConfigured = false;

function configureRuntime(ort: Ort, basePath: string): void {
  if (runtimeConfigured) return;

  // Served from `public/receipt-ocr/ort/` by scripts/fetch-receipt-ocr-models.mjs.
  // Threads stay off deliberately: they require cross-origin isolation headers,
  // and the throughput is not worth making the whole app depend on COOP/COEP.
  ort.env.wasm.wasmPaths = `${basePath}/ort/`;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.logLevel = "error";
  runtimeConfigured = true;
}

/**
 * Creates the detection session and loads the line recogniser.
 *
 * The detector runs through onnxruntime-web; lines are read by TrOCR through
 * @huggingface/transformers. Both load together so the "loading" phase the UI
 * reports covers everything the first scan waits on, and both are cached for
 * the life of the page.
 */
export async function loadSessions(
  basePath: string,
  onProgress?: RunScanOptions["onProgress"],
  executionProviders: string[] = ["wasm"]
): Promise<Sessions> {
  if (cached) return cached;

  const ort = await getOrt();
  configureRuntime(ort, basePath);
  onProgress?.("loading");

  const [detector] = await Promise.all([
    ort.InferenceSession.create(basePath + "/det.onnx", {
      executionProviders,
      graphOptimizationLevel: "all",
    }),
    loadRecogniser(),
  ]);

  cached = { detector };
  return cached;
}
/**
 * Picks a session's input and output names.
 *
 * The exported detector names its output after the op that produced it
 * ("sigmoid_0.tmp_0"), which is an artefact of the conversion rather than a
 * contract, so the name is read from the session instead of hardcoded.
 */
function resolveIo(session: OrtNamespace.InferenceSession): {
  input: string;
  output: string;
} {
  const input = session.inputNames[0];
  const output = session.outputNames[0];
  if (!input) throw new Error("OCR model exposes no inputs");
  if (!output) throw new Error("OCR model exposes no outputs");

  return { input, output };
}

function tensorToFloatArray(output: OrtNamespace.Tensor): Float32Array {
  if (output.data instanceof Float32Array) return output.data;
  return Float32Array.from(output.data as ArrayLike<number>);
}

/**
 * Crops one detected line out of the prepared image.
 *
 * The crop keeps its own aspect ratio: TrOCR's processor resizes and pads to the
 * model's square input, so squashing a line to a fixed width here would distort
 * the glyph shapes before the model ever saw them.
 */
function cropToRgba(
  pixels: Uint8ClampedArray,
  image: Size,
  box: Box
): { data: Uint8ClampedArray; width: number; height: number } {
  const crop = computeRecognitionCropSize(box);
  const data = new Uint8ClampedArray(crop.width * crop.height * 4);

  const scaleX = box.width / crop.width;
  const scaleY = box.height / crop.height;

  for (let y = 0; y < crop.height; y++) {
    const sourceY = Math.min(image.height - 1, Math.max(0, Math.round(box.y + y * scaleY)));
    for (let x = 0; x < crop.width; x++) {
      const sourceX = Math.min(image.width - 1, Math.max(0, Math.round(box.x + x * scaleX)));
      const from = (sourceY * image.width + sourceX) * 4;
      const to = (y * crop.width + x) * 4;

      data[to] = pixels[from];
      data[to + 1] = pixels[from + 1];
      data[to + 2] = pixels[from + 2];
      data[to + 3] = 255;
    }
  }

  return { data, width: crop.width, height: crop.height };
}
async function recogniseBoxes(
  sessions: Sessions,
  pixels: Uint8ClampedArray,
  image: Size,
  boxes: Box[],
  options: RunScanOptions
): Promise<OcrLine[]> {
  const lines: OcrLine[] = [];

  for (const [index, box] of boxes.entries()) {
    throwIfAborted(options.signal);

    const crop = cropToRgba(pixels, image, box);
    const decoded = await recogniseLine(crop.data, {
      width: crop.width,
      height: crop.height,
    });

    if (decoded.text.length > 0) {
      lines.push({
        text: decoded.text,
        // The detector's box score and the recogniser's score are both
        // evidence, so the lower of the two is the honest single number.
        confidence: Math.min(box.confidence, decoded.confidence),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    }

    if (index % PROGRESS_EVERY === PROGRESS_EVERY - 1 || index === boxes.length - 1) {
      options.onProgress?.("recognising", { done: index + 1, total: boxes.length });
      // Cancellation takes effect here rather than mid-inference, and the
      // browser gets a chance to paint the progress update above.
      await yieldToBrowser();
    }
  }

  return lines;
}
/**
 * Reads every text line in a prepared receipt image, with positions.
 *
 * Returns lines rather than a text blob because the layout layer needs the box
 * coordinates to tell a total from a line item; see `receipt-layout.ts`.
 */
export async function runScan(
  image: ScanImage,
  options: RunScanOptions
): Promise<OcrLine[]> {
  throwIfAborted(options.signal);
  const ort = await getOrt();
  const sessions = await loadSessions(
    options.basePath,
    options.onProgress,
    options.executionProviders
  );

  const detectionSize = computeDetectionSize(image.size);
  options.onProgress?.("detecting");

  const detectorIo = resolveIo(sessions.detector);
  // Both models are declared as 3-channel RGB, so the greyscale a reader might
  // expect here would be rejected outright by the runtime.
  const detectionOutput = await sessions.detector.run({
    [detectorIo.input]: new ort.Tensor(
      "float32",
      resampleToRgbPlanar(image.pixels, image.size, detectionSize, {
        mean: PADDLE_MEAN,
        std: PADDLE_STD,
      }),
      [1, 3, detectionSize.height, detectionSize.width]
    ),
  });

  const map = detectionOutput[detectorIo.output];
  const dims = map.dims;
  const mapSize: Size = {
    width: Number(dims[dims.length - 1]),
    height: Number(dims[dims.length - 2]),
  };

  // Boxes come back in the detector's coordinate space and are mapped onto the
  // prepared image, which is what the caller crops against.
  const boxes = probabilityMapToBoxes(tensorToFloatArray(map), mapSize, image.size).map(
    (box) => unclipBox(box, image.size)
  );

  if (boxes.length === 0) return [];

  return recogniseBoxes(sessions, image.pixels, image.size, boxes, options);
}

export const RECEIPT_OCR_BASE_PATH = "/receipt-ocr";

/** Assets the scanner downloads on first use. */
export const RECEIPT_OCR_ASSETS = [`${RECEIPT_OCR_BASE_PATH}/det.onnx`];
