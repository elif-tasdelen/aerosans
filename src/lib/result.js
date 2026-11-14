// Builds the result shown in the UI. Pure logic: no React / DOM imports.
//
// Risk signal and ICP are computed ONLY with a real scale (scale bar or image depth) and no
// calibration warning. Without a scale the result stays in pixels and risk/ICP are null.

import { classifyRisk, estimateIcp } from './measure.js';

export const SCALED_MODES = ['scaleBar', 'depth'];

/**
 * @param {object} p
 * @param {number|null} p.widthPx        measured sheath width in pixels
 * @param {number|null} p.mmPerPx        scale (null without a scale)
 * @param {'scaleBar'|'depth'|'none'} p.calibrationMode
 * @param {string|null} [p.calibrationWarning]
 * @param {string} p.method              'auto' | 'auto (adjusted)' | 'manual'
 * @returns {null | object}
 */
export function buildResultState({
  widthPx,
  mmPerPx,
  calibrationMode,
  calibrationLabel = null,
  calibrationWarning = null,
  method,
  confidence = null,
  level = null,
  groundTruthMm = null,
}) {
  if (widthPx == null || !(widthPx > 0)) return null;
  const scaled = SCALED_MODES.includes(calibrationMode) && mmPerPx > 0;
  const onsdMm = scaled ? widthPx * mmPerPx : null;
  const showClinical = scaled && !calibrationWarning;
  return {
    widthPx,
    onsdMm,
    method,
    confidence,
    level,
    calibrationMode,
    calibrationLabel,
    calibrationWarning,
    showClinical,
    risk: showClinical ? classifyRisk(onsdMm) : null,
    icp: showClinical ? estimateIcp(onsdMm) : null,
    groundTruthMm,
  };
}
