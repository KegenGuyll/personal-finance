"use client";

/**
 * Receipt extraction with LFM2.5-VL-450M, in a Web Worker.
 *
 * Chosen on measured evidence rather than parameter count. A browser benchmark
 * of sub-1B vision-language models over 24 de-leaked synthetic receipt photos
 * (perspective, shadow, blur, JPEG artefacts) scored this model first on
 * accuracy *and* cheapest on download:
 *
 *   LFM2.5-VL-450M          74.1%   316MB   2.5s p50
 *   SmolVLM-500M-Instruct   63.2%   466MB   6.4s
 *   SmolVLM2-500M-Video     58.5%   466MB   6.3s
 *   SmolVLM-256M-Instruct   22.4%   255MB   5.2s
 *
 * Per field it is the strongest at what a transaction needs: total 75%,
 * currency 92%, merchant 69%, date 61%.
 *
 * 74% is a suggestion engine, not an authority: this only pre-fills a form the
 * user confirms, and the total is the field most often wrong.
 *
 * Runs in a worker because generation takes seconds on WebGPU (minutes on the
 * WASM fallback), which on the main thread would freeze the page during exactly
 * the phase the user is watching. The model also needs disposing so its GPU
 * buffers are actually released.
 *
 * The worker protocol deliberately mirrors the benchmark harness that produced
 * the numbers above, including its processor argument-order workaround — see
 * `callProcessor`.
 */

import {
  AutoModelForImageTextToText,
  AutoProcessor,
  RawImage,
  TextStreamer,
  env,
} from "@huggingface/transformers";

import { RECEIPT_PROMPT } from "@/src/lib/receipt-vlm-prompt";
import { describeGpu } from "@/src/lib/scan-breadcrumbs";
import {
  LFM2_VL_MODEL_ID,
  LFM2_VL_DTYPE_WITHOUT_F16,
  LFM2_VL_DTYPE_PREFERRED,
  type VlmDtype,
} from "@/src/lib/receipt-vlm-model";

/** Cache weights with the Cache API so a scan does not re-download 316MB. */
env.allowLocalModels = false;
env.useBrowserCache = true;

/**
 * The three WebGPU members this worker needs.
 *
 * Declared locally rather than by adding `@webgpu/types`: that package augments
 * the global `Navigator` for the whole project, so a change here would ripple
 * into every other file's view of `navigator`.
 */
interface GpuAdapterLike {
  features: { has(feature: string): boolean };
}

interface NavigatorWithGpu extends Navigator {
  gpu?: {
    requestAdapter(options?: {
      powerPreference?: "low-power" | "high-performance";
    }): Promise<GpuAdapterLike | null>;
  };
}

function gpuApi(): NavigatorWithGpu["gpu"] {
  return (navigator as NavigatorWithGpu).gpu;
}

export interface VlmLoadRequest {
  op: "load";
  /** Overrides the dtype chosen from the adapter; used by diagnostics. */
  dtype?: VlmDtype;
}

export interface VlmRunRequest {
  op: "run";
  /** The encoded image exactly as the user provided it. */
  imageBytes: ArrayBuffer;
  imageMime: string;
}

export interface VlmDisposeRequest {
  op: "dispose";
}

export type VlmRequest = VlmLoadRequest | VlmRunRequest | VlmDisposeRequest;

export interface VlmProgressMessage {
  type: "progress";
  stage: "download" | "load";
  file: string | null;
  loadedBytes: number;
  totalBytes: number;
}

export interface VlmLoadedMessage {
  type: "loaded";
  device: string;
  dtype: string;
  downloadBytes: number;
}

export interface VlmTokenMessage {
  type: "token";
  token: string;
}

export interface VlmResultMessage {
  type: "result";
  text: string;
  device: string;
  dtype: string;
  generateMs: number;
  outputTokens: number | null;
}

export interface VlmBreadcrumbMessage {
  type: "breadcrumb";
  step: string;
  detail?: string;
}

export interface VlmErrorMessage {
  type: "error";
  message: string;
  /** Which step failed, since worker stacks do not survive postMessage. */
  step: string;
  detail?: string;
}

export type VlmResponse =
  | VlmBreadcrumbMessage
  | VlmProgressMessage
  | VlmLoadedMessage
  | VlmTokenMessage
  | VlmResultMessage
  | VlmErrorMessage;

interface LoadedModel {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>>;
  device: string;
  dtype: string;
}

let loaded: LoadedModel | null = null;

/** WebGPU cannot usefully run two generations at once, so work is serialized. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // Swallow rejections on the chain so one failure does not poison the queue;
  // the caller still sees the rejection through `run`.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function post(message: VlmResponse): void {
  self.postMessage(message);
}

/**
 * Records a step by asking the main thread to persist it.
 *
 * The write deliberately happens on the other side: this worker is the component
 * that dies, and a half-written cache entry from a killed worker would corrupt the
 * log that is supposed to explain the crash.
 */
