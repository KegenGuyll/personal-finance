/**
 * The recognition model's identity and the URLs its weights are fetched from.
 *
 * Kept apart from the recogniser itself so facts about TrOCR can be read — by
 * the cache probe, and by tests — without importing `@huggingface/transformers`.
 * That import is heavy and browser-targeted, and pulling it in to read a string
 * constant made the module unusable outside a browser bundle.
 */

/** Hugging Face model id; the browser caches the weights after the first scan. */
export const TROCR_MODEL_ID = "Xenova/trocr-small-printed";

/**
 * Revision the weights are fetched at. `main` is what transformers.js requests
 * by default, and it is part of the cache key, so it must match exactly for the
 * cache probe to find the files.
 */
const TROCR_REVISION = "main";

/**
 * Files transformers.js caches for this model.
 *
 * These are the URLs it uses as cache keys, built as
 * `remoteHost + {model}/resolve/{revision}/ + filename` with the defaults it
 * ships (`https://huggingface.co/` and `{model}/resolve/{revision}/`). Changing
 * `env.remoteHost` or the dtype requested by the recogniser would change which
 * of these exist, so both are asserted against the loaded model in tests.
 */
export function trocrCacheUrls(modelId: string = TROCR_MODEL_ID): string[] {
  const base = `https://huggingface.co/${modelId}/resolve/${TROCR_REVISION}`;

  return [
    `${base}/config.json`,
    `${base}/generation_config.json`,
    `${base}/preprocessor_config.json`,
    `${base}/tokenizer.json`,
    `${base}/tokenizer_config.json`,
    // `q8` is the dtype the recogniser requests, which resolves to the files
    // named `_quantized`; these two are the bulk of the download.
    `${base}/onnx/encoder_model_quantized.onnx`,
    `${base}/onnx/decoder_model_merged_quantized.onnx`,
  ];
}
