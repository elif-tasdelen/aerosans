// Geometry and color helpers for the 3D eye view. Pure logic: no React / DOM / three.js imports.

import { EYE_MM_PER_UNIT, EYE_NERVE_DIAMETER_MM, EYE_STATE_TEXT, RISK_COLORS, RISK_LABELS } from '../config.js';
import { classifyRisk } from './measure.js';

/** Sheath outer radius in scene units for a given ONSD (mm). */
export function sheathRadius(onsdMm) {
  return onsdMm / 2 / EYE_MM_PER_UNIT;
}

/** Optic nerve radius in scene units (fixed). */
export function nerveRadius() {
  return EYE_NERVE_DIAMETER_MM / 2 / EYE_MM_PER_UNIT;
}

/**
 * Sheath color (hex): the exact risk color used by the risk badge (RISK_COLORS in config.js),
 * or the neutral grey when the 3D view is not linked to a calibrated measurement.
 */
export function sheathColor(onsdMm, { neutral = false } = {}) {
  if (neutral || onsdMm == null) return RISK_COLORS.neutral;
  return RISK_COLORS[classifyRisk(onsdMm)];
}

/**
 * What the 3D eye shows:
 * - 'measured': the latest measurement has a real scale and no calibration warning;
 * - 'noScale':  the latest measurement is not usable in mm (no scale or unconfirmed scale),
 *               so the eye shows no risk and a neutral grey sheath;
 * - 'preview':  a slider value (no measurement yet, or the user moved the slider).
 * @param {{ latest: object|null, previewOnsd: number, previewActive: boolean }} p
 *        `latest` is the result from buildResultState (src/lib/result.js) or null.
 */
export function eyeViewState({ latest = null, previewOnsd, previewActive = false }) {
  if (!previewActive && latest) {
    if (latest.showClinical && latest.onsdMm != null) {
      const risk = classifyRisk(latest.onsdMm);
      return { mode: 'measured', onsdMm: latest.onsdMm, risk, badge: RISK_LABELS[risk], note: null, neutral: false };
    }
    const noScale = latest.calibrationMode === 'none' || latest.onsdMm == null;
    return {
      mode: 'noScale',
      onsdMm: null,
      risk: null,
      badge: noScale ? 'NO SCALE' : 'SCALE NOT CONFIRMED',
      note: noScale ? EYE_STATE_TEXT.noScale : EYE_STATE_TEXT.unconfirmed,
      neutral: true,
    };
  }
  const risk = classifyRisk(previewOnsd);
  return {
    mode: 'preview',
    onsdMm: previewOnsd,
    risk,
    badge: `PREVIEW · ${RISK_LABELS[risk]}`,
    note: EYE_STATE_TEXT.preview,
    neutral: false,
  };
}
