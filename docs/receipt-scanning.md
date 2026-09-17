# Receipt scanning

Photograph or upload a receipt and the app pre-fills the manual-transaction
form, so you verify a few numbers instead of typing six. Everything runs in the
browser: the OCR models are downloaded once and served from this app's own
`public/` directory, and the photo is never uploaded anywhere.

## What happens to the photo

```
photo / upload
  → canvas prep (downscale, greyscale, contrast stretch)      on device
  → text detection (DBNet-style ONNX)                          on device
  → per-line recognition (CRNN/CTC ONNX)                       on device
  → rows recovered from box positions                          on device
  → draft + per-field confidence                               on device
  → review form → POST /api/transactions/manual               the only request
```

The image and the recognised text stay in the browser. The only network traffic
the feature causes is the one-time model download, and the only thing that ever
reaches the server is the transaction you confirm — through the same route the
hand-typed form already used.

## One-time setup

The model weights are not committed. Fetch and verify them once:

```bash
npm run models:fetch
```

That downloads PP-OCRv3 detection and recognition models (converted to ONNX by
[RapidOCR](https://huggingface.co/SWHL/RapidOCR)), verifies each against the
SHA-256 recorded in `scripts/receipt-ocr-models.lock.json`, extracts the
recogniser's character dictionary from its ONNX metadata, and stages the ONNX
runtime's WASM build. Everything lands in `public/receipt-ocr/`, which is
gitignored.

The script is the only supported way to populate that directory: it fails loudly
on a checksum mismatch and leaves the bad file out, because these are assets the
browser trusts. Pinning by revision and hash is what stops an upstream change
from silently altering what the scanner reads.

Bumping a model means editing the lock file's `source`/`sha256` and re-running it.

`Dockerfile` runs this during the image build, so a deployment has the models
without a manual step.

## First scan on a device

The first scan offers a "Download the OCR model" button (~25MB) and stores the
result in the Cache API, so later scans work offline. If the download is refused
or the Cache API is unavailable, the scanner still works — the assets are simply
re-fetched from the app each time.

## What each field is worth

| Field | Source | Confidence |
|---|---|---|
| Amount | The row labelled `TOTAL` (never `SUBTOTAL`, `TAX`, `TIP`, `CHANGE`); falls back to the largest plausible price in the lower half | High when labelled, low on a fallback |
| Date | The first labelled date line. `MM/DD` is assumed where both numbers are ≤ 12 | High, or flagged ambiguous |
| Name | Earliest short, letter-bearing line that is not an address or receipt furniture | Advisory |
| Category | Keyword match against categories you already have, so a suggestion is always a value the field accepts | Advisory |

Fields the parser cannot establish are left **empty** rather than guessed, and
every field carries a marker in the review form: green (read), amber (check),
red (missing). The amount and the date are the two that matter — the rest are
advisory and cheap to correct.

The review form also shows a downscaled preview of the image **as the scanner
read it**, which is the fastest way to explain a wrong value: if the preview is
grey and washed out, the photo was the problem.

## Known limits

- **One transaction per scan.** A bank screenshot listing five rows yields one
  draft, not five. Multi-candidate extraction is a follow-up.
- **Printed Latin text.** The recogniser is the English/Latin one, 95 tokens
  covering digits, letters, currency symbols and punctuation. Handwriting is not
  supported and neither is non-Latin script.
- **Photos are the weak case.** Detection quality on a skewed, dim or crumpled
  photo is the most likely reason a scan comes back empty. The form says what it
  thinks went wrong (blur, low contrast, dark) and offers a retry, manual entry,
  or pasting text instead.
- **A refund is guessed, not known.** Text matching `refund`, `credit`,
  `reversal` or `deposit` without a total line selects "Income", always at low
  confidence.
- **Scanning runs on the main thread.** The UI is not frozen solid — the pipeline
  yields between recognition batches so progress text updates — but a very long
  receipt will make the page sluggish while it reads. See below for why.

## Why there is no Web Worker

A worker is the obvious home for seconds of WASM work, and it was the first
implementation. It failed at build time: bundling a worker requires the pipeline
to be reachable through an asset URL, and Next's bundler rewrites that URL into a
path the ONNX runtime rejects (`Invalid URL`), which surfaced as a prerender
failure on `/transactions` — nowhere near the change that caused it.

The runtime import is now lazy (it must be: its module body resolves its own WASM
path when evaluated, which is what broke the server render), and scans run in
batches on the main thread with a yield between them. If the responsiveness ever
becomes the thing that hurts, the seam to revisit is
`src/lib/receipt-ocr-runtime.ts`: it has no React or DOM dependency beyond
`setTimeout`, so it can move back into a worker once the bundling question has a
reliable answer.

## Upgrading the OCR engine

The engines that give structural understanding of a receipt — rather than boxes
of text — are vision models like
[LightOnOCR-1B-1025](https://huggingface.co/lightonai/LightOnOCR-1B-1025)
(Apache-2.0, 1B parameters, trained on documents and receipts). It is the
documented upgrade path if the acceptance run below shows the current pipeline
missing amounts or dates on real photos.

**Why it is not the default.** Its output is markdown text, not JSON, so it
replaces the OCR stage and not the parsing stage. It is also not in Ollama's
library — multimodal import via two `FROM` lines in a Modelfile
[hangs](https://github.com/ollama/ollama/issues/17491) — so it runs as its own
pinned `llama-server` process with the vision projector, and llama.cpp's `mtmd`
path has had a
[degenerate-output regression](https://github.com/ggml-org/llama.cpp/issues/25652)
for this architecture. That is a second service, a version pin, and a tunnel if
the app is not on the same machine.

**Why it is reachable.** The seam is `runScan(image) → lines with coordinates` in
`src/lib/receipt-ocr-runtime.ts`. Layout grouping, the parser, the confidence
model, the review form and the save path are all downstream of that and would not
change. Shipping it means adding one module that posts the image to the service
and maps its markdown back into lines.

It also removes the 25MB in-browser download and the main-thread compute, which
is worth weighing on a phone.

## Acceptance run

Run this after any change to the model, the thresholds or the parser. Photograph
five real receipts — one skewed, one dim, one crumpled, one thermal — plus one
bank screenshot, and record per field:

| Receipt | Amount | Date | Name | Category | Seconds |
|---|---|---|---|---|---|
| skewed | | | | | |
| dim | | | | | |
| crumpled | | | | | |
| thermal | | | | | |
| screenshot | | | | | |

**The bar is amount and date correct on all five photos.** Merchant and category
are advisory by design; the review form is what makes them cheap to correct.

If amounts or dates miss on the skewed or dim photos, that is the measured signal
to move to the LightOnOCR engine above — the failure mode the current pipeline
cannot fix is detection quality on a bad photo, and a vision model sidesteps
detection entirely.

## Tests

```bash
npm test
```

Covers the layout grouping (including a tilted receipt, where a fixed y-bucket
would split a row), the parser (printed receipt, gas pump, tip, refund, ambiguous
date, no-total, garbage), the image maths, and the CTC decoder. The fixtures are
built from box positions, so a change in grouping behaviour shows up as a parser
failure rather than a silently different draft.
