// One-click Auto-Measure. Pure logic: no React / DOM imports.
// Classical image processing only: clean-up (preprocess.js), globe circle fit and nerve-band line
// fit (autodetect.js), then the edge profile 3 mm behind the globe (measure.js).

import { autodetect } from './autodetect.js';
import { measureOnAxis } from './measure.js';
import { preprocess } from './preprocess.js';

export const AUTO_MEASURE_METHOD = 'auto-measure';

function fail(stage, reason, extra = {}) {
  return { ok: false, level: 'low', stage, reason, measurement: null, points: null, circle: null, ...extra };
}

/**
 * Images used by the pipeline. Uploaded images are cleaned first (annotations removed, scan-area
 * mask, median filter); synthetic phantoms are used as generated.
 */
export function prepareSource(source, { mmPerPx = null } = {}) {
  if (!source?.pixels || source.kind === 'phantom') return { detect: source, measure: source, sector: null };
  const pre = preprocess(source, { mmPerPx });
  return { detect: pre.despeckled, measure: pre.cleaned, sector: pre.sector };
}

/**
 * Run the whole pipeline on a calibrated image.
 * Phantoms use their metadata axis; uploaded images use autodetect (accepted at medium or high
 * confidence). A low-confidence step stops the pipeline; when the globe and axis were still found,
 * they are returned in `points` as a proposal the user can confirm (`uncertain: true`).
 * @param {{ kind?: string, pixels, width, height, rgba?: Uint8ClampedArray, nerve?: object }} source
 * @param {{ mmPerPx: number, prepared?: object }} options  `prepared` = prepareSource(...) result, to reuse it
 * @returns {{ ok: boolean, level: string, stage: string, reason?: string, uncertain?: boolean,
 *   measurement: object|null, points: {globePoint, axisPoint}|null, circle: object|null,
 *   detection?: { level: string, confidence: number, method: string } }}
 */
export function autoMeasure(source, { mmPerPx, prepared = null } = {}) {
  if (!source?.pixels || !(source.width > 0) || !(source.height > 0)) return fail('input', 'No image loaded.');
  if (!(mmPerPx > 0)) return fail('input', 'Auto-Measure needs a calibrated scale.');

  let prep;
  let detection;
  try {
    prep = prepared ?? prepareSource(source, { mmPerPx });
    detection = autodetect(prep.detect, { mmPerPx, sector: prep.sector });
  } catch (err) {
    return fail('detect', err.message);
  }
  const circle = detection.debug?.circle ?? null;
  const detInfo = { level: detection.level, confidence: detection.confidence, method: detection.debug?.method ?? null };

  let points;
  if (source.kind === 'phantom' && source.nerve) {
    points = { globePoint: source.nerve.globePoint, axisPoint: source.nerve.axisPoint };
  } else {
    if (!detection.globePoint || !detection.axisPoint) {
      return fail('detect', detection.reason ?? 'Globe and nerve were not found.', { circle, detection: detInfo });
    }
    points = { globePoint: detection.globePoint, axisPoint: detection.axisPoint };
    if (detection.level === 'low') {
      return fail('detect', 'Globe and nerve were found with low confidence.', { points, circle, detection: detInfo, uncertain: true });
    }
  }

  let res;
  try {
    res = measureOnAxis(prep.measure, { globePt: points.globePoint, axisPt: points.axisPoint, mmPerPx });
  } catch (err) {
    return fail('edges', err.message, { points, circle, detection: detInfo, uncertain: true });
  }
  if (!res.ok || res.level === 'low') {
    return fail('edges', res.reason ?? 'Sheath edges are unclear.', { points, circle, detection: detInfo, uncertain: true });
  }
  return {
    ok: true,
    level: res.level,
    stage: 'done',
    measurement: { ...res, method: AUTO_MEASURE_METHOD },
    points,
    circle,
    detection: detInfo,
  };
}
