# Receipt scanning

Photograph or upload a receipt and the app pre-fills the manual-transaction
form, so you verify a few numbers instead of typing six. Everything runs on the
device and the photo is never uploaded — the only request this feature makes is
the one that saves the transaction you confirm.

## What happens to the photo

```
photo / upload
  → the file's original bytes handed to the model              on device
  → LFM2.5-VL-450M reads the image and emits JSON              on device
  → JSON recovered and mapped to the form                      on device
  → review form → POST /api/transactions/manual          the only request
```

One vision-language model does the whole job. There is no text-detection stage, no
line recognition, and no rule-based parser: the model is given the image and
answers with the transaction.

## Which model, and why

`onnx-community/LFM2.5-VL-450M-ONNX`, 450M parameters, **316MB** at `q4f16`,
licence LFM Open License v1.0.

It was chosen from a browser benchmark of sub-1B vision-language models run in a
real Chrome tab on WebGPU over 24 de-leaked synthetic receipt photos — each
carrying perspective, shadow, blur and JPEG artefacts, because a phone camera never
sees a clean render:

| Model | Accuracy | Download | p50 |
|---|---|---|---|
| **LFM2.5-VL-450M** | **74.1%** | **316MB** | **2.5s** |
| SmolVLM-500M-Instruct | 63.2% | 466MB | 6.4s |
| SmolVLM2-500M-Video-Instruct | 58.5% | 466MB | 6.3s |
| SmolVLM-256M-Instruct | 22.4% | 255MB | 5.2s |

It won on every axis rather than trading between them. Per field: **total 75%,
currency 92%, merchant 69%, date 61%**, tax 54%.

Architecture mattered more than parameter count — changing family moved total
accuracy from 42% to 75%, while adding parameters inside the SmolVLM family did
much less.

### Why the previous pipeline was replaced

It ran, but in use the values came out wrong and dates essentially never worked.
Those failures lived in *recognition*, and no amount of downstream parsing can
recover a misread character. A single model that reads the image removes the stage
where the information was being lost.

The licence is not OSI-approved, which is worth knowing. The clause that matters
grants commercial use below **$10M annual revenue**.

## One-time setup

```bash
npm install
npm run dev
```

**No model setup step.** The weights are downloaded by the browser from Hugging
Face on first use and cached on the device, so neither the repository nor the
Docker image carries any model files.

## First scan on a device

The scan button reports the state before you tap it: plain **"Scan receipt"** when
the model is cached, a *"Needs a one-time ~316MB download"* hint when it is not, and
**"Downloading…"** while it is in flight. Clicking always opens the scanner.

Inside the modal the pick stage is one of five states rather than a photo picker
with a download notice beside it:

| State | What you see |
|---|---|
| Checking | "Checking the on-device models…" |
| Missing | **"This needs a one-time download first"** with a download button |
| Downloading | The progress bar, with byte counts and the file being fetched |
| Ready | The photo picker |
| Failed | The error, with **Try again** and **Enter it by hand** |

The picker is deliberately *not* shown until the model is present: an enabled
picker beside a download prompt invites a scan that cannot start.

**WebGPU is what makes this fast.** Without an adapter the model falls back to WASM,
which works but takes minutes rather than seconds; the review screen says so
explicitly rather than appearing hung. iOS Safari 26+ has WebGPU on by default.

Closing the modal does not cancel a download in progress — the bytes are wanted
either way, and at 316MB a cancelled transfer would discard a lot of progress.

## What each field is worth

| Field | Source | Confidence shown |
|---|---|---|
| Amount | The model's `total` | "check" when present, "missing" when null |
| Date | The model's `date` | "check" when present |
| Name | The model's `merchant` | "check" when present |
| Category | Never suggested | Always "missing" |

**Confidence means presence here, not accuracy.** The previous rule-based parser
derived genuine per-field confidence — whether a `TOTAL` row was labelled, whether a
date was ambiguous. A vision-language model reports nothing of the kind, so a
returned field reads 0.5 ("check") and an absent one 0 ("missing"). Every field
reading "check" rather than "read" is deliberate at 74% overall accuracy, and the
form always carries a note saying the amount and date are worth checking.

The prompt does not ask for a category, so that field is never pre-filled.

## Known limits

- **74% is a suggestion engine, not an authority.** Nothing here creates a
  transaction unattended, and the total is the field most often wrong.
- **Dates are the weakest field at 61%.** An ambiguous date is deliberately left
  empty rather than guessed: `03/04/2026` could be March 4th or April 3rd, and
  silently choosing would turn a miss into a plausible wrong answer. When the model
  returns null the date defaults to today, with a note.
- **The benchmark corpus is synthetic** — monospace thermal receipts in Latin
  script, no handwriting or crumpled paper, and the dataset authors leave real-photo
  transfer unmeasured. Synthetic accuracy is not your accuracy.
- **316MB is a real download, and iOS may evict it.** If the weights are reclaimed
  the next scan re-downloads them. `navigator.storage.persist()` is requested before
  the transfer, but WebKit has been reported as always refusing.
- **One transaction per scan.** A bank screenshot listing five rows yields one draft.
- **Income is never detected.** The model is not asked to classify, and a receipt is
  an expense far more often than not, so entries default to expense. A wrong guess
  is one tap to fix; a wrong amount is not.

## Output recovery

Models wrap JSON in prose and code fences even when told not to, and produce
documents that are invalid whole while holding individually perfect fields. The
parser therefore tries a direct parse, then a code fence, then braces, then bracket
repair for output truncated at the token ceiling, and finally field-level salvage,
before giving up. When nothing is usable the picker returns with the model's raw
reply shown, rather than dead-ending after a 316MB download.

## Tests

```bash
npm test
```

Covers the JSON recovery (fences, prose, truncation, field salvage), the value
coercion (currency symbols, thousands separators, the numeric formats models
actually emit), the date rules including the refusal to guess an ambiguous one, and
the mapping from extraction to the form including the confidence semantics.

The model itself is not exercised by `npm test` — that needs a browser with WebGPU —
so the accuracy numbers come from the benchmark harness, not from this suite.
