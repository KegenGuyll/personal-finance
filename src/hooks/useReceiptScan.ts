"use client";

import { useCallback, useRef, useState } from "react";

import { prepareImageForModel, ImagePreparationError } from "@/src/lib/receipt-image-prep";
import { breadcrumb, startScanLog } from "@/src/lib/scan-breadcrumbs";
import { scanReceiptImage } from "@/src/lib/receipt-vlm";
import {
  describeUnparseableOutput,
  mapExtractionToDraft,
  type MappedExtraction,
} from "@/src/lib/receipt-vlm-mapping";
import { parseReceiptJson } from "@/src/lib/receipt-vlm-prompt";

export type ScanStage = "pick" | "reading" | "review";

export interface ScanPreview {
  dataUrl: string;
  /** True when the model ran on the WASM fallback rather than WebGPU. */
  slow: boolean;
}

export interface ScanError {
  message: string;
  /** Present when the model replied but the reply could not be read. */
  rawText?: string;
}

/**
 * Runs a receipt photo through the vision model and maps the result for review.
 *
 * Orchestration only: the model call, the JSON recovery and the mapping each live
 * in their own module so they can be tested without a browser or a GPU.
 *
 * Generation is reported as it streams because it takes seconds even on WebGPU —
 * a static "Reading…" label for that long is indistinguishable from a hang.
 */
export function useReceiptScan() {
  const [stage, setStage] = useState<ScanStage>("pick");
  const [progress, setProgress] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [result, setResult] = useState<MappedExtraction | null>(null);
  const [error, setError] = useState<ScanError | null>(null);
  const [streamedChars, setStreamedChars] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  /** Revoked before being replaced, so repeated scans do not accumulate blobs. */
  const previewUrlRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setStage("pick");
    setProgress(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setStreamedChars(0);
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const scanFile = useCallback(async (file: File) => {
    // A fresh log per scan, so the last line of a crashed run is unambiguous.
    startScanLog();
    breadcrumb("file:received", `type=${file.type} bytes=${file.size}`);

    setError(null);
    setResult(null);
    setStreamedChars(0);
    setProgress("Reading the receipt…");

    try {
      // Downscale before anything else. A phone photo is ~12MP, which the model
      // would tile anyway; sending it whole exhausted the tab's memory on iOS and
      // the page was killed mid-scan.
      breadcrumb("prep:begin");
      const prepared = await prepareImageForModel(file);
      breadcrumb(
        "prep:ok",
        `${prepared.sourceWidth}x${prepared.sourceHeight} -> ${prepared.width}x${prepared.height}, ${prepared.bytes.byteLength} bytes`
      );

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = prepared.previewUrl;
      setPreview({ dataUrl: prepared.previewUrl, slow: false });

      controllerRef.current = new AbortController();
      setStage("reading");

      breadcrumb("inference:begin");
      const outcome = await scanReceiptImage(prepared.bytes, prepared.mediaType, {
        signal: controllerRef.current.signal,
        onToken: () => setStreamedChars((count) => count + 1),
      });

      breadcrumb("inference:ok", `device=${outcome.device} ms=${Math.round(outcome.generateMs)}`);
      setPreview({ dataUrl: prepared.previewUrl, slow: !outcome.accelerated });

      breadcrumb("parse:begin", `chars=${outcome.text.length}`);
      const extraction = parseReceiptJson(outcome.text);
      if (!extraction) {
        // Dead-ending after a 316MB download and a multi-second scan would be the
        // worst outcome, so the picker returns with the reason stated.
        setStage("pick");
        setProgress(null);
        setError({
          message: describeUnparseableOutput(outcome.text),
          rawText: outcome.text,
        });
        return;
      }

      breadcrumb("parse:ok");
      setResult(mapExtractionToDraft(extraction));
      setStage("review");
      setProgress(null);
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === "AbortError") {
        setStage("pick");
        setProgress(null);
        return;
      }

      breadcrumb("scan:ERROR", scanError instanceof Error ? scanError.message : String(scanError));
      setStage("pick");
      setProgress(null);
      setError({
        message:
          scanError instanceof ImagePreparationError
            ? scanError.message
            : scanError instanceof Error
              ? scanError.message
              : "The receipt could not be read.",
      });
    }
  }, []);

  return {
    stage,
    progress,
    preview,
    result,
    error,
    /** Tokens streamed so far, so the UI can show the model working. */
    streamedChars,
    scanFile,
    cancel,
    reset,
  };
}
