// Automatic globe and optic-nerve detection (beta). Pure logic: no React / DOM imports.
//
// Proposes the posterior globe point and a nerve-axis point; the user accepts or re-picks them.
// Images are { pixels, width, height } greyscale (0–255). Returned points are in the image's own
// pixel coordinates (pixel i covers [i, i + 1)).
//
// Steps: downscale (max width 400) + Gaussian blur → Otsu threshold inside the scan area → globe,
// found in two ways:
//   "dark-blob":      largest dark component in the upper 75 % that does not touch the left/right
//                     borders → robust algebraic circle fit;
//   "posterior-wall": (needs a scale) per scan column, the first strong dark→bright step after a
//                     long dark run (vitreous) → RANSAC circle fit with a radius of 8–16 mm;
// → nerve axis from the darkest (smoothed) column of each row below the globe, fitted with RANSAC →
// globe point = where the axis leaves the circle, refined to the strongest dark→bright step.
// The result with the higher confidence wins (debug.method).

import { axisFrame, confidenceLevel, gaussianSmooth, sampleBilinear } from './measure.js';
import { createRng } from './phantom.js';
import { WALL_MIN_VITREOUS_MM, WALL_NERVE_DEPTH_MM, WALL_NERVE_HALF_WIDTH_MM, WALL_RADIUS_RANGE_MM } from '../config.js';

export const AUTODETECT = {
  maxWidth: 400,
  blurSigma: 2,
  upperFraction: 0.75,
  minComponentFraction: 0.02,
  bottomConeDeg: 30,
  axisBandMm: [1, 8],
  axisBandPx: [10, 80],
  refineMm: 1,
  refinePx: 8,
  axisPointMm: 6,
  axisPointPx: 60,
  maxAxisAngleDeg: 35,
  // Plausible globe diameter as a fraction of the image width. The spec suggested 15–35 %, but a
  // linear-probe ocular scan (and the synthetic phantom, 62 %) shows the globe much larger, so the
  // upper bound is 75 %.
  globeSizeRange: [0.15, 0.75],
};

const clamp01 = (t) => Math.min(1, Math.max(0, t));

// --- Image helpers (small working image as Float32Array) -------------------------------

function downscale(image, maxWidth) {
  const { pixels, width, height } = image;
  const s = Math.min(1, maxWidth / width);
  const w = Math.max(1, Math.round(width * s));
  const h = Math.max(1, Math.round(height * s));
  const sx = width / w;
  const sy = height / h;
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const y0 = Math.floor(j * sy);
    const y1 = Math.max(y0 + 1, Math.floor((j + 1) * sy));
    for (let i = 0; i < w; i++) {
      const x0 = Math.floor(i * sx);
      const x1 = Math.max(x0 + 1, Math.floor((i + 1) * sx));
      let acc = 0;
      let n = 0;
      for (let y = y0; y < Math.min(height, y1); y++) {
        for (let x = x0; x < Math.min(width, x1); x++) {
          acc += pixels[y * width + x];
          n++;
        }
      }
      out[j * w + i] = n ? acc / n : 0;
    }
  }
  return { data: out, w, h, sx, sy };
}

function blur(data, w, h, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const k = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(data.length);
  const out = new Float32Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) acc += data[y * w + Math.min(w - 1, Math.max(0, x + t))] * k[t + radius];
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) acc += tmp[Math.min(h - 1, Math.max(0, y + t)) * w + x] * k[t + radius];
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Otsu threshold over 256 bins. */
export function otsuThreshold(data) {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[Math.min(255, Math.max(0, Math.round(data[i])))]++;
  const total = data.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Largest 4-connected component of `mask` within rows < maxRow that does not touch the left/right border. */
function largestComponent(mask, w, h, maxRow) {
  const label = new Int32Array(w * h).fill(-1);
  let best = null;
  const stack = [];
  for (let start = 0; start < w * maxRow; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = start;
    const pixels = [];
    let touchesSide = false;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || x === w - 1) touchesSide = true;
      const nbrs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < maxRow - 1 ? p + w : -1];
      for (const q of nbrs) {
        if (q >= 0 && mask[q] && label[q] === -1) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    if (!touchesSide && (!best || pixels.length > best.pixels.length)) best = { id, pixels };
  }
  return best ? { ...best, label } : null;
}

