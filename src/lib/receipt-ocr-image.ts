/**
 * Image maths shared by the receipt scanner and its tests.
 *
 * Kept free of canvas and DOM types so the resize, normalisation and quality
 * rules can be tested under `node --test`; the canvas plumbing that feeds them
 * lives in `receipt-ocr-image.ts`.
 */

/** Pixels of padding on each side of a detected box before recognition. */
export const BOX_UNCLIP_RATIO = 0.25;

/** Recognition input height. Matches the height the recogniser was trained at. */
export const REC_HEIGHT = 48;

/** Recognition input width; wider lines are scaled down to fit. */
export const REC_MAX_WIDTH = 320;

/** Detection input constraints: DBNet needs both dimensions divisible by 32. */
export const DET_MIN_SIDE = 640;
export const DET_MAX_SIDE = 1600;

/** Probability above which a detector pixel counts as text. */
export const DET_BINARIZE_THRESHOLD = 0.3;

/** Mean probability below which a whole detection is treated as noise. */
export const DET_MIN_BOX_CONFIDENCE = 0.3;

/** Area in original-image pixels below which a detection is discarded. */
export const DET_MIN_BOX_AREA = 12;

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Mean detector probability inside the box. */
  confidence: number;
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/**
 * Scales an image to sit within the detector's size window while keeping its
 * aspect ratio, then rounds both sides up to a multiple of 32.
 *
 * The rounding is a DBNet requirement rather than a preference: its backbone
 * downsamples by 32, so an odd input size makes the output probability map
 * misalign with the input and every box lands in the wrong place.
 */
export function computeDetectionSize(
  source: Size,
  minSide: number = DET_MIN_SIDE,
  maxSide: number = DET_MAX_SIDE
): Size {
  const width = Math.max(1, Math.round(source.width));
  const height = Math.max(1, Math.round(source.height));

  const longest = Math.max(width, height);
  const scale =
    longest < minSide ? minSide / longest : longest > maxSide ? maxSide / longest : 1;

  return {
    width: roundToMultiple(width * scale, 32),
    height: roundToMultiple(height * scale, 32),
  };
}

/**
 * Luminance in the 0–255 range, using the Rec. 601 weights the OCR models were
 * trained on. A plain channel average shifts red and blue text away from the
 * grey levels the recogniser expects.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Resamples RGBA pixels into a planar RGB `[1, 3, H, W]` tensor body, normalised
 * the way the PP-OCR models were trained.
 *
 * Both exported graphs take 3-channel RGB — the detector is declared
 * `[N, 3, H, W]` — so feeding greyscale is not an option, and the ImageNet
 * mean/std the training pipeline applied has to be reproduced here or the
 * detector's activations shift and it finds nothing.
 *
 * Sampling is nearest-neighbour on purpose: the input is only ever scaled down
 * from a photo, and the bilinear alternative softens the thin strokes of thermal
 * print, which is exactly the text this scanner has to read.
 */
export function resampleToRgbPlanar(
  rgba: Uint8ClampedArray | Uint8Array,
  source: Size,
  target: Size,
  options: { mean?: [number, number, number]; std?: [number, number, number] } = {}
): Float32Array {
  const mean = options.mean ?? PADDLE_MEAN;
  const std = options.std ?? PADDLE_STD;
  const plane = target.width * target.height;
  const out = new Float32Array(plane * 3);

  const scaleX = source.width / target.width;
  const scaleY = source.height / target.height;

  for (let y = 0; y < target.height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor((y + 0.5) * scaleY));
    for (let x = 0; x < target.width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor((x + 0.5) * scaleX));
      const offset = (sourceY * source.width + sourceX) * 4;
      const index = y * target.width + x;

      out[index] = (rgba[offset] / 255 - mean[0]) / std[0];
      out[plane + index] = (rgba[offset + 1] / 255 - mean[1]) / std[1];
      out[plane * 2 + index] = (rgba[offset + 2] / 255 - mean[2]) / std[2];
    }
  }

  return out;
}

/** ImageNet statistics, which is what PaddleOCR's training pipeline normalises with. */
export const PADDLE_MEAN: [number, number, number] = [0.485, 0.456, 0.406];
export const PADDLE_STD: [number, number, number] = [0.229, 0.224, 0.225];

interface Histogram {
  counts: Uint32Array;
  total: number;
}

function buildHistogram(grayscale: Uint8Array): Histogram {
  const counts = new Uint32Array(256);
  for (let i = 0; i < grayscale.length; i++) counts[grayscale[i]]++;
  return { counts, total: grayscale.length };
}

function percentileValue(histogram: Histogram, fraction: number): number {
  const target = histogram.total * fraction;
  let seen = 0;

  for (let value = 0; value < 256; value++) {
    seen += histogram.counts[value];
    if (seen >= target) return value;
  }

  return 255;
}

