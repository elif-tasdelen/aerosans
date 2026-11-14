// One-click Auto-Measure. Pure logic: no React / DOM imports.
// Classical image processing only: globe circle fit and nerve-band line fit (autodetect.js),
// then the edge profile 3 mm behind the globe (measure.js).

import { autodetect } from './autodetect.js';
import { measureOnAxis } from './measure.js';

export const AUTO_MEASURE_METHOD = 'auto-measure';

function fail(stage, reason, extra = {}) {
  return { ok: false, level: 'low', stage, reason, measurement: null, points: null, circle: null, ...extra };
}

/**
 * Run the whole pipeline on a calibrated image.
 * Phantoms use their metadata axis; uploaded images use autodetect (accepted at medium or high
 * confidence). Any low-confidence step stops the pipeline.
 * @param {{ kind?: string, pixels, width, height, nerve?: object }} source
 * @param {{ mmPerPx: number }} options
 * @returns {{ ok: boolean, level: string, stage: string, reason?: string,
 *   measurement: object|null, points: {globePoint, axisPoint}|null, circle: object|null }}
 */
export function autoMeasure(source, { mmPerPx } = {}) {
  if (!source?.pixels || !(source.width > 0) || !(source.height > 0)) return fail('input', 'No image loaded.');
  if (!(mmPerPx > 0)) return fail('input', 'Auto-Measure needs a calibrated scale.');

  let detection;
  try {
    detection = autodetect(source, { mmPerPx });
  } catch (err) {
    detection = { globePoint: null, axisPoint: null, level: 'low', reason: err.message, debug: {} };
  }
  const circle = detection.debug?.circle ?? null;

  let points;
  if (source.kind === 'phantom' && source.nerve) {
    points = { globePoint: source.nerve.globePoint, axisPoint: source.nerve.axisPoint };
  } else {
    if (!detection.globePoint || !detection.axisPoint || detection.level === 'low') {
      return fail('detect', detection.reason ?? 'Globe and nerve were not found reliably.', { circle });
    }
    points = { globePoint: detection.globePoint, axisPoint: detection.axisPoint };
  }

  let res;
  try {
    res = measureOnAxis(source, { globePt: points.globePoint, axisPt: points.axisPoint, mmPerPx });
  } catch (err) {
    return fail('edges', err.message, { points, circle });
  }
  if (!res.ok || res.level === 'low') {
    return fail('edges', res.reason ?? 'Sheath edges are unclear.', { points, circle });
  }
  return {
    ok: true,
    level: res.level,
    stage: 'done',
    measurement: { ...res, method: AUTO_MEASURE_METHOD },
    points,
    circle,
  };
}
