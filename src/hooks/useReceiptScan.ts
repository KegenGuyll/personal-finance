"use client";

import { useCallback, useRef, useState } from "react";

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

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
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
    setError(null);
    setResult(null);
    setStreamedChars(0);
    setProgress("Reading the receipt…");

    const previewUrl = URL.createObjectURL(file);

    try {
      setPreview({ dataUrl: previewUrl, slow: false });

      // Hand over the file's own bytes rather than a canvas-derived copy: this
      // model reads the whole image itself, so preprocessing here could only lose
      // detail it would otherwise use.
      const bytes = await file.arrayBuffer();

      controllerRef.current = new AbortController();
      setStage("reading");

      const outcome = await scanReceiptImage(bytes, file.type, {
        signal: controllerRef.current.signal,
        onToken: () => setStreamedChars((count) => count + 1),
      });

      setPreview({ dataUrl: previewUrl, slow: !outcome.accelerated });

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

      setResult(mapExtractionToDraft(extraction));
      setStage("review");
      setProgress(null);
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === "AbortError") {
        setStage("pick");
        setProgress(null);
        return;
      }

      setStage("pick");
      setProgress(null);
      setError({
        message:
          scanError instanceof Error
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