/** Algebraic (Kåsa) least-squares circle fit. */
export function fitCircle(points) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = points.length;
  for (const { x, y } of points) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] [D E F]ᵀ = −[sxz syz sz]ᵀ (Cramer's rule).
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const b = [-sxz, -syz, -sz];
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det3(A);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
  const col = (k) => A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
  const D = det3(col(0)) / d;
  const E = det3(col(1)) / d;
  const F = det3(col(2)) / d;
  const cx = -D / 2;
  const cy = -E / 2;
  const r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;
  return { cx, cy, r: Math.sqrt(r2) };
}

function circleResiduals(points, c) {
  return points.map(({ x, y }) => Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r));
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Circle fit that drops outliers (e.g. a dark nerve band joined to the globe) and refits. */
function robustCircle(points) {
  let pts = points;
  let c = fitCircle(pts);
  for (let it = 0; it < 3 && c; it++) {
    const res = circleResiduals(pts, c);
    const tol = Math.max(1.5, 2.5 * median(res));
    const kept = pts.filter((_, i) => res[i] <= tol);
    if (kept.length < 20 || kept.length === pts.length) break;
    pts = kept;
    c = fitCircle(pts);
  }
  return c ? { ...c, points: pts } : null;
}

/** RANSAC line x = a·y + b, then least squares on the inliers. */
function ransacLine(points, tol, rng, iterations = 200) {
  if (points.length < 3) return null;
  let best = null;
  for (let it = 0; it < iterations; it++) {
    const p = points[Math.floor(rng() * points.length)];
    const q = points[Math.floor(rng() * points.length)];
    if (Math.abs(p.y - q.y) < 1) continue;
    const a = (q.x - p.x) / (q.y - p.y);
    const b = p.x - a * p.y;
    const inliers = points.filter((m) => Math.abs(m.x - (a * m.y + b)) <= tol);
    if (!best || inliers.length > best.inliers.length) best = { a, b, inliers };
  }
  if (!best || best.inliers.length < 3) return null;
  // Least-squares refit on the inliers.
  const pts = best.inliers;
  const n = pts.length;
  const my = pts.reduce((s, m) => s + m.y, 0) / n;
  const mx = pts.reduce((s, m) => s + m.x, 0) / n;
  let num = 0;
  let den = 0;
  for (const m of pts) {
    num += (m.y - my) * (m.x - mx);
    den += (m.y - my) ** 2;
  }
  const a = den > 0 ? num / den : best.a;
  const b = mx - a * my;
  const inliers = points.filter((m) => Math.abs(m.x - (a * m.y + b)) <= tol);
  return { a, b, inliers, inlierRatio: inliers.length / points.length };
}

/** Darkest column (after extra smoothing) of each row in [y0, y1], within ±halfWin of centerX(y). */
function rowMinima(blurred, w, h, y0, y1, centerX, halfWin, sigma) {
  const minima = [];
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h - 1, Math.round(y1)); y++) {
    const cxRow = centerX(y + 0.5);
    const x0 = Math.max(0, Math.floor(cxRow - halfWin));
    const x1 = Math.min(w - 1, Math.ceil(cxRow + halfWin));
    if (x1 - x0 < 5) continue;
    const row = new Float64Array(x1 - x0 + 1);
    for (let x = x0; x <= x1; x++) row[x - x0] = blurred[y * w + x];
    const s = gaussianSmooth(row, sigma);
    let k = 1;
    for (let i = 1; i < s.length - 1; i++) if (s[i] < s[k]) k = i;
    if (k <= 0 || k >= s.length - 1) continue; // minimum on the window edge: not a band
    const denom = s[k - 1] - 2 * s[k] + s[k + 1];
    const sub = denom > 0 ? (0.5 * (s[k - 1] - s[k + 1])) / denom : 0;
    minima.push({ x: x0 + k + sub + 0.5, y: y + 0.5 });
  }
  return minima;
}

/**
 * Refine the globe point along the axis to the dark→bright step (vitreous → retina) within ±rangePx.
 * The step is measured in two strips BESIDE the axis (lateral offsets lateralIn…lateralOut px on each
 * side), because a bright optic-disc bump on the axis itself can hide the globe wall. Steps are also
 * weighted by closeness to the fitted circle. Returns the input point if there is no clear step.
 */
