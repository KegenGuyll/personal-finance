# Receipt scanning

Photograph or upload a receipt and the app pre-fills the manual-transaction
form, so you verify a few numbers instead of typing six. Everything runs in the
browser and the photo is never uploaded anywhere — the only request this feature
makes is the one that saves the transaction you confirm.

## What happens to the photo

```
photo / upload
  → canvas prep (downscale, greyscale, contrast stretch)          on device
  → text detection (PP-OCRv3 DBNet, ONNX)                         on device
  → per-line recognition (TrOCR-small-printed)                    on device
  → rows recovered from box positions                             on device
  → draft + per-field confidence                                  on device
  → review form → POST /api/transactions/manual            the only request
```

## Which models, and why

| Stage | Model | Size | Served from |
|---|---|---|---|
| Text detection | PP-OCRv3 DBNet | 2.4MB | this app (`public/receipt-ocr/`) |
| Line recognition | `Xenova/trocr-small-printed` (q8) | ~70MB | Hugging Face, cached in the browser |
| Runtime | `onnxruntime-web` WASM | 14MB | this app (`public/receipt-ocr/ort/`) |

**Detection** uses the PP-OCR ONNX detector because it works and is small: it
returns a probability map whose connected regions give the text boxes, and those
box positions are what let the parser tell a `TOTAL` label from the number beside
it. All DBNet models published on Hugging Face are gated (they return 401), which
is why this one is fetched by script and served from this app.

**Recognition** uses TrOCR *because the PaddleOCR recognisers do not work*. Every
variant tested — `SWHL/RapidOCR` and `Kiuyha/paddleocr-onnx`, PP-OCRv3 and v4,
English and Chinese — reads glyphs correctly but decodes them as the wrong
characters:

```
en_PP-OCRv3_rec  "TOTAL" -> "0U0P0U0B0M0"
ch_PP-OCRv3_rec  "TOTAL" -> Chinese garbage
ch_PP-OCRv4_rec  "TOTAL" -> Chinese garbage
english (Kiuyha) "TOTAL" -> "0U0P0U0B0M0"
```

The offset is not constant across the alphabet, so it cannot be corrected with a
mapping table; those exports are simply broken. TrOCR ships its own tokenizer and
reads printed lines correctly, which is why it is here despite being much larger.

## One-time setup

```bash
npm install
npm run models:fetch
```

That downloads the detector, verifies it against the SHA-256 in
`scripts/receipt-ocr-models.lock.json`, and stages the ONNX runtime's WASM build
out of `node_modules`. Both land in `public/receipt-ocr/`, which is gitignored —
the script is the only supported way to populate it, and it fails loudly on a
checksum mismatch rather than serving an unverified asset. `Dockerfile` runs it
during the image build.

The TrOCR weights need no setup step: the browser downloads them on first scan,
and transformers.js caches them under the `transformers-cache` Cache API entry
(~72MB), separately from this app's own `receipt-ocr` cache.

## First scan on a device

The first scan offers a **"Download the OCR model"** button (~85MB, one time) and
stores the result in the Cache API, so later scans work offline.

While it runs, the button is replaced by a progress bar showing the percentage,
the bytes transferred against the total, the file currently downloading and how
many files are done. That detail is deliberate: the transfer is one small
appendix plus two ~30MB weight files, so a single percentage would sit still
often enough to look like a hang. If the percentage does not move for 20
seconds, the panel says so and points at entering the transaction by hand.

The progress is genuinely monotonic. transformers.js reports one file at a time
and its own percentage restarts at zero per file, which would make the bar jump
backwards three times during what feels like one download; the tracker sums bytes
across files and keeps a per-file high-water mark so a retry inside a file cannot
reverse it either.

The size shown is measured, not estimated: the file list comes from the Hub API
for the **7 files a q8 load actually requests**. The model repository holds 20
files including fp32 weights and a decoder-with-past variant that are never
fetched, and counting those inflated the total to ~830MB — which made a finished
download display as 8%. If the download
is refused or the Cache API is unavailable the scanner still works — the assets
are re-fetched from the app or Hugging Face each time.

## Device diagnostics

The scan modal has a collapsible **"Scan diagnostics (device storage and GPU)"**
section. It exists because three facts decide how scanning feels on a given
device and none can be established from a browser version:

| Reading | Why it matters |
|---|---|
| Detector / recogniser cached | Whether a scan will stall on a ~72MB download |
| `navigator.gpu` and adapter | Whether the fast path exists (WASM is used regardless today) |
| `storage.persist()` and quota | Whether the cached weights can be reclaimed at any time |

**The load-bearing use is the before/after comparison.** Scan once, then open the
panel again days later. If the recogniser reads "absent", eviction is real for
your usage and the ~72MB is being re-paid.

Two things worth knowing when reading it:

