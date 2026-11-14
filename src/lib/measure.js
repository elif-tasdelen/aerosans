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
  PROFILE_STRIP_HALF_MM,
  PROFILE_SIGMA_MM,
  EDGE_CENTER_SEARCH_MM,
  EDGE_PEAK_SEARCH_MM,
  EDGE_CONTRAST_REF,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  SNAP_RANGE_MM,
  PIXEL_MODE,
  CALIB_MIN_SEGMENT_PX,
  CALIB_OVERLAP_TOLERANCE,
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

// =============================================================================
// Axis-based measurement: works for any nerve direction, with or without a scale.
// Points are { x, y } in image pixel coordinates (pixel i covers [i, i + 1)).
// =============================================================================

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// --- Calibration helpers -------------------------------------------------------

/** Image-depth calibration: the scanner depth (mm) spans the clicked vertical distance. */
export function computeMmPerPxFromDepth(depthMm, top, bottom) {
  const h = Math.abs(bottom.y - top.y);
  if (!(h > 0)) throw new Error('Click two different heights for the top and bottom of the image field.');
  if (!(depthMm > 0)) throw new Error('Depth must be a positive number.');
  return depthMm / h;
}

/** True when a scale-bar segment is too short to calibrate reliably. */
export function calibrationSegmentTooShort(p1, p2, minPx = CALIB_MIN_SEGMENT_PX) {
  return dist(p1, p2) < minPx;
}

/**
 * True when both calibration endpoints sit on the two sheath edges (within `tolerance`
 * × ONSD length), i.e. the user calibrated on the structure being measured.
 */
export function calibrationOverlapsEdges(calibPts, edgePts, tolerance = CALIB_OVERLAP_TOLERANCE) {
  if (!calibPts || calibPts.length !== 2 || !edgePts || edgePts.length !== 2) return false;
  const [a, b] = calibPts;
  const [l, r] = edgePts;
  const len = dist(l, r);
  if (!(len > 0)) return false;
  const tol = tolerance * len;
  return (dist(a, l) <= tol && dist(b, r) <= tol) || (dist(a, r) <= tol && dist(b, l) <= tol);
}

// --- Axis geometry -------------------------------------------------------------------

/**
 * Unit vectors for the nerve axis: `u` points from the globe point along the nerve,
 * `n` is perpendicular to it and points to the image right (n.x ≥ 0).
 */
export function axisFrame(globePt, axisPt) {
  const len = dist(globePt, axisPt);
  if (!(len > 0)) throw new Error('The two axis points must be different.');
  const u = { x: (axisPt.x - globePt.x) / len, y: (axisPt.y - globePt.y) / len };
  let n = { x: u.y, y: -u.x };
  if (n.x < 0 || (n.x === 0 && n.y < 0)) n = { x: -n.x, y: -n.y };
  return { u, n, length: len };
}

export function pointAlongAxis(pt, dir, distancePx) {
  return { x: pt.x + dir.x * distancePx, y: pt.y + dir.y * distancePx };
}