function refineAlongAxis(image, pt, u, n, rangePx, lateralIn, lateralOut, sigmaPx) {
  const range = Math.max(2, Math.round(rangePx));
  const kIn = Math.max(1, Math.round(lateralIn));
  const kOut = Math.max(kIn + 1, Math.round(lateralOut));
  const len = 2 * range + 1;
  const raw = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i - range;
    let acc = 0;
    let cnt = 0;
    for (let k = kIn; k <= kOut; k++) {
      for (const side of [-1, 1]) {
        acc += sampleBilinear(image, pt.x + u.x * t + n.x * k * side, pt.y + u.y * t + n.y * k * side);
        cnt++;
      }
    }
    raw[i] = acc / cnt;
  }
  const sm = gaussianSmooth(raw, Math.max(1, sigmaPx));
  const weightSigma = range / 2;
  let best = 0;
  let bestI = -1;
  for (let i = 1; i < len - 1; i++) {
    const step = sm[i + 1] - sm[i - 1];
    const t = i - range;
    const score = step * Math.exp(-(t * t) / (2 * weightSigma * weightSigma));
    if (score > best) {
      best = score;
      bestI = i;
    }
  }
  if (bestI < 0 || best < 4) return pt;
  return { x: pt.x + u.x * (bestI - range), y: pt.y + u.y * (bestI - range) };
}

function lowFail(reason, debug = {}) {
  return { globePoint: null, axisPoint: null, confidence: 0, level: 'low', reason, debug };
}

// --- Globe candidates ------------------------------------------------------------------

/** Path 1 ("dark-blob"): the globe is the largest dark component in the upper part of the scan area. */
function globeFromDarkBlob(ctx) {
  const { blurred, w, h, threshold, inSector, P } = ctx;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = blurred[i] <= threshold && inSector[i] ? 1 : 0;
  const maxRow = Math.max(2, Math.floor(h * P.upperFraction));
  const comp = largestComponent(mask, w, h, maxRow);
  if (!comp || comp.pixels.length < P.minComponentFraction * w * h) return { reason: 'No dark globe region found.' };

  // Boundary pixels (excluding the image top edge and the 75 % cut line, which are not real edges).
  const inComp = (x, y) => x >= 0 && y >= 0 && x < w && y < maxRow && comp.label[y * w + x] === comp.id;
  const boundary = [];
  for (const p of comp.pixels) {
    const x = p % w;
    const y = (p - x) / w;
    if (y === 0 || y >= maxRow - 1) continue;
    // The border of the scan area is not a real edge either.
    if (x === 0 || x === w - 1 || !inSector[p - 1] || !inSector[p + 1] || !inSector[p - w] || !inSector[p + w]) continue;
    if (!inComp(x - 1, y) || !inComp(x + 1, y) || !inComp(x, y - 1) || !inComp(x, y + 1)) boundary.push({ x: x + 0.5, y: y + 0.5 });
  }
  if (boundary.length < 20) return { reason: 'Globe boundary too small.' };
  const circle = robustCircle(boundary);
  if (!circle) return { reason: 'Circle fit failed.' };

  // Rough posterior point: lowest boundary point within ±30° of straight down.
  const cone = Math.cos((P.bottomConeDeg * Math.PI) / 180);
  let rough = { x: circle.cx, y: circle.cy + circle.r };
  let lowest = -Infinity;
  for (const p of circle.points) {
    const dx = p.x - circle.cx;
    const dy = p.y - circle.cy;
    if (dy / Math.hypot(dx, dy) >= cone && p.y > lowest) {
      lowest = p.y;
      rough = p;
    }
  }
  return { circle, rough };
}

/**
 * Path 2 ("posterior-wall", needs a scale): every scan column is walked from the probe side down.
 * The vitreous is a long dark run (≥ WALL_MIN_VITREOUS_MM); the first strong dark→bright step after
 * it is a posterior-wall candidate. A circle (radius within WALL_RADIUS_RANGE_MM) is fitted to the
 * candidates with RANSAC; the posterior pole is the point of the circle farthest from the probe.
 */
