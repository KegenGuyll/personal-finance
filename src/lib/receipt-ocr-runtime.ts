/**
 * The receipt OCR pipeline: ONNX sessions plus detection and recognition.
 *
 * Separate from the worker that calls it so the same code can run on the main
 * thread when a worker cannot be created, and so the session handling stays out
 * of the React layer. Only the ONNX calls are impure; the maths they call into
 * (`receipt-ocr-image.ts`) is unit-tested.
 */

import type * as OrtNamespace from "onnxruntime-web/wasm";

import {
  computeDetectionSize,
  computeRecognitionCropSize,
  decodeCtc,
  probabilityMapToBoxes,
  PADDLE_MEAN,
  PADDLE_STD,
  resampleToRgbPlanar,
  unclipBox,
  type Box,
  type Size,
} from "./receipt-ocr-image";

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
  recogniser: OrtNamespace.InferenceSession;
  characters: string[];
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

export async function loadSessions(
  basePath: string,
  onProgress?: RunScanOptions["onProgress"],
  executionProviders: string[] = ["wasm"]
): Promise<Sessions> {
  if (cached) return cached;

  const ort = await getOrt();
  configureRuntime(ort, basePath);
  onProgress?.("loading");

  const options: OrtNamespace.InferenceSession.SessionOptions = {
    executionProviders,
    graphOptimizationLevel: "all",
  };

  const [detector, recogniser, dictText] = await Promise.all([
    ort.InferenceSession.create(`${basePath}/det.onnx`, options),
    ort.InferenceSession.create(`${basePath}/rec.onnx`, options),
    fetch(`${basePath}/rec-dict.txt`).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not load the OCR dictionary (HTTP ${response.status}).`);
      }
      return response.text();
    }),
  ]);

  // The recogniser encodes text as indices into this list, with the CTC blank as
  // the final entry — which is why the trailing newline becomes a real token
  // rather than being trimmed away.
  const characters = dictText.split("\n");
  if (characters[characters.length - 1] === "") characters.pop();

  cached = { detector, recogniser, characters };
  return cached;
}

/**
 * Picks the model's input and output names.
 *
 * The exported graphs name outputs after the op that produced them
 * ("sigmoid_0", "softmax_0"), and those names are an artefact of the conversion
 * rather than a contract, so they are read from the session instead of
 * hardcoded. Where a graph exposes several outputs, shape is the tiebreaker: the
 * detector emits a single 4-D probability map, the recogniser a 3-D logit cube
 * whose last dimension is the dictionary size.
 */
/**
 * Picks the model's input and output names.
 *
 * The exported graphs name their outputs by the op that produced them
 * ("sigmoid_0.tmp_0", "softmax_2.tmp_0"), and those names are an artefact of the
 * conversion rather than a contract, so they are read from the session instead
 * of hardcoded. When a graph exposes several outputs, the one with the expected
 * rank wins: the detector emits a single 4-D probability map, the recogniser a
 * 3-D probability cube.
 *
 * Matching on shape is not an option — every dimension of the recogniser's
 * output is symbolic in the exported metadata, so the class count is only known
 * from the tensor returned at run time.
 */
function resolveIo(
  session: OrtNamespace.InferenceSession,
  options: { outputRank: number }
): { input: string; output: string } {
  const input = session.inputNames[0];
  if (!input) throw new Error("OCR model exposes no inputs");

  const outputs = session.outputMetadata.map((metadata) => ({
    name: metadata.name,
    rank: metadata.isTensor ? metadata.shape.length : 0,
  }));

  const ranked = outputs.filter((entry) => entry.rank === options.outputRank);
  const output = ranked[0] ?? outputs[0] ?? { name: session.outputNames[0] };
  if (!output?.name) throw new Error("OCR model exposes no outputs");

  return { input, output: output.name };
}

function tensorToFloatArray(output: OrtNamespace.Tensor): Float32Array {
  if (output.data instanceof Float32Array) return output.data;
  return Float32Array.from(output.data as ArrayLike<number>);
}

/**
 * Crops one detected line and packs it as an RGB recognition input.
 *
 * Cropping by index into the prepared image is deliberate: the boxes are already
 * in that image's coordinates, and going back to the canvas would mean keeping a
 * second copy of a multi-megabyte bitmap alive for the whole scan.
 */
function cropToTensor(
  pixels: Uint8ClampedArray,
  image: Size,
  box: Box
): { data: Float32Array; width: number; height: number } {
  const crop = computeRecognitionCropSize(box);
  const plane = crop.width * crop.height;
  const data = new Float32Array(plane * 3);

  const scaleX = box.width / crop.width;
  const scaleY = box.height / crop.height;

  for (let y = 0; y < crop.height; y++) {
    const sourceY = Math.min(image.height - 1, Math.max(0, Math.round(box.y + y * scaleY)));
    for (let x = 0; x < crop.width; x++) {
      const sourceX = Math.min(image.width - 1, Math.max(0, Math.round(box.x + x * scaleX)));
      const offset = (sourceY * image.width + sourceX) * 4;
      const index = y * crop.width + x;

      data[index] = (pixels[offset] / 255 - PADDLE_MEAN[0]) / PADDLE_STD[0];
      data[plane + index] = (pixels[offset + 1] / 255 - PADDLE_MEAN[1]) / PADDLE_STD[1];
      data[plane * 2 + index] = (pixels[offset + 2] / 255 - PADDLE_MEAN[2]) / PADDLE_STD[2];
    }
  }

  return { data, width: crop.width, height: crop.height };
}

async function recogniseBoxes(
  ort: Ort,
  sessions: Sessions,
  pixels: Uint8ClampedArray,
  image: Size,
  boxes: Box[],
  options: RunScanOptions
): Promise<OcrLine[]> {
  const io = resolveIo(sessions.recogniser, { outputRank: 3 });
  const lines: OcrLine[] = [];
  // The model's last class is the CTC blank; the dictionary holds only the
  // characters before it.
  const blankIndex = sessions.characters.length;

  for (const [index, box] of boxes.entries()) {
    throwIfAborted(options.signal);

    const crop = cropToTensor(pixels, image, box);
    const output = await sessions.recogniser.run({
      [io.input]: new ort.Tensor("float32", crop.data, [
        1,
        3,
        crop.height,
        crop.width,
      ]),
    });

    const result = output[io.output];
    const dims = result.dims;
    const timeSteps = Number(dims[dims.length - 2]);
    const classes = Number(dims[dims.length - 1]);

    // The graph ends in a softmax, so the values are already probabilities.
    const decoded = decodeCtc(
      tensorToFloatArray(result),
      timeSteps,
      classes,
      sessions.characters,
      blankIndex
    );

    if (decoded.text.trim().length > 0) {
      lines.push({
        text: decoded.text.trim(),
        // The detector's box score and the recogniser's per-character score are
        // both evidence, so the lower of the two is the honest single number.
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

  const detectorIo = resolveIo(sessions.detector, { outputRank: 4 });
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

  return recogniseBoxes(ort, sessions, image.pixels, image.size, boxes, options);
}

export const RECEIPT_OCR_BASE_PATH = "/receipt-ocr";

/** Assets the scanner downloads on first use. */
export const RECEIPT_OCR_ASSETS = [
  `${RECEIPT_OCR_BASE_PATH}/det.onnx`,
  `${RECEIPT_OCR_BASE_PATH}/rec.onnx`,
  `${RECEIPT_OCR_BASE_PATH}/rec-dict.txt`,
];
