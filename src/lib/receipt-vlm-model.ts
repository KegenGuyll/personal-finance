/**
 * The receipt-extraction model's identity, chosen on measured evidence.
 *
 * A browser benchmark of sub-1B vision-language models over 24 de-leaked
 * synthetic receipt photos — each carrying perspective, lighting, shadow, noise,
 * blur and JPEG artefacts, because a phone camera never sees a clean render —
 * scored four candidates on the fields that actually create a transaction:
 *
 *   LFM2.5-VL-450M          74.1%   316MB   2.5s p50
 *   SmolVLM-500M-Instruct   63.2%   466MB   6.4s
 *   SmolVLM2-500M-Video     58.5%   466MB   6.3s
 *   SmolVLM-256M-Instruct   22.4%   255MB   5.2s
 *
 * This one won on every axis rather than trading between them: most accurate,
 * smallest download, and roughly 2.5x faster. Architecture mattered more than
 * parameter count — changing family moved `total` accuracy from 42% to 75%,
 * while adding parameters within the SmolVLM family did much less.
 *
 * Per field: total 75%, currency 92%, merchant 69%, date 61%, tax 54%.
 *
 * Two caveats that shaped the UI around it. 74% means a suggestion engine, never
 * an unattended one, so the total in particular is always user-confirmed. And
 * the benchmark corpus is entirely synthetic (monospace thermal, Latin script),
 * with real-photo transfer left unmeasured by the dataset authors.
 */

export const LFM2_VL_MODEL_ID = "onnx-community/LFM2.5-VL-450M-ONNX";

/**
 * Quantisation, measured rather than assumed.
 *
 * `q4f16` is the dtype the benchmark scored. The alternative `q4` is only needed
 * when the adapter lacks `shader-f16` (~7% of adapters: older Adreno 5xx/6xx and
 * NVIDIA Maxwell/Pascal).
 *
 * Worth knowing before changing either: on the SmolVLM exports, `q4f16` and
 * `fp16` were measured to emit degenerate text ("if if if …", "-1: -1: -") on
 * every prompt while `q4` was correct. A quantisation can silently destroy a
 * model, so any change here needs the output re-checked, not just the size.
 */
/**
 * The dtypes this app selects between. A literal union rather than `string`
 * because the transformers.js option is typed as a closed set, and widening it
 * here silently pushed the error to the call site.
 */
export type VlmDtype = "q4f16" | "q4";

export const LFM2_VL_DTYPE_PREFERRED: VlmDtype = "q4f16";
export const LFM2_VL_DTYPE_WITHOUT_F16: VlmDtype = "q4";

/** Measured on-Hub bytes for the q4f16 files, for the download prompt. */
export const LFM2_VL_DOWNLOAD_MB = 316;

/**
 * Licence is LFM Open License v1.0, which is not OSI-approved, so this is
 * recorded rather than glossed over. Its commercial-use clause is what makes it
 * usable here: commercial use is granted below an annual-revenue threshold of
 * $10M, above which it is not licensed at all.
 */
export const LFM2_VL_LICENSE = "LFM Open License v1.0 (commercial use permitted under $10M revenue)";