function globeFromPosteriorWall(ctx) {
  const { blurred, w, h, threshold, inSector, pxPerMm, rng } = ctx;
  if (!(pxPerMm > 0)) return { reason: 'Posterior-wall search needs a scale.' };
  const minRun = WALL_MIN_VITREOUS_MM * pxPerMm;
  const maxGap = Math.max(1, 0.5 * pxPerMm);
  const win = Math.max(2, Math.round(1.5 * pxPerMm));
  const bottomMargin = Math.max(2, pxPerMm);
  const candidates = [];

  for (let x = 0; x < w; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      if (inSector[y * w + x]) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0 || bottom - top < minRun) continue;

    // Longest dark run (short bright gaps are bridged).
    let best = null;
    let a = -1;
    let lastDark = -1;
    const close = () => {
      if (a >= 0 && (!best || lastDark - a > best.b - best.a)) best = { a, b: lastDark };
      a = -1;
    };
    for (let y = top; y <= bottom; y++) {
      if (blurred[y * w + x] <= threshold) {
        if (a < 0) a = y;
        lastDark = y;
      } else if (a >= 0 && y - lastDark > maxGap) {
        close();
      }
    }
    close();
    if (!best || best.b - best.a + 1 < minRun) continue;
    if (best.b >= bottom - bottomMargin) continue; // the dark run reaches the end of the scan area: no wall

    // Strongest dark→bright step around the end of the run.
    let g = 0;
    let gy = -1;
    for (let y = Math.max(top + 1, best.b - win); y <= Math.min(bottom - 1, best.b + win); y++) {
      const d = blurred[(y + 1) * w + x] - blurred[(y - 1) * w + x];
      if (d > g) {
        g = d;
        gy = y;
      }
    }
    if (gy < 0 || g < 4) continue;
    candidates.push({ x: x + 0.5, y: gy + 0.5 });
  }
  if (candidates.length < 12) return { reason: 'No posterior globe wall found.' };

  // RANSAC circle.
  const [rMin, rMax] = WALL_RADIUS_RANGE_MM.map((mm) => mm * pxPerMm);
  const tol = Math.max(1.5, 0.4 * pxPerMm);
  let bestFit = null;
  for (let it = 0; it < 400; it++) {
    const sample = [0, 1, 2].map(() => candidates[Math.floor(rng() * candidates.length)]);
    const c = fitCircle(sample);
    if (!c || c.r < rMin || c.r > rMax) continue;
    const inliers = candidates.filter((p) => Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) <= tol && p.y > c.cy);
    if (!bestFit || inliers.length > bestFit.inliers.length) bestFit = { c, inliers };
  }
  if (!bestFit || bestFit.inliers.length < 10) return { reason: 'Posterior wall does not fit a globe (radius 8–16 mm).' };
  let circle = bestFit.c;
  const refit = fitCircle(bestFit.inliers);
  if (refit && refit.r >= rMin && refit.r <= rMax) circle = refit;
  const rough = { x: circle.cx, y: circle.cy + circle.r };
  return {
    circle: { ...circle, points: bestFit.inliers },
    rough,
    wallInlierRatio: bestFit.inliers.length / candidates.length,
  };
}

// --- Nerve axis and confidence (shared by both paths) -----------------------------------------

