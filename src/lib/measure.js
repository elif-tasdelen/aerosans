// ONSD measurement pipeline. Pure logic: no React / DOM imports, so it can be
// unit-tested with Vitest. Images are { pixels, width, height } where `pixels`
// is a greyscale array (one value 0–255 per pixel, row-major).
//
// Coordinate convention: pixel index i covers [i, i + 1); its centre is i + 0.5.

import {
  MEASURE_DEPTH_MM,
  PROFILE_HALF_WIDTH_MM,
  PROFILE_ROW_HALF,
  PROFILE_SMOOTH_RADIUS,
  ONSD_MIN_PLAUSIBLE_MM,
  ONSD_MAX_PLAUSIBLE_MM,
  EDGE_MIN_CONTRAST,
  ONSD_BORDERLINE_MM,
  ONSD_HIGH_MM,
  ONSD_MEASUREMENT_ERROR_MM,
  WANG_INTERCEPT,
  WANG_SLOPE,
  MMH2O_PER_MMHG,
} from '../config.js';

/** Scale calibration: mm per pixel from two clicked points spanning `lengthMm`. */
export function computeMmPerPx(p1, p2, lengthMm) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(dist > 0)) throw new Error('Calibration points must be different.');
  if (!(lengthMm > 0)) throw new Error('Calibration length must be a positive number of mm.');
  return lengthMm / dist;
}

/**
 * y coordinate of the measurement line: `depthMm` behind the posterior globe
 * boundary. The nerve axis is assumed vertical (pointing down in the image).
 */
export function measurementLineY(globeY, mmPerPx, depthMm = MEASURE_DEPTH_MM) {
  return globeY + depthMm / mmPerPx;
}

/**
 * Sample a horizontal intensity profile centred on `xCenter` at row `y`,
 * averaging ±rowHalf rows. Out-of-image coordinates are clamped.
 * @returns {{ values: Float64Array, x0: number }} x0 = pixel index of values[0]
 */
export function sampleProfile(image, { y, xCenter, halfWidthPx, rowHalf = PROFILE_ROW_HALF }) {
  const { pixels, width, height } = image;
  const yc = Math.floor(y);
  const x0 = Math.floor(xCenter) - halfWidthPx;
  const n = 2 * halfWidthPx + 1;
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = Math.min(width - 1, Math.max(0, x0 + i));
    let acc = 0;
    let count = 0;
    for (let dy = -rowHalf; dy <= rowHalf; dy++) {
      const yy = Math.min(height - 1, Math.max(0, yc + dy));
      acc += pixels[yy * width + x];
      count++;
    }
    values[i] = acc / count;
  }
  return { values, x0 };
}

/** Centred moving average; the window shrinks at the array ends. */
export function smooth(values, radius = PROFILE_SMOOTH_RADIUS) {
  const n = values.length;
  const out = new Float64Array(n);
  if (radius <= 0) {
    for (let i = 0; i < n; i++) out[i] = values[i];
    return out;
  }
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) {
      acc += values[k];
      count++;
    }
    out[i] = acc / count;
  }
  return out;
}

/**
 * Find the outer edges of the dark nerve band in a profile.
 * Each edge is where the smoothed intensity crosses the midpoint between the
 * band minimum and the maximum on that side (the bright sheath wall), with
 * linear sub-pixel interpolation.
 *
 * Returns null when the result is not confident: no clear dark band, too little
 * contrast, a missing crossing, or an implausible width.
 *
 * @returns {null | { left: number, right: number, minIndex: number, minValue: number,
 *   leftMax: number, rightMax: number, contrast: number }} positions in sample indices
 */