- **`persist()` returning `false` is the expected result on WebKit today.** It is
  implemented there and can return true — the storage process grants a per-origin
  eviction exemption — but WebKit has been reported as always refusing
  ([bug 271401](https://bugs.webkit.org/show_bug.cgi?id=271401), open and
  untouched since January 2025). A refusal means the weights are reclaimable, not
  that the feature is broken.
- **WebGPU on iOS requires Safari 26 or later.** It is enabled by default there;
  the flag-gated case in caniuse refers to *macOS* before Tahoe. So a missing
  adapter on an iPhone is a version or context problem, not a platform limit.

## What each field is worth

| Field | Source | Confidence |
|---|---|---|
| Amount | The row labelled `TOTAL` (never `SUBTOTAL`, `TAX`, `TIP`, `CHANGE`); falls back to the most total-shaped value in the lower half | High when labelled, low on a fallback |
| Date | The first labelled date line. `MM/DD` is assumed where both numbers are ≤ 12 | High, or flagged ambiguous |
| Name | Earliest short, letter-bearing line that is not an address or receipt furniture | Advisory |
| Category | Keyword match against categories you already have, so a suggestion is always a value the field accepts | Advisory |

Fields the parser cannot establish are left **empty** rather than guessed, and
every field carries a marker in the review form: green (read), amber (check), red
(missing). The amount and date are the two that matter; the rest are advisory and
cheap to correct.

The review form also shows a downscaled preview of the image **as the scanner read
it**, which is the fastest explanation for a wrong value: a grey, washed-out
preview means the photo was the problem.

## Known limits

- **Our synthetic-fixture accuracy is not your accuracy.** The pipeline is
  verified end-to-end against real model weights with rendered receipts: detection
  finds every line, and TrOCR returns real values (`TOTAL 4.5`, `TOTAL 101.47`,
  `SUBTOTAL 4.00`, `38.86`). It has **not** been run against your real photographs
  — see the acceptance run below. Synthetic fixtures also showed a repeated digit
  error: `03/04/2026` reads as `03/04/2018`. Check dates.
- **Amounts near a misread glyph fail closed.** When OCR returns `4.MM`, the
  amount resolves to `4` or nothing rather than a plausible-but-wrong figure, so
  the failure is visible as an empty or flagged amount.
- **One transaction per scan.** A bank screenshot listing five rows yields one
  draft, not five.
- **Printed Latin text.** TrOCR-small-printed handles printed English; handwriting
  and non-Latin scripts are not supported.
- **Photos are the weak case.** Detection quality on a skewed, dim or crumpled
  photo is the most likely reason a scan comes back empty. The form says what it
  thinks went wrong (blur, low contrast, dark) and offers a retry, manual entry,
  or pasting text instead.
- **Recognition runs on the main thread, on WASM.** The pipeline yields between
  lines so progress updates, but a long receipt (many lines × autoregressive
  decoding) will make the page sluggish. **WebGPU is available on iOS Safari 26+
  and current desktop Safari and is not being used** — the runtime is pinned to
  the WASM backend. See the diagnostic below before assuming the device lacks it.
- **A refund is guessed, not known.** Text matching `refund`, `credit`,
  `reversal` or `deposit` without a total row selects "Income", always at low
  confidence.

## Why there is no Web Worker

A worker is the obvious home for seconds of WASM work, and it was the first
implementation. It failed at build time: bundling a worker requires the pipeline
to be reachable through an asset URL, and Next's bundler rewrites that URL into a
path the ONNX runtime rejects (`Invalid URL`), which surfaced as a prerender
failure on `/transactions` — nowhere near the change that caused it.

Scans now run in batches on the main thread with a yield between lines. The seam
to revisit is `src/lib/receipt-ocr-runtime.ts`: it has no React or DOM dependency
beyond `setTimeout`, so it can move back into a worker once the bundling question
has a reliable answer.

## Acceptance run

Run this after any change to the models, thresholds or parser. Photograph five
real receipts — one skewed, one dim, one crumpled, one thermal — plus one bank
screenshot, and record per field:

| Receipt | Amount | Date | Name | Category | Seconds |
|---|---|---|---|---|---|
| skewed | | | | | |
| dim | | | | | |
| crumpled | | | | | |
| thermal | | | | | |
| screenshot | | | | | |

**The bar is amount and date correct on all five photos.** Merchant and category
are advisory; the review form is what makes them cheap to correct.

If amounts or dates miss, the recorded next steps are, in order: raise
`REC_HEIGHT` in `src/lib/receipt-ocr-image.ts`, try `trocr-base-printed`, then
move recognition to WebGPU. If detection is what fails (the form reports "no text
recognised"), the fix is a better detector, not a better recogniser.

## Tests

```bash
npm test
```

Covers layout grouping (including a tilted receipt, where a fixed y-bucket would
split a row), the parser (printed receipt, gas pump, tip, refund, ambiguous date,
no-total, garbage), the image maths and the CTC decoder, which is still used for
any future CTC recogniser. The fixtures are built from box positions, so a change
in grouping behaviour surfaces as a parser failure rather than a silently
different draft.

The end-to-end model check is not part of `npm test` — it needs the ONNX weights
and a native runtime — so it is run manually when the models change.