function finishDetection(ctx, globe, method) {
  const { image, blurred, w, h, small, toOrig, P, scaled, mmPerPx, s, pxPerMm, rng } = ctx;
  const { circle, rough } = globe;
  const residual =
    Math.sqrt(circleResiduals(circle.points, circle).reduce((a, r) => a + r * r, 0) / circle.points.length) / circle.r;

  // Nerve axis from row minima below the globe (two passes: around the rough point, then the line).
  const pxSmall = (mm, px) => (scaled ? (mm / mmPerPx) * s : px * s);
  const wall = method === 'posterior-wall';
  const band = wall
    ? WALL_NERVE_DEPTH_MM.map((mm) => mm * pxPerMm)
    : [pxSmall(P.axisBandMm[0], P.axisBandPx[0]), pxSmall(P.axisBandMm[1], P.axisBandPx[1])];
  const halfWin = wall ? WALL_NERVE_HALF_WIDTH_MM * pxPerMm : 0.5 * circle.r;
  const rowSigma = Math.max(1, 0.12 * circle.r);
  const tol = Math.max(1.5, 0.04 * circle.r);
  let minima = rowMinima(blurred, w, h, rough.y + band[0], rough.y + band[1], () => rough.x, halfWin, rowSigma);
  let line = ransacLine(minima, tol, rng);
  if (line) {
    minima = rowMinima(blurred, w, h, rough.y + band[0], rough.y + band[1], (y) => line.a * y + line.b, halfWin, rowSigma);
    line = ransacLine(minima, tol, rng) ?? line;
  }
  const debugBase = {
    method,
    circle: { ...toOrig({ x: circle.cx, y: circle.cy }), r: circle.r * small.sx },
    minima: minima.map(toOrig),
    residual,
  };
  if (!line) return lowFail('No nerve band found below the globe.', debugBase);
  const angleDeg = (Math.atan(Math.abs(line.a)) * 180) / Math.PI;
  if (angleDeg > P.maxAxisAngleDeg) return lowFail(`Nerve axis too oblique (${angleDeg.toFixed(0)}°).`, debugBase);

  // Globe point = lower intersection of the axis with the circle (falls back to the rough point).
  const A = line.a * line.a + 1;
  const B = 2 * (line.a * (line.b - circle.cx) - circle.cy);
  const C = (line.b - circle.cx) ** 2 + circle.cy ** 2 - circle.r ** 2;
  const disc = B * B - 4 * A * C;
  let gpSmall = rough;
  let missed = false;
  if (disc >= 0) {
    const y = (-B + Math.sqrt(disc)) / (2 * A);
    gpSmall = { x: line.a * y + line.b, y };
  } else {
    missed = true;
  }

  // Axis direction (pointing down the nerve) in original coordinates.
  const dirOrig = { x: line.a * small.sx, y: small.sy };
  const gpOrig0 = toOrig(gpSmall);
  const farOrig = { x: gpOrig0.x + dirOrig.x * 100, y: gpOrig0.y + dirOrig.y * 100 };
  const { u, n } = axisFrame(gpOrig0, farOrig);

  // Refine to the strongest dark→bright transition (vitreous → retina) along the axis.
  const rOrig = circle.r * small.sx;
  const globePoint = scaled
    ? refineAlongAxis(image, gpOrig0, u, n, P.refineMm / mmPerPx, 1.0 / mmPerPx, 1.6 / mmPerPx, 0.1 / mmPerPx)
    : refineAlongAxis(image, gpOrig0, u, n, P.refinePx, 0.08 * rOrig, 0.13 * rOrig, 1);
  const axisDist = scaled ? P.axisPointMm / mmPerPx : P.axisPointPx;
  const axisPoint = { x: globePoint.x + u.x * axisDist, y: globePoint.y + u.y * axisDist };

  // Confidence.
  const fitScore = clamp01(1 - residual / 0.05);
  const inlierScore = clamp01((line.inlierRatio - 0.4) / 0.5);
  let confidence;
  let scores;
  const sizeRatio = (2 * circle.r) / w;
  if (wall) {
    // Nerve band vs the tissue beside it, on the rows of the line inliers.
    const side = [0.35 * halfWin, 0.7 * halfWin];
    let diff = 0;
    let rows = 0;
    for (const m of line.inliers) {
      const y = Math.min(h - 1, Math.max(0, Math.floor(m.y)));
      const at = (x) => blurred[y * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
      let acc = 0;
      let cnt = 0;
      for (let d = side[0]; d <= side[1]; d++) {
        acc += at(m.x - d) + at(m.x + d);
        cnt += 2;
      }
      diff += acc / cnt - at(m.x);
      rows++;
    }
    const contrast = rows ? diff / rows : 0;
    const contrastScore = clamp01(contrast / 40);
    const rms = Math.sqrt(line.inliers.reduce((a, m) => a + (m.x - (line.a * m.y + line.b)) ** 2, 0) / line.inliers.length);
    const linearity = clamp01(1 - rms / tol);
    confidence = 0.3 * fitScore + 0.25 * inlierScore + 0.25 * contrastScore + 0.2 * linearity;
    confidence *= clamp01(globe.wallInlierRatio / 0.5);
    scores = { fit: fitScore, inliers: inlierScore, contrast: contrastScore, linearity, wallInliers: globe.wallInlierRatio };
  } else {
    const [sLo, sHi] = P.globeSizeRange;
    const sizeScore =
      sizeRatio < sLo ? clamp01(1 - (sLo - sizeRatio) / sLo) : sizeRatio > sHi ? clamp01(1 - (sizeRatio - sHi) / 0.25) : 1;
    // Contrast: globe interior vs the tissue beside the nerve below the globe.
    let inside = 0;
    let nIn = 0;
    let below = 0;
    let nBelow = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = blurred[y * w + x];
        const d = Math.hypot(x + 0.5 - circle.cx, y + 0.5 - circle.cy);
        const off = Math.abs(x + 0.5 - (line.a * (y + 0.5) + line.b));
        if (d < 0.8 * circle.r) {
          inside += v;
          nIn++;
        } else if (y + 0.5 > gpSmall.y + band[0] && y + 0.5 < gpSmall.y + band[1] && off > 0.35 * circle.r && off < circle.r) {
          below += v;
          nBelow++;
        }
      }
    }
    const contrast = nIn && nBelow ? below / nBelow - inside / nIn : 0;
    const contrastScore = clamp01(contrast / 50);
    confidence = 0.3 * fitScore + 0.2 * sizeScore + 0.25 * contrastScore + 0.25 * inlierScore;
    scores = { fit: fitScore, size: sizeScore, contrast: contrastScore, inliers: inlierScore };
  }
  if (missed) confidence *= 0.5;

  return {
    globePoint,
    axisPoint,
    confidence,
    level: confidenceLevel(confidence),
    angleDeg,
    debug: { ...debugBase, inlierRatio: line.inlierRatio, sizeRatio, scores },
  };
}

