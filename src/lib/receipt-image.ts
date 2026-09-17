"use client";

/**
 * Canvas preparation for receipt photos.
 *
 * Everything here exists to make a phone photo easier to read: shrink it to a
 * size the detector handles, normalise the exposure that varies across a
 * handheld shot, and keep a preview so the user can see what the scanner saw.
 *
 * Deliberately no binarisation. Thresholding suits flatbed scans, but a
 * photograph has uneven lighting and thermal receipts have faint strokes, both
 * of which a hard threshold destroys before the recogniser ever sees them.
 */

import {
  measureQuality,
  stretchContrast,
  type QualityStats,
} from "@/src/lib/receipt-ocr-image";

/** Longest edge fed to the detector. Larger only slows the scan down. */
export const PREP_MAX_SIDE = 1600;

/** Refused before any decoding happens, so a 200MB file never gets read. */
export const PREP_MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface PreparedReceipt {
  /** RGBA pixels at the prepared size. */
  pixels: Uint8ClampedArray;
  size: { width: number; height: number };
  /** Object URL of the prepared image, for the preview. Owned by the caller. */
  previewUrl: string;
  quality: QualityStats;
}

export class ReceiptImageError extends Error {}

function fitWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };

  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decodes, downsizes and exposure-normalises a photo, returning pixels and a
 * preview.
 *
 * `createImageBitmap` is given `imageOrientation: "from-image"` so an iPhone
 * photo's EXIF rotation is applied here rather than leaving sideways text for
 * the detector — and it also decodes HEIC on the browsers that support it.
 */
export async function prepareReceiptImage(file: File): Promise<PreparedReceipt> {
  if (!file.type.startsWith("image/")) {
    throw new ReceiptImageError("That file is not an image.");
  }
  if (file.size === 0) {
    throw new ReceiptImageError("That file is empty.");
  }
  if (file.size > PREP_MAX_INPUT_BYTES) {
    throw new ReceiptImageError("That image is too large — try a screenshot instead.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Safari cannot decode some camera formats; a screenshot of the same
    // content works because it is already a PNG.
    throw new ReceiptImageError(
      "That image could not be opened. Take a screenshot of it and try that instead."
    );
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height, PREP_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new ReceiptImageError("This browser cannot read the image.");

    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const imageData = context.getImageData(0, 0, size.width, size.height);

    const grayscale = new Uint8Array(size.width * size.height);
    for (let i = 0; i < grayscale.length; i++) {
      const offset = i * 4;
      grayscale[i] = Math.round(
        0.299 * imageData.data[offset] +
          0.587 * imageData.data[offset + 1] +
          0.114 * imageData.data[offset + 2]
      );
    }

    const quality = measureQuality(grayscale);
    stretchContrast(grayscale);

    // The stretch is written back into the RGBA buffer so the recogniser crops
    // read the same improved pixels the preview shows.
    for (let i = 0; i < grayscale.length; i++) {
      const offset = i * 4;
      imageData.data[offset] = grayscale[i];
      imageData.data[offset + 1] = grayscale[i];
      imageData.data[offset + 2] = grayscale[i];
    }
    context.putImageData(imageData, 0, 0);

    const previewUrl = canvas.toDataURL("image/jpeg", 0.7);

    return {
      pixels: imageData.data,
      size,
      previewUrl,
      quality,
    };
  } finally {
    bitmap.close();
  }
}