function breadcrumb(step: string, detail?: string): void {
  self.postMessage({ type: "breadcrumb", step, detail } satisfies VlmBreadcrumbMessage);
}

/**
 * Picks the dtype from what the adapter actually reports.
 *
 * `q4f16` needs `shader-f16`, which is absent on older Adreno 5xx/6xx and
 * NVIDIA Maxwell/Pascal — roughly 7% of adapters. Falling back to `q4` keeps
 * those devices working rather than failing at load with an opaque error.
 */
async function chooseDtype(override?: VlmDtype): Promise<VlmDtype> {
  if (override) return override;

  try {
    const adapter = await gpuApi()?.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) return LFM2_VL_DTYPE_WITHOUT_F16;
    return adapter.features.has("shader-f16")
      ? LFM2_VL_DTYPE_PREFERRED
      : LFM2_VL_DTYPE_WITHOUT_F16;
  } catch {
    return LFM2_VL_DTYPE_WITHOUT_F16;
  }
}

/** Reports whether the worker can reach a GPU, so the UI can warn honestly. */
async function hasWebGpu(): Promise<boolean> {
  const gpu = gpuApi();
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function loadModel(request: VlmLoadRequest): Promise<VlmLoadedMessage> {
  breadcrumb("load:begin", "dtype=" + (request.dtype ?? "auto"));
  breadcrumb("load:gpu", await describeGpu());

  if (loaded && (!request.dtype || loaded.dtype === request.dtype)) {
    breadcrumb("load:cached");
    return {
      type: "loaded",
      device: loaded.device,
      dtype: loaded.dtype,
      downloadBytes: 0,
    };
  }

  // WebGPU is required, not preferred.
  //
  // The WASM fallback is not a slower path — it is a broken one at this size. A
  // 450M model with a 221MB decoder shard cannot be held and executed on the CPU
  // inside a browser tab, and attempting it is the most likely explanation for a
  // process death that leaves no error behind. Failing here, visibly, is far more
  // useful than a tab that vanishes.
  const gpuAvailable = await hasWebGpu();
  breadcrumb("load:gpu-available", String(gpuAvailable));

  if (!gpuAvailable) {
    throw new Error(
      "This device has no WebGPU, which this model needs. " +
        "Running it on the CPU is not viable at this size."
    );
  }

  const device = "webgpu";
  const dtype = await chooseDtype(request.dtype);
  breadcrumb("load:device", "device=" + device + " dtype=" + dtype);

  // Sum the per-file callbacks into a whole-download figure: transformers.js
  // restarts its own percentage at zero for each file, so reporting it directly
  // would walk the progress bar backwards repeatedly.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: {
    status?: string;
    file?: string;
    loaded?: number;
    total?: number;
  }) => {
    if (info.status !== "progress" || !info.file) return;

    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
    let loadedBytes = 0;
    let totalBytes = 0;
    for (const file of files.values()) {
      loadedBytes += file.loaded;
      totalBytes += file.total;
    }

    post({
      type: "progress",
      stage: "download",
      file: info.file,
      loadedBytes,
      totalBytes,
    });
  };

  breadcrumb("load:processor:begin");
  const processor = await AutoProcessor.from_pretrained(LFM2_VL_MODEL_ID, {
    progress_callback,
  });
  breadcrumb("load:processor:ok");

  // The step most likely to exhaust memory: the whole model is materialised here.
  breadcrumb("load:model:begin", "files=" + files.size);
  const model = await AutoModelForImageTextToText.from_pretrained(LFM2_VL_MODEL_ID, {
    dtype,
    device,
    progress_callback,
  });
  breadcrumb("load:model:ok");

  loaded = { processor, model, device, dtype };

  return {
    type: "loaded",
    device,
    dtype,
    downloadBytes: [...files.values()].reduce((sum, f) => sum + f.loaded, 0),
  };
}

/**
 * Invokes the processor with the argument order this model family needs.
 *
 * transformers.js calls processors generically as `processor(text, images)`,
 * which suits Idefics3/SmolVLM, but this model's processor declares
 * `_call(images, text)`. The benchmark that scored it 74.1% hit exactly this and
 * spent several rounds believing the model was worker-incompatible before
 * finding the cause.
 *
 * Rather than keying off `constructor.name` — which is unreliable, because what
 * `AutoProcessor.from_pretrained` returns is not always a direct instance of the
 * processor class, and that name check silently fails — attempt one order and
 * fall back to the other. The wrong order throws before any expensive work.
 */