export function findSheathEdges(values, {
  smoothRadius = PROFILE_SMOOTH_RADIUS,
  minContrast = EDGE_MIN_CONTRAST,
  minWidth = 0,
  maxWidth = Infinity,
  searchFraction = 0.5,
} = {}) {
  const n = values.length;
  if (n < 7) return null;
  const s = smooth(values, smoothRadius);

  // 1. Band minimum within the central part of the profile.
  const c = (n - 1) / 2;
  const span = Math.floor((n * searchFraction) / 2);
  let minIndex = -1;
  let minValue = Infinity;
  for (let i = Math.max(1, Math.round(c - span)); i <= Math.min(n - 2, Math.round(c + span)); i++) {
    if (s[i] < minValue) {
      minValue = s[i];
      minIndex = i;
    }
  }
  if (minIndex < 0) return null;

  // 2. Surrounding maximum on each side.
  let leftMax = -Infinity;
  let leftMaxI = -1;
  for (let i = 0; i < minIndex; i++) {
    if (s[i] > leftMax) {
      leftMax = s[i];
      leftMaxI = i;
    }
  }
  let rightMax = -Infinity;
  let rightMaxI = -1;
  for (let i = minIndex + 1; i < n; i++) {
    if (s[i] > rightMax) {
      rightMax = s[i];
      rightMaxI = i;
    }
  }
  if (leftMaxI < 0 || rightMaxI < 0) return null;

  const contrast = Math.min(leftMax, rightMax) - minValue;
  if (!(contrast >= minContrast)) return null;

  // 3. Walk outward from the minimum to the first midpoint crossing on each side.
  const tL = (minValue + leftMax) / 2;
  const tR = (minValue + rightMax) / 2;

  let left = null;
  for (let i = minIndex; i > leftMaxI; i--) {
    if (s[i - 1] >= tL) {
      left = i - 1 + (s[i - 1] - tL) / (s[i - 1] - s[i]);
      break;
    }
  }
  let right = null;
  for (let i = minIndex; i < rightMaxI; i++) {
    if (s[i + 1] >= tR) {
      right = i + (tR - s[i]) / (s[i + 1] - s[i]);
      break;
    }
  }
  if (left === null || right === null) return null;

  const widthSamples = right - left;
  if (widthSamples < minWidth || widthSamples > maxWidth) return null;

  return { left, right, minIndex, minValue, leftMax, rightMax, contrast };
}

/** ONSD in mm from detected edges (sample indices) and the image scale. */
export function onsdFromEdges(edges, mmPerPx) {
  return Math.abs(edges.right - edges.left) * mmPerPx;
}

/**
 * Estimated ICP range from ONSD using Wang et al. 2017.
 * The range is ONSD ± measurement error pushed through the formula.
 * Low values are clamped at 0.
 */
export function estimateIcp(onsdMm, errorMm = ONSD_MEASUREMENT_ERROR_MM) {
  const toH2O = (d) => Math.max(0, WANG_INTERCEPT + WANG_SLOPE * d);
  const mmH2O = {
    low: toH2O(onsdMm - errorMm),
    mid: toH2O(onsdMm),
    high: toH2O(onsdMm + errorMm),
  };
  const mmHg = {
    low: mmH2O.low / MMH2O_PER_MMHG,
    mid: mmH2O.mid / MMH2O_PER_MMHG,
    high: mmH2O.high / MMH2O_PER_MMHG,
  };
  return { mmH2O, mmHg, errorMm };
}

/** Risk signal from ONSD: 'normal' | 'borderline' | 'high'. Thresholds are inclusive lower bounds. */
export function classifyRisk(onsdMm, { borderline = ONSD_BORDERLINE_MM, high = ONSD_HIGH_MM } = {}) {
  if (onsdMm >= high) return 'high';
  if (onsdMm >= borderline) return 'borderline';
  return 'normal';
}

/**
 * Full automatic pipeline from a clicked posterior-globe point.
 * @returns {{ lineY: number, x0: number, halfWidthPx: number, edges: object|null,
 *   leftX?: number, rightX?: number, onsdMm: number|null, reason?: string }}
 * leftX / rightX are image x coordinates of the detected edges.
 */
export function measureOnsd(image, {
  globeX,
  globeY,
  mmPerPx,
  depthMm = MEASURE_DEPTH_MM,
  halfWidthMm = PROFILE_HALF_WIDTH_MM,
}) {
  const lineY = measurementLineY(globeY, mmPerPx, depthMm);
  const halfWidthPx = Math.max(3, Math.round(halfWidthMm / mmPerPx));
  const x0 = Math.floor(globeX) - halfWidthPx;
  const base = { lineY, x0, halfWidthPx, edges: null, onsdMm: null };

  if (lineY >= image.height - 1) {
    return { ...base, reason: 'The measurement line falls outside the image.' };
  }

  const profile = sampleProfile(image, { y: lineY, xCenter: globeX, halfWidthPx });
  const edges = findSheathEdges(profile.values, {
    minWidth: ONSD_MIN_PLAUSIBLE_MM / mmPerPx,
    maxWidth: ONSD_MAX_PLAUSIBLE_MM / mmPerPx,
  });
  if (!edges) {
    return { ...base, reason: 'Automatic edge detection was not confident.' };
  }
  return {
    ...base,
    edges,
    leftX: profile.x0 + edges.left + 0.5,
    rightX: profile.x0 + edges.right + 0.5,
    onsdMm: onsdFromEdges(edges, mmPerPx),
  };
}