/**
 * Detect the posterior globe point and the nerve axis.
 * Two ways of finding the globe are tried ("dark-blob" and, with a scale, "posterior-wall"); the
 * result with the higher confidence is returned and named in `debug.method`.
 * @param {{pixels, width, height}} image
 * @param {{ mmPerPx?: number|null, sector?: Uint8Array|null }} [options]  `sector` is an optional
 *   scan-area mask (1 = inside, same size as the image; see preprocess.js). Pixels outside it are ignored.
 * @returns {{ globePoint, axisPoint, confidence, level, angleDeg?, reason?, debug }}
 */
export function autodetect(image, { mmPerPx = null, sector = null } = {}) {
  const P = AUTODETECT;
  const scaled = mmPerPx > 0;
  if (!image || !(image.width > 10) || !(image.height > 10)) return lowFail('Image too small.');

  // Preprocess.
  const small = downscale(image, P.maxWidth);
  const { w, h } = small;
  const s = 1 / small.sx; // small px per original px (x and y are almost equal)
  const blurred = blur(small.data, w, h, P.blurSigma);
  const toOrig = (p) => ({ x: p.x * small.sx, y: p.y * small.sy });

  const inSector = new Uint8Array(w * h).fill(1);
  if (sector) {
    for (let y = 0; y < h; y++) {
      const oy = Math.min(image.height - 1, Math.floor((y + 0.5) * small.sy));
      for (let x = 0; x < w; x++) {
        const ox = Math.min(image.width - 1, Math.floor((x + 0.5) * small.sx));
        inSector[y * w + x] = sector[oy * image.width + ox] ? 1 : 0;
      }
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  let count = 0;
  for (let i = 0; i < blurred.length; i++) {
    if (!inSector[i]) continue;
    count++;
    lo = Math.min(lo, blurred[i]);
    hi = Math.max(hi, blurred[i]);
  }
  if (!count || hi - lo < 15) return lowFail('Image has almost no contrast.');
  const inside = sector ? blurred.filter((_, i) => inSector[i]) : blurred;
  const threshold = otsuThreshold(inside);

  const ctx = {
    image,
    small,
    w,
    h,
    s,
    blurred,
    toOrig,
    P,
    scaled,
    mmPerPx,
    inSector,
    threshold,
    pxPerMm: scaled ? s / mmPerPx : null,
    rng: createRng(7),
  };

  const results = [];
  const reasons = [];
  let fallback = null;
  for (const [method, find] of [
    ['dark-blob', globeFromDarkBlob],
    ['posterior-wall', globeFromPosteriorWall],
  ]) {
    if (method === 'posterior-wall' && !scaled) continue;
    ctx.rng = createRng(7);
    const globe = find(ctx);
    if (!globe.circle) {
      reasons.push(`${method}: ${globe.reason}`);
      continue;
    }
    const res = finishDetection(ctx, globe, method);
    if (res.globePoint) results.push(res);
    else {
      reasons.push(`${method}: ${res.reason}`);
      fallback = fallback ?? res;
    }
  }
  if (!results.length) {
    const base = fallback ?? lowFail(reasons[0] ?? 'Globe not found.');
    return { ...base, debug: { ...base.debug, rejected: reasons } };
  }
  results.sort((a, b) => b.confidence - a.confidence);
  const tried = results.map((r) => ({ method: r.debug.method, confidence: r.confidence }));
  return { ...results[0], debug: { ...results[0].debug, tried, rejected: reasons } };
}
