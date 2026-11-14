// Simulated mission ONSD series. Pure logic: no React / DOM imports.

import { classifyRisk, estimateIcp } from './measure.js';
import { createRng } from './phantom.js';

/** Maximum deterministic noise added to interpolated (non-anchor) points (± mm). */
export const SERIES_NOISE_MM = 0.05;

/** Linear interpolation of ONSD at `day` between sorted anchors (clamped at the ends). */
export function interpolateOnsd(anchors, day) {
  if (day <= anchors[0].day) return anchors[0].onsd;
  const last = anchors[anchors.length - 1];
  if (day >= last.day) return last.onsd;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (day >= a.day && day <= b.day) {
      const t = (day - a.day) / (b.day - a.day);
      return a.onsd + t * (b.onsd - a.onsd);
    }
  }
  return last.onsd;
}

/**
 * Weekly series from the first to the last anchor day (days 1, 8, 15, … plus the last day).
 * Anchor days are also included and keep their exact values; every other point gets
 * small seeded noise (±SERIES_NOISE_MM). Each point carries the risk signal and ICP range.
 * @returns {Array<{ day: number, onsd: number, isAnchor: boolean, risk: string, icp: object }>}
 */
export function buildWeeklySeries(anchors, seed = 1) {
  if (!anchors || anchors.length === 0) return [];
  const sorted = [...anchors].sort((a, b) => a.day - b.day);
  const first = sorted[0].day;
  const lastDay = sorted[sorted.length - 1].day;
  const anchorByDay = new Map(sorted.map((a) => [a.day, a.onsd]));

  const days = new Set(sorted.map((a) => a.day));
  for (let d = first; d <= lastDay; d += 7) days.add(d);
  days.add(lastDay);

  const rng = createRng(seed);
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => {
      const isAnchor = anchorByDay.has(day);
      let onsd;
      if (isAnchor) {
        onsd = anchorByDay.get(day);
      } else {
        const noise = (rng() * 2 - 1) * SERIES_NOISE_MM;
        onsd = Math.round((interpolateOnsd(sorted, day) + noise) * 100) / 100;
      }
      return { day, onsd, isAnchor, risk: classifyRisk(onsd), icp: estimateIcp(onsd) };
    });
}