/** Signed distance of `p` from `origin` along unit vector `dir`. */
export function projectOnto(p, origin, dir) {
  return (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
}

/** Image point of an edge given its offset (px) along `n` from the measurement centre. */
export function edgePoint(center, n, offset) {
  return pointAlongAxis(center, n, offset);
}

// --- Sampling ------------------------------------------------------------------------

/** Bilinear sample at continuous image coordinates (pixel centres at i + 0.5), clamped at borders. */
export function sampleBilinear(image, x, y) {
  const { pixels, width, height } = image;
  const fx = Math.min(width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = pixels[y0 * width + x0] * (1 - tx) + pixels[y0 * width + x1] * tx;
  const bottom = pixels[y1 * width + x0] * (1 - tx) + pixels[y1 * width + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Profile across the nerve: samples at `center + n·k` for k = −half … +half (1 px steps),
 * each averaged over a strip of ±stripHalfPx along the axis `u`.
 * @returns {{ values: Float64Array, half: number }} values[half] is the axis point
 */
export function sampleNormalProfile(image, { center, u, n, halfWidthPx, stripHalfPx = 0 }) {
  const half = Math.max(3, Math.round(halfWidthPx));
  const strip = Math.max(0, Math.round(stripHalfPx));
  const values = new Float64Array(2 * half + 1);
  for (let i = 0; i < values.length; i++) {
    const off = i - half;
    let acc = 0;
    for (let s = -strip; s <= strip; s++) {
      acc += sampleBilinear(image, center.x + n.x * off + u.x * s, center.y + n.y * off + u.y * s);
    }
    values[i] = acc / (2 * strip + 1);
  }
  return { values, half };
}

/** Gaussian smoothing (sigma in samples); the kernel is renormalised at the array ends. */
export function gaussianSmooth(values, sigma) {
  const n = values.length;
  const out = new Float64Array(n);
  if (!(sigma > 0)) {
    for (let i = 0; i < n; i++) out[i] = values[i];
    return out;
  }
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = [];
  for (let k = -radius; k <= radius; k++) kernel.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let wsum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      acc += values[j] * kernel[k + radius];
      wsum += kernel[k + radius];
    }
    out[i] = acc / wsum;
  }
  return out;
}

// --- Edge detection --------------------------------------------------------------------

/** First clear bright peak walking from `start` in direction `dir` up to `stop` (inclusive). */
function firstPeak(s, start, dir, stop, minValue, minContrast) {
  let best = -Infinity;
  let bestI = -1;
  for (let i = start + dir; dir > 0 ? i <= stop : i >= stop; i += dir) {
    if (s[i] > best) {
      best = s[i];
      bestI = i;
    } else if (best - minValue >= minContrast && s[i] < best - 0.25 * (best - minValue)) {
      break; // clearly past the peak
    }
  }
  return bestI >= 0 && best - minValue >= minContrast ? { index: bestI, value: best } : null;
}

export function confidenceLevel(score) {
  if (score >= CONFIDENCE_HIGH) return 'high';
  if (score >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}

/**
 * Sheath edges in a profile across the nerve.
 * 1. darkest point within ±centerSearch of the axis (nerve + subarachnoid band);
 * 2. first bright peak (hyperechoic dura) on each side, within ±peakSearch of the axis;
 * 3. each edge = 50 % crossing between the band minimum and that side's peak (sub-sample),
 *    i.e. the inner edge of the dura;
 * 4. confidence 0–1 from contrast, symmetry around the axis and a plausible width.
 * All distances are in samples (1 sample = 1 px).
 */
export function detectSheathEdges(values, {
  centerIndex = (values.length - 1) / 2,
  centerSearch,
  peakSearch,
  minWidth,
  maxWidth,
  sigma = 0,
  minContrast = EDGE_MIN_CONTRAST,
  contrastRef = EDGE_CONTRAST_REF,
}) {
  const fail = (reason) => ({ ok: false, reason, confidence: 0, level: 'low' });
  const n = values.length;
  if (n < 7) return fail('Profile too short.');
  const s = gaussianSmooth(values, sigma);
  const c = centerIndex;

  let minIndex = -1;
  let minValue = Infinity;
  for (let i = Math.max(1, Math.round(c - centerSearch)); i <= Math.min(n - 2, Math.round(c + centerSearch)); i++) {
    if (s[i] < minValue) {
      minValue = s[i];
      minIndex = i;
    }
  }
  if (minIndex < 0) return fail('No dark band near the axis.');

  const leftPeak = firstPeak(s, minIndex, -1, Math.max(0, Math.round(c - peakSearch)), minValue, minContrast);
  const rightPeak = firstPeak(s, minIndex, 1, Math.min(n - 1, Math.round(c + peakSearch)), minValue, minContrast);
  if (!leftPeak || !rightPeak) return fail('No bright sheath wall found on both sides.');

  const tL = (minValue + leftPeak.value) / 2;
  const tR = (minValue + rightPeak.value) / 2;
  let left = null;
  for (let i = minIndex; i > leftPeak.index; i--) {
    if (s[i - 1] >= tL) {
      left = i - 1 + (s[i - 1] - tL) / (s[i - 1] - s[i]);
      break;
    }
  }
  let right = null;
  for (let i = minIndex; i < rightPeak.index; i++) {
    if (s[i + 1] >= tR) {
      right = i + (tR - s[i]) / (s[i + 1] - s[i]);
      break;
    }
  }
  if (left === null || right === null) return fail('Edge crossing not found.');

  const width = right - left;
  const widthOk = width >= minWidth && width <= maxWidth;
  const lc = leftPeak.value - minValue;
  const rc = rightPeak.value - minValue;
  const contrast = Math.min(lc, rc);
  const contrastScore = clamp01(contrast / contrastRef);
  const offsetScore = 1 - clamp01(Math.abs((left + right) / 2 - c) / (0.5 * width));
  const peakSymmetry = Math.min(lc, rc) / Math.max(lc, rc);
  const symmetry = 0.5 * offsetScore + 0.5 * peakSymmetry;
  const confidence = widthOk ? 0.5 * contrastScore + 0.5 * symmetry : 0;

  return {
    ok: widthOk,
    reason: widthOk ? null : 'Implausible width.',
    left,
    right,
    minIndex,
    minValue,
    leftPeak,
    rightPeak,
    contrast,
    symmetry,
    confidence,
    level: confidenceLevel(confidence),
  };
}

/** Detection parameters in pixels for a given scale (or the fixed pixel-mode set without a scale). */
export function detectionParams(mmPerPx) {
  if (!(mmPerPx > 0)) {
    return {
      halfWidthPx: PIXEL_MODE.halfWidthPx,
      stripHalfPx: PIXEL_MODE.stripHalfPx,
      sigma: PIXEL_MODE.sigmaPx,
      centerSearch: PIXEL_MODE.centerSearchPx,
      peakSearch: PIXEL_MODE.peakSearchPx,
      minWidth: PIXEL_MODE.minWidthPx,
      maxWidth: PIXEL_MODE.maxWidthPx,
    };
  }
  const px = (mm) => mm / mmPerPx;
  return {
    halfWidthPx: px(PROFILE_HALF_WIDTH_MM),
    stripHalfPx: px(PROFILE_STRIP_HALF_MM),
    sigma: px(PROFILE_SIGMA_MM),
    centerSearch: px(EDGE_CENTER_SEARCH_MM),
    peakSearch: px(EDGE_PEAK_SEARCH_MM),
    minWidth: px(ONSD_MIN_PLAUSIBLE_MM),
    maxWidth: px(ONSD_MAX_PLAUSIBLE_MM),
  };
}

/** Width (px) and ONSD (mm, or null without a scale) from two edge offsets in either order. */
export function withEdgeOffsets(offsetA, offsetB, mmPerPx = null) {
  const leftOffset = Math.min(offsetA, offsetB);
  const rightOffset = Math.max(offsetA, offsetB);
  const widthPx = rightOffset - leftOffset;
  return { leftOffset, rightOffset, widthPx, onsdMm: mmPerPx > 0 ? widthPx * mmPerPx : null };
}

/**
 * Measure ONSD on the nerve axis defined by two clicks.
 * With a scale, the measurement point is MEASURE_DEPTH_MM along the axis from the globe point.
 * Without a scale (mmPerPx null), `depthPt` (clicked by the user) is projected onto the axis.
 * Edge offsets are in px along `n` from the measurement centre.
 */
export function measureOnAxis(image, { globePt, axisPt, mmPerPx = null, depthPt = null, depthMm = MEASURE_DEPTH_MM }) {
  const { u, n } = axisFrame(globePt, axisPt);
  const scaled = mmPerPx > 0;
  const p = detectionParams(mmPerPx);
  let center;
  if (scaled) {
    center = pointAlongAxis(globePt, u, depthMm / mmPerPx);
  } else {
    if (!depthPt) throw new Error('Without a scale, the measurement depth must be clicked.');
    center = pointAlongAxis(globePt, u, projectOnto(depthPt, globePt, u));
  }
  const base = {
    center,
    u,
    n,
    globePt,
    axisPt,
    halfWidthPx: Math.round(p.halfWidthPx),
    leftOffset: null,
    rightOffset: null,
    widthPx: null,
    onsdMm: null,
  };
  if (center.x < 0 || center.y < 0 || center.x > image.width || center.y > image.height) {
    return { ...base, ok: false, confidence: 0, level: 'low', reason: 'The measurement point falls outside the image.' };
  }

  const { values, half } = sampleNormalProfile(image, { center, u, n, halfWidthPx: p.halfWidthPx, stripHalfPx: p.stripHalfPx });
  const det = detectSheathEdges(values, { ...p, centerIndex: half });
  const result = { ...base, halfWidthPx: half, detection: det, confidence: det.confidence, level: det.level };
  if (!det.ok || det.level === 'low') {
    return { ...result, ok: false, reason: det.reason ?? 'Low detection confidence.' };
  }
  return { ...result, ok: true, ...withEdgeOffsets(det.left - half, det.right - half, mmPerPx) };
}

/** Move one edge to the projection of `point` on the measurement line and recompute the width. */
export function dragEdge(measurement, side, point, mmPerPx = null) {
  const offset = projectOnto(point, measurement.center, measurement.n);
  const other = side === 'left' ? measurement.rightOffset : measurement.leftOffset;
  return { ...measurement, ...withEdgeOffsets(offset, other, mmPerPx) };
}

/**
 * Snap the globe point to the strongest dark→bright transition (vitreous → retina) within
 * ±SNAP_RANGE_MM along the axis. Returns the original point if no clear transition exists.
 */
export function snapGlobePoint(image, pt, u, n, mmPerPx, rangeMm = SNAP_RANGE_MM) {
  if (!(mmPerPx > 0)) return pt;
  const range = Math.round(rangeMm / mmPerPx);
  const strip = Math.max(1, Math.round(0.25 / mmPerPx));
  const len = 2 * range + 1;
  const raw = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i - range;
    let acc = 0;
    for (let s = -strip; s <= strip; s++) {
      acc += sampleBilinear(image, pt.x + u.x * t + n.x * s, pt.y + u.y * t + n.y * s);
    }
    raw[i] = acc / (2 * strip + 1);
  }
  const sm = gaussianSmooth(raw, Math.max(1, 0.1 / mmPerPx));
  let best = 0;
  let bestI = -1;
  for (let i = 1; i < len - 1; i++) {
    const d = sm[i + 1] - sm[i - 1];
    if (d > best) {
      best = d;
      bestI = i;
    }
  }
  if (bestI < 0 || best < 6) return pt; // no clear dark→bright step (grey levels per 2 px)
  return pointAlongAxis(pt, u, bestI - range);
}