/**
 * Stretches contrast between the 2nd and 98th percentile of the greyscale
 * histogram, in place.
 *
 * Percentiles rather than min/max because a photo of a receipt almost always
 * contains a few near-black and near-white pixels; stretching to those extremes
 * leaves the actual text occupying a narrow band of greys. This is the same
 * reason the scanner avoids a hard binarisation step, which throws away the
 * faint strokes on thermal paper.
 */
export function stretchContrast(grayscale: Uint8Array): void {
  const histogram = buildHistogram(grayscale);
  const low = percentileValue(histogram, 0.02);
  const high = percentileValue(histogram, 0.98);
  if (high - low < 8) return;

  const scale = 255 / (high - low);
  for (let i = 0; i < grayscale.length; i++) {
    const value = (grayscale[i] - low) * scale;
    grayscale[i] = value < 0 ? 0 : value > 255 ? 255 : value;
  }
}

export interface QualityStats {
  /** Standard deviation of luminance; low values mean a flat, washed-out scan. */
  contrast: number;
  /** Share of near-black pixels; useful for spotting a photo taken in shadow. */
  darkRatio: number;
  /** Mean luminance on a 0–255 scale. */
  brightness: number;
}

export function measureQuality(grayscale: Uint8Array): QualityStats {
  let sum = 0;
  let squared = 0;
  let dark = 0;

  for (let i = 0; i < grayscale.length; i++) {
    const value = grayscale[i];
    sum += value;
    squared += value * value;
    if (value < 40) dark++;
  }

  const count = grayscale.length || 1;
  const mean = sum / count;
  const variance = Math.max(0, squared / count - mean * mean);

  return {
    contrast: Math.sqrt(variance),
    darkRatio: dark / count,
    brightness: mean,
  };
}

/**
 * Describes what is likely wrong with a photo, without claiming to fix it.
 *
 * These are advisory: a low-contrast warning on a receipt that still parsed
 * correctly is noise, so the texts stay short and the form shows them alongside
 * the extracted values rather than instead of them.
 */
export function describeQuality(stats: QualityStats): string[] {
  const warnings: string[] = [];

  if (stats.contrast < 25) {
    warnings.push("The image is low contrast — the photo may be washed out or blurry.");
  }
  if (stats.brightness < 70 || stats.darkRatio > 0.55) {
    warnings.push("The image looks dark — a brighter photo will read better.");
  }
  if (stats.brightness > 220) {
    warnings.push("The image looks overexposed — glare can hide faint print.");
  }

  return warnings;
}

/**
 * Expands a detected box outwards before it is cropped for recognition.
 *
 * The detector returns the tight ink box, which clips the first and last glyphs
 * once the crop is resized; padding by a share of the box height restores them.
 */
export function unclipBox(
  box: Box,
  image: Size,
  ratio: number = BOX_UNCLIP_RATIO
): Box {
  const padX = Math.max(2, box.height * ratio);
  const padY = Math.max(1, box.height * ratio * 0.5);

  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);

  return {
    x,
    y,
    width: Math.min(image.width - x, box.width + padX * 2),
    height: Math.min(image.height - y, box.height + padY * 2),
    confidence: box.confidence,
  };
}

/**
 * Decodes CTC output into text using greedy per-step argmax.
 *
 * `probabilities` is the recogniser's softmax output flattened to
 * `timeSteps * classCount`, and is used as-is: the exported graph ends in a
 * softmax, so the values are already probabilities and re-normalising them would
 * flatten the confidence this returns.
 *
 * Two details are specific to CTC rather than ordinary classification: repeated
 * indices collapse into one character (so "LL" in "HELLO" is not doubled), and
 * the model's last class is a blank that separates repeats.
 *
 * `blankIndex` is passed separately rather than inferred as `characters.length - 1`
 * because the dictionary holds one fewer entry than the model has classes — the
 * blank is a class index, not a character. The recogniser has 97 classes over a
 * 96-character dictionary, so deriving the blank from the array length would
 * decode every character past the first 96 as garbage.
 */
export function decodeCtc(
  probabilities: Float32Array,
  timeSteps: number,
  classCount: number,
  characters: string[],
  blankIndex: number = characters.length
): { text: string; confidence: number } {
  let text = "";
  let confidenceSum = 0;
  let kept = 0;
  let previous = -1;

  for (let t = 0; t < timeSteps; t++) {
    const offset = t * classCount;

    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < classCount; c++) {
      const score = probabilities[offset + c];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best === previous) continue;
    previous = best;
    if (best === blankIndex) continue;

    // A class with no dictionary entry is a conversion the dictionary does not
    // describe; skipping it degrades one glyph instead of emitting an index as
    // if it were text.
    const character = characters[best];
    if (character === undefined) continue;

    text += character;
    confidenceSum += bestScore;
    kept++;
  }

  return {
    text,
    confidence: kept === 0 ? 0 : confidenceSum / kept,
  };
}

