"use client";

/**
 * Line recognition with TrOCR.
 *
 * Chosen over the PaddleOCR ONNX recognisers, which are unusable: every variant
 * tested (SWHL/RapidOCR and Kiuyha/paddleocr-onnx, PP-OCRv3 and v4, English and
 * Chinese) reads glyphs correctly but decodes them as the wrong characters —
 * "TOTAL" comes back as "0U0P0U0B0M0" — and the offset is not constant, so it
 * cannot be corrected with a mapping table. TrOCR ships its own tokenizer and
 * reads clean printed lines correctly, which those exports do not.
 *
 * TrOCR is an encoder/decoder, so this is autoregressive rather than a single
 * forward pass, and it is loaded through `@huggingface/transformers`' image-to-text
 * pipeline: the pipeline owns the tokenizer and the decoding loop, and the
 * library is imported lazily for the same reason the ONNX runtime is — its module
 * body does browser feature detection that must not run during a server render.
 */

import type * as TransformersNamespace from "@huggingface/transformers";

type Transformers = typeof TransformersNamespace;

/** Hugging Face model id; the browser caches the weights after the first scan. */
export const TROCR_MODEL_ID = "Xenova/trocr-small-printed";

/**
 * Hard cap on generated tokens per line.
 *
 * A receipt line is short, and the cap bounds the decoding loop if the model
 * fails to emit an end-of-sequence token instead of letting one bad crop run to
 * the model's full context.
 */
const MAX_NEW_TOKENS = 64;

type ImageToTextPipeline = (
  image: unknown,
  options?: { max_new_tokens?: number }
) => Promise<Array<{ generated_text: string }>>;

let transformersPromise: Promise<Transformers> | null = null;
let pipelinePromise: Promise<ImageToTextPipeline> | null = null;

function getTransformers(): Promise<Transformers> {
  transformersPromise ??= import("@huggingface/transformers");
  return transformersPromise;
}

/** Loads the recognition pipeline, reusing the loaded instance for later lines. */
export function loadRecogniser(): Promise<ImageToTextPipeline> {
  pipelinePromise ??= (async () => {
    const { pipeline } = await getTransformers();

    // `q8` quantisation keeps the download around 70MB rather than ~250MB; the
    // accuracy cost is paid on faint print, which the review form asks the user
    // to check anyway.
    return (await pipeline("image-to-text", TROCR_MODEL_ID, {
      dtype: "q8",
    })) as unknown as ImageToTextPipeline;
  })();

  return pipelinePromise;
}

/** Reports whether the recogniser has already been loaded into this page. */
export function isRecogniserLoaded(): boolean {
  return pipelinePromise !== null;
}

/**
 * Reads one line of text from a crop.
 *
 * `pixels` is RGBA at the crop's own size and is handed over unpreprocessed: the
 * pipeline owns resizing and normalisation, and replicating TrOCR's preprocessing
 * by hand would risk a mean/std or resize-filter mistake that stays invisible
 * until every amount is wrong.
 */
export async function recogniseLine(
  pixels: Uint8ClampedArray,
  size: { width: number; height: number }
): Promise<{ text: string; confidence: number }> {
  const [recognise, { RawImage }] = await Promise.all([
    loadRecogniser(),
    getTransformers(),
  ]);

  // The buffer is copied because RawImage holds a reference and the caller's
  // crop buffer is reused between lines.
  const image = new RawImage(
    new Uint8ClampedArray(pixels),
    size.width,
    size.height,
    4
  );

  const output = await recognise(image, { max_new_tokens: MAX_NEW_TOKENS });
  const text = (output[0]?.generated_text ?? "").trim();

  // TrOCR exposes no per-character probabilities through the pipeline, and
  // inventing one would be worse than reporting its absence: a low-confidence
  // field is what the review form marks "check this", and the amount's
  // confidence already comes from whether a labelled TOTAL row was found.
  return { text, confidence: text.length > 0 ? 0.7 : 0 };
}