async function callProcessor(
  processor: LoadedModel["processor"],
  text: string,
  image: unknown
): Promise<Record<string, unknown>> {
  const imagesArg = image ? [image] : null;

  if (!imagesArg) {
    return (await processor(text, null)) as Record<string, unknown>;
  }

  try {
    return (await processor(text, imagesArg)) as Record<string, unknown>;
  } catch (firstError) {
    try {
      return (await processor(imagesArg, text)) as Record<string, unknown>;
    } catch (secondError) {
      throw new Error(
        `processor rejected both argument orders. ` +
          `(text,images): ${(firstError as Error)?.message ?? firstError}; ` +
          `(images,text): ${(secondError as Error)?.message ?? secondError}`
      );
    }
  }
}

async function runReceipt(request: VlmRunRequest): Promise<VlmResultMessage> {
  if (!loaded) throw new Error("no model loaded");
  const { processor, model, device, dtype } = loaded;

  breadcrumb("run:begin", "bytes=" + request.imageBytes.byteLength + " device=" + device);

  const image = await RawImage.fromBlob(
    new Blob([request.imageBytes], { type: request.imageMime || "image/jpeg" })
  );
  breadcrumb("run:decoded", image.width + "x" + image.height);

  const messages = [
    {
      role: "user" as const,
      content: [{ type: "image" as const }, { type: "text" as const, text: RECEIPT_PROMPT }],
    },
  ];

  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await callProcessor(processor, text as string, image);

  const inputIds = (inputs as { input_ids?: { dims: number[] } }).input_ids;
  const tiles = (inputs as { pixel_values?: { dims: number[] } }).pixel_values;
  breadcrumb(
    "run:preprocessed",
    "tokens=" + (inputIds?.dims?.[1] ?? "?") + " tiles=" + (tiles?.dims?.[0] ?? "?")
  );

  const tokenizer = processor.tokenizer;
  if (!tokenizer) throw new Error("model processor exposes no tokenizer");

  let outputText = "";
  let outputTokens = 0;
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (token: string) => {
      outputText += token;
      outputTokens++;
      post({ type: "token", token });
    },
  });

  const started = performance.now();
  breadcrumb("run:generate:begin");
  const output = await model.generate({
    ...inputs,
    // 768 is the budget the benchmark used. Verbose output routinely hits the
    // ceiling mid-object, which can invalidate the whole JSON document.
    max_new_tokens: 768,
    do_sample: false,
    // Grammar-constrained decoding is deliberately NOT used: the benchmark
    // measured that `StructuredOutputProcessor` is accepted and then silently
    // ignored by this generation loop, so it constrains nothing while still
    // forcing `repetition_penalty` to 1.0. Left at the default here.
    repetition_penalty: 1.1,
    streamer,
  });

  const generateMs = performance.now() - started;
  breadcrumb("run:generate:ok", "ms=" + Math.round(generateMs));

  // The streamer normally supplies the text; decoding the raw ids is the
  // fallback for a generation that produced no streamed tokens.
  let finalText = outputText.trim();
  const promptLength = (inputs as { input_ids: { dims: number[] } }).input_ids.dims[1];
  const tensor = output as unknown as {
    slice?: (start: unknown, end: unknown) => unknown;
  };

  if (!finalText && typeof tensor.slice === "function") {
    const ids = tensor.slice(null, [promptLength, null]);
    finalText =
      tokenizer.batch_decode(ids as never, { skip_special_tokens: true })[0]?.trim() ?? "";
  }

  return {
    type: "result",
    text: finalText,
    device,
    dtype,
    generateMs,
    outputTokens: outputTokens || null,
  };
}

/** Releases the model so its GPU buffers can actually be reclaimed. */
async function disposeModel(): Promise<void> {
  if (!loaded) return;
  try {
    await (loaded.model as unknown as { dispose?: () => Promise<unknown> }).dispose?.();
  } catch {
    // Best effort: a failed dispose must not block unloading.
  }
  loaded = null;
}

self.addEventListener("message", (event: MessageEvent<{ id: string; request: VlmRequest }>) => {
  const { id, request } = event.data ?? {};
  if (!id || !request) return;

  void enqueue(async () => {
    try {
      if (request.op === "load") {
        post(await loadModel(request));
      } else if (request.op === "run") {
        post(await runReceipt(request));
      } else {
        await disposeModel();
      }
    } catch (error) {
      // Worker stacks do not survive postMessage — they arrive as a bare
      // message pointing at the caller — so the step is reported as data.
      const message = error instanceof Error ? error.message : String(error);
      breadcrumb(request.op + ":ERROR", message);
      post({
        type: "error",
        step: request.op,
        message,
        detail: error instanceof Error ? error.stack?.slice(0, 1000) : undefined,
      });
    }
  });
});
