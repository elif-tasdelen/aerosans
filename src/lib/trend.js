// Mission trend chart data. Pure logic: no React / DOM / Chart.js imports.
// Colors come from RISK_COLORS (the same source as the risk badge and the 3D sheath).

import { ONSD_BORDERLINE_MM, ONSD_HIGH_MM, RISK_COLORS, RISK_LABELS } from '../config.js';
import { co2Datasets } from './cabinCo2.js';

/** Risk color of each point in a series from buildWeeklySeries. */
export function pointColors(series) {
  return series.map((p) => RISK_COLORS[p.risk]);
}

/** Color of the segment from point i to point i + 1: the risk of the point it leads to. */
export function segmentColors(series) {
  return series.slice(1).map((p) => RISK_COLORS[p.risk]);
}

/**
 * Chart.js data for the mission trend: the ONSD series (points and segments colored by risk)
 * plus two dashed threshold lines at the borderline and high thresholds.
 */
export function trendChartData(series, co2Series = null, added = []) {
  const days = series.map((p) => p.day);
  const x0 = Math.min(...days);
  const x1 = Math.max(...days, ...added.map((p) => p.day));
  const colors = pointColors(series);
  const segColors = segmentColors(series);
  return {
    datasets: [
      {
        label: 'Simulated baseline',
        data: series.map((p) => ({ x: p.day, y: p.onsd })),
        pointBackgroundColor: colors,
        pointBorderColor: colors,
        segmentColors: segColors,
        segment: { borderColor: (ctx) => segColors[ctx.p0DataIndex] },
        borderWidth: 2.5,
        pointRadius: series.map((p) => (p.isAnchor ? 4.5 : 3)),
        tension: 0.25,
      },
      {
        label: `${RISK_LABELS.borderline} threshold (${ONSD_BORDERLINE_MM.toFixed(1)} mm)`,
        data: [
          { x: x0, y: ONSD_BORDERLINE_MM },
          { x: x1, y: ONSD_BORDERLINE_MM },
        ],
        borderColor: RISK_COLORS.borderline,
        borderDash: [6, 6],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      {
        label: `${RISK_LABELS.high} threshold (${ONSD_HIGH_MM.toFixed(1)} mm)`,
        data: [
          { x: x0, y: ONSD_HIGH_MM },
          { x: x1, y: ONSD_HIGH_MM },
        ],
        borderColor: RISK_COLORS.high,
        borderDash: [6, 6],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      // Optional cabin CO2 context on the right axis (simulated; no causal link is modeled).
      ...(co2Series ? co2Datasets(co2Series) : []),
      // Points measured in the app and added to the timeline (always the last dataset).
      ...(added.length ? [measuredDataset(series, added)] : []),
    ],
  };
}

export const MEASURED_LABEL = 'Measured in AeroSANS';

/**
 * Dataset of the points measured in the app: larger filled markers in the risk color, joined to
 * the last baseline point by a dashed line.
 */
export function measuredDataset(series, added) {
  const last = series[series.length - 1];
  const colors = [RISK_COLORS[last.risk], ...added.map((p) => RISK_COLORS[p.risk])];
  return {
    label: MEASURED_LABEL,
    data: [{ x: last.day, y: last.onsd }, ...added.map((p) => ({ x: p.day, y: p.onsd }))],
    measured: true,
    pointStyle: 'circle',
    pointRadius: [0, ...added.map(() => 8)],
    pointHoverRadius: [0, ...added.map(() => 10)],
    pointBackgroundColor: colors,
    pointBorderColor: '#ffffff',
    pointBorderWidth: 2,
    backgroundColor: colors[colors.length - 1],
    borderColor: '#ffffff',
    borderDash: [3, 4],
    borderWidth: 1.5,
    tension: 0,
  };
}

/** Summary of the latest point for the card header. */
export function latestPoint(series) {
  return series.length ? series[series.length - 1] : null;
}
