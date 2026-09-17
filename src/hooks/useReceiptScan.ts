"use client";

import { useCallback, useRef, useState } from "react";

import { recogniseReceipt } from "@/src/lib/receipt-ocr-client";
import { parseReceipt, type ReceiptParseResult } from "@/src/lib/receipt-parser";
import type { ReceiptBox } from "@/src/lib/receipt-layout";
import { prepareReceiptImage, ReceiptImageError } from "@/src/lib/receipt-image";
import type { QualityStats } from "@/src/lib/receipt-ocr-image";

export type ScanStage = "pick" | "reading" | "review";

export interface ScanPreview {
  dataUrl: string;
  width: number;
  height: number;
  quality: QualityStats;
}

/**
 * Runs a receipt photo through preparation, OCR and parsing.
 *
 * Orchestration only: preparation, OCR and parsing each live in their own
 * module so they can be tested without a browser. Not a TanStack Query
 * mutation — a scan is local work with perceptible stages, so progress and
 * cancellation are part of the contract rather than a side effect.
 */
export function useReceiptScan(knownCategories: string[] | undefined) {
  const [stage, setStage] = useState<ScanStage>("pick");
  const [progress, setProgress] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [result, setResult] = useState<ReceiptParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pixels are tens of megabytes and are never rendered, so they stay out of
  // state; the preview the user sees is a small JPEG data URL instead.
  const pixelsRef = useRef<Uint8ClampedArray | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    pixelsRef.current = null;
    sizeRef.current = null;
    setStage("pick");
    setProgress(null);
    // The failed scan's image must not sit above a fresh drop zone, where it
    // would read as a preview of the photo the user is about to choose.
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const parse = useCallback(
    (boxes: ReceiptBox[]) => {
      const parsed = parseReceipt(boxes, { knownCategories: knownCategories ?? [] });
      setResult(parsed);
      setStage("review");
      setProgress(null);
    },
    [knownCategories]
  );

  const scanFile = useCallback(
    async (file: File) => {
      setError(null);
      setProgress("Preparing the photo…");

      try {
        const prepared = await prepareReceiptImage(file);
        pixelsRef.current = prepared.pixels;
        sizeRef.current = prepared.size;

        setPreview({
          dataUrl: prepared.previewUrl,
          width: prepared.size.width,
          height: prepared.size.height,
          quality: prepared.quality,
        });

        controllerRef.current = new AbortController();
        setStage("reading");
        setProgress("Loading the OCR models…");

        const { lines } = await recogniseReceipt(
          { pixels: prepared.pixels, size: prepared.size },
          {
            signal: controllerRef.current.signal,
            onProgress: (update) => {
              if (update.phase === "loading") setProgress("Loading the OCR models…");
              else if (update.phase === "detecting") setProgress("Finding the text…");
              else if (update.total) setProgress(`Reading line ${update.done} of ${update.total}…`);
              else setProgress("Reading the text…");
            },
          }
        );

        parse(lines);
      } catch (scanError) {
        setStage("pick");
        setProgress(null);
        setError(
          scanError instanceof ReceiptImageError
            ? scanError.message
            : scanError instanceof Error
              ? scanError.message
              : "The receipt could not be read."
        );
      }
    },
    [parse]
  );

  return {
    stage,
    progress,
    preview,
    result,
    error,
    scanFile,
    cancel,
    reset,
  };
}
