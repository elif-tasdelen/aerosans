// Crew sample scans and measured timeline points. Pure state logic: no React / DOM imports.
// The sample scans in public/samples/ are SIMULATED (code-generated, known ground-truth ONSD).

import { classifyRisk, estimateIcp } from './measure.js';

/** Scale of the sample scans: 0.04 mm per pixel (image depth 40 mm). */
export const SAMPLE_MM_PER_PX = 0.04;
export const SAMPLE_DEPTH_MM = 40;
export const SAMPLE_LABEL = 'Simulated scan';
/** A measured point is placed this many days after the last point of the crew member's series. */
export const TIMELINE_STEP_DAYS = 7;

export const CREW_SCANS = {
  A: { file: 'crewA_scan_onsd54.png', groundTruthMm: 5.4 },
  B: { file: 'crewB_scan_onsd46.png', groundTruthMm: 4.6 },
  C: { file: 'crewC_scan_onsd62.png', groundTruthMm: 6.2 },
};

/** Today's (simulated) scan of a crew member: file, path under the site base, scale and ground truth. */
export function crewScan(crewId) {
  const scan = CREW_SCANS[crewId] ?? CREW_SCANS.A;
  return {
    crewId: CREW_SCANS[crewId] ? crewId : 'A',
    file: scan.file,
    path: `samples/${scan.file}`,
    mmPerPx: SAMPLE_MM_PER_PX,
    depthMm: SAMPLE_DEPTH_MM,
    groundTruthMm: scan.groundTruthMm,
    label: SAMPLE_LABEL,
  };
}

/** Baseline series followed by the points measured in the app. */
export function seriesWithAdded(series, added = []) {
  return [...series, ...added];
}

/**
 * Add a measurement to one crew member's timeline.
 * @param {Record<string, Array>} added   measured points per crew id
 * @param {string} crewId
 * @param {Array} series                  that crew member's simulated baseline series
 * @param {number} onsdMm
 * @returns {{ added: Record<string, Array>, point: object }} a new map (the input is not changed)
 */
export function addTimelinePoint(added, crewId, series, onsdMm) {
  const own = added[crewId] ?? [];
  const all = seriesWithAdded(series, own);
  const lastDay = all.length ? all[all.length - 1].day : 0;
  const onsd = Math.round(onsdMm * 100) / 100;
  const point = {
    day: lastDay + TIMELINE_STEP_DAYS,
    onsd,
    isAnchor: false,
    measured: true,
    risk: classifyRisk(onsd),
    icp: estimateIcp(onsd),
  };
  return { added: { ...added, [crewId]: [...own, point] }, point };
}

/** Remove the measured points of one crew member. */
export function resetTimeline(added, crewId) {
  return { ...added, [crewId]: [] };
}

export function timelineToast(point, crewName) {
  return `Added: ${point.onsd.toFixed(2)} mm on day ${point.day} (${crewName})`;
}