/** Scales a box's height to the recognition height, capping its width. */
export function computeRecognitionCropSize(box: Box): Size {
  const height = REC_HEIGHT;
  const raw = (box.width * height) / Math.max(1, box.height);
  const width = Math.max(4, Math.min(REC_MAX_WIDTH, Math.round(raw)));

  return { width, height };
}

/**
 * Applies 3x3 binary dilation, in place, to a mask.
 *
 * Deliberately not part of the default box extraction. Dilation grows a blob
 * into any gap up to one pixel wide, which on a receipt means a line is as
 * likely to absorb the line below it as it is to have its own characters
 * joined. Those two errors are not symmetric: a line split in two still yields
 * readable text that row grouping recombines, whereas two fused lines corrupt
 * the total they were being read for.
 *
 * Exposed for the recognition stage, where a fragmented detection needs its
 * glyphs rejoined and there is no neighbouring line in the crop to damage.
 */
export function dilateMask(mask: Uint8Array, width: number, height: number): void {
  const source = mask.slice();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (source[index] === 1) continue;

      const hasNeighbour =
        (x > 0 && source[index - 1] === 1) ||
        (x < width - 1 && source[index + 1] === 1) ||
        (y > 0 && source[index - width] === 1) ||
        (y < height - 1 && source[index + width] === 1);

      if (hasNeighbour) mask[index] = 1;
    }
  }
}

/**
 * Finds connected components of a binary map in a single raster pass, using
 * union-find so that a box whose pixels touch diagonally is not split in two.
 */
export function findConnectedBoxes(
  mask: Uint8Array,
  width: number,
  height: number
): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const labels = new Int32Array(width * height).fill(-1);
  const parent: number[] = [];

  const find = (label: number): number => {
    let root = label;
    while (parent[root] !== root) root = parent[root];
    while (parent[label] !== root) {
      const next = parent[label];
      parent[label] = root;
      label = next;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const labelAt = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? -1 : labels[y * width + x];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (mask[index] === 0) continue;

      const neighbours = [labelAt(x - 1, y), labelAt(x, y - 1), labelAt(x - 1, y - 1), labelAt(x + 1, y - 1)].filter(
        (label) => label >= 0
      );

      if (neighbours.length === 0) {
        const label = parent.length;
        parent.push(label);
        labels[index] = label;
        continue;
      }

      const root = find(neighbours[0]);
      labels[index] = root;
      for (const neighbour of neighbours) union(root, neighbour);
    }
  }

  const components = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label < 0) continue;

      const root = find(label);
      const existing = components.get(root);
      if (!existing) {
        components.set(root, { x0: x, y0: y, x1: x, y1: y });
        continue;
      }
      if (x < existing.x0) existing.x0 = x;
      if (y < existing.y0) existing.y0 = y;
      if (x > existing.x1) existing.x1 = x;
      if (y > existing.y1) existing.y1 = y;
    }
  }

  return [...components.values()];
}

/**
 * Turns a detector probability map into text boxes in original-image
 * coordinates.
 *
 * `scaleX`/`scaleY` map the map's grid back onto the source image, because the
 * detector ran on a resized copy and every downstream crop must address the
 * original.
 */
export function probabilityMapToBoxes(
  probabilities: Float32Array,
  mapSize: Size,
  imageSize: Size,
  options: {
    threshold?: number;
    minBoxConfidence?: number;
    minArea?: number;
  } = {}
): Box[] {
  const {
    threshold = DET_BINARIZE_THRESHOLD,
    minBoxConfidence = DET_MIN_BOX_CONFIDENCE,
    minArea = DET_MIN_BOX_AREA,
  } = options;

  const mask = new Uint8Array(probabilities.length);
  for (let i = 0; i < probabilities.length; i++) {
    mask[i] = probabilities[i] >= threshold ? 1 : 0;
  }

  const scaleX = imageSize.width / mapSize.width;
  const scaleY = imageSize.height / mapSize.height;
  const boxes: Box[] = [];

  for (const component of findConnectedBoxes(mask, mapSize.width, mapSize.height)) {
    let sum = 0;
    let count = 0;

    for (let y = component.y0; y <= component.y1; y++) {
      for (let x = component.x0; x <= component.x1; x++) {
        const index = y * mapSize.width + x;
        if (mask[index] === 1) {
          sum += probabilities[index];
          count++;
        }
      }
    }

    if (count === 0) continue;
    const confidence = sum / count;
    if (confidence < minBoxConfidence) continue;

    const x = component.x0 * scaleX;
    const y = component.y0 * scaleY;
    const width = (component.x1 - component.x0 + 1) * scaleX;
    const height = (component.y1 - component.y0 + 1) * scaleY;

    // Padding is added here rather than after scaling so that only boxes that
    // already have real ink behind them survive the area filter.
    if (width * height < minArea) continue;

    boxes.push({ x, y, width, height, confidence });
  }

  // Reading order: top to bottom, then left to right.
  return boxes.sort((a, b) => (Math.abs(a.y - b.y) > a.height * 0.5 ? a.y - b.y : a.x - b.x));
}
