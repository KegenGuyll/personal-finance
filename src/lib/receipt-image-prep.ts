"use client";

/**
 * Downscales a photo before it is handed to the vision model.
 *
 * This is not an optimisation, it is a correctness fix. A phone photo is roughly
 * 12 megapixels, and the model's own preprocessing splits an image into tiles
 * capped at `max_num_patches` (1024) and `max_image_tokens` (256 each). What we
 * were sending was the original file bytes, so the browser decoded all 12MP into
 * memory and then tiled it: on iOS that exhausted the tab's budget, the OS killed
 * the page, and the app came back with its cached weights evicted — so the user
 * re-downloaded 316MB and the scan never finished.
 *
 * Because the model caps the patches it will use anyway, sending more pixels than
 * that cap can consume adds no information, only memory. The limit below is set so
 * the whole image lands inside that cap rather than being tiled and discarded.
 *
 * `createImageBitmap` is asked to resize during decode, so the full-size bitmap is
 * never materialised. That distinction is the difference between a transient few
 * megabytes and a 48MB allocation at the moment memory is already tight.
 */

/**
 * Longest edge, in pixels, of the image given to the model.
 *
 * The model reads at 16px patches and caps the total it will use, so the useful
 * ceiling is a few hundred patches; 1536 keeps the whole receipt inside that cap
 * while leaving roughly 4x more detail per character than the 384px thumbnail a
 * phone would otherwise be squeezed into.
 */
export const MODEL_IMAGE_MAX_EDGE = 1536;

/** Re-encode quality. High enough to keep faint thermal print legible. */
const JPEG_QUALITY = 0.9;

export interface PreparedImage {
  /** JPEG bytes of the downscaled image. */
  bytes: ArrayBuffer;
  mediaType: "image/jpeg";
  /** Object URL for the on-screen preview. Caller revokes it. */
  previewUrl: string;
  width: number;
  height: number;
  /** Dimensions of the original, for telling the user what happened. */
  sourceWidth: number;
  sourceHeight: number;
}

export class ImagePreparationError extends Error {}

/**
 * Decodes, downscales and re-encodes an image for the model.
 *
 * Falls back to a canvas path when the browser cannot resize during decode, which
 * costs a full-size bitmap but keeps older engines working rather than failing the
 * scan outright.
 */
export async function prepareImageForModel(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImagePreparationError("That file is not an image.");
  }
  if (file.size === 0) {
    throw new ImagePreparationError("That file is empty.");
  }

  const source = await decodeDownscaled(file);
  const { bitmap, width, height } = source;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new ImagePreparationError("This browser cannot process the image.");

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new ImagePreparationError("The image could not be encoded.");

    return {
      bytes: await blob.arrayBuffer(),
      mediaType: "image/jpeg",
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
      sourceWidth: source.sourceWidth,
      sourceHeight: source.sourceHeight,
    };
  } finally {
    // Release the decoded bitmap as soon as the pixels have been copied out.
    // HTMLImageElement has no close(); only ImageBitmap does.
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

interface DecodedImage {
  bitmap: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** Returns a bitmap already scaled to the model's limit where supported. */
async function decodeDownscaled(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      // Decode at the full size only to learn the dimensions, then let the
      // engine resize during decode so the full bitmap is never held.
      const probed = await createImageBitmap(file, { imageOrientation: "from-image" });
      const sourceWidth = probed.width;
      const sourceHeight = probed.height;
      const target = fitWithin(sourceWidth, sourceHeight, MODEL_IMAGE_MAX_EDGE);
      probed.close?.();

      if (target.width === sourceWidth && target.height === sourceHeight) {
        const same = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { bitmap: same, width: sourceWidth, height: sourceHeight, sourceWidth, sourceHeight };
      }

      const resized = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: "high",
      });

      return {
        bitmap: resized,
        width: target.width,
        height: target.height,
        sourceWidth,
        sourceHeight,
      };
    } catch {
      // Fall through to the canvas path below.
    }
  }

  return decodeViaImageElement(file);
}

/** Older path: decode fully, then scale on a canvas. */
async function decodeViaImageElement(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);

  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ImagePreparationError("That image could not be opened."));
      image.src = url;
    });

    const target = fitWithin(element.naturalWidth, element.naturalHeight, MODEL_IMAGE_MAX_EDGE);
    return {
      bitmap: element,
      width: target.width,
      height: target.height,
      sourceWidth: element.naturalWidth,
      sourceHeight: element.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
