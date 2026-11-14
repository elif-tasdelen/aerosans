// Simulated cabin CO2 series (partial pressure, mmHg). Pure logic: no React / DOM imports.
// Every value produced here is simulated and must be labeled as such in the UI.

import { CO2, CO2_OPS_LIMIT_MMHG, CO2_SYMPTOM_MMHG } from '../config.js';
import { createRng } from './phantom.js';

/** Normal operating band of the simulated series (mmHg). */
export const CO2_BASE_MIN = 2.0;
export const CO2_BASE_MAX = 3.2;
/** Shape of the single elevated period: ramp up, two scans above the limit, recovery (mmHg). */
export const CO2_ELEVATED_PROFILE = [3.6, 4.3, 4.5, 3.7];

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * One simulated CO2 value per scan day, deterministic for a given seed.
 * Values stay within CO2_BASE_MIN…CO2_BASE_MAX except for one elevated period in the
 * second half of the mission.
 * @param {number[]} days  scan days (same days as the ONSD series)
 * @returns {Array<{ day: number, co2: number, elevated: boolean, simulated: true }>}
 */
export function buildCo2Series(days, seed = 1) {
  if (!days || days.length === 0) return [];
  const rng = createRng(seed);
  const n = days.length;
  const phase = rng() * Math.PI * 2;
  const start = Math.min(
    Math.max(0, n - CO2_ELEVATED_PROFILE.length),
    Math.floor(n * 0.45 + rng() * n * 0.3)
  );
  return days.map((day, i) => {
    const wobble = 0.35 * Math.sin(i / 3 + phase);
    const noise = (rng() - 0.5) * 0.5;
    const jitter = (rng() - 0.5) * 0.2;
    const k = i - start;
    const elevated = k >= 0 && k < CO2_ELEVATED_PROFILE.length;
    const value = elevated
      ? CO2_ELEVATED_PROFILE[k] + jitter
      : Math.min(CO2_BASE_MAX, Math.max(CO2_BASE_MIN, 2.6 + wobble + noise));
    return { day, co2: round1(value), elevated, simulated: true };
  });
}

/** Status of a CO2 value: below 2.3 nominal, 2.3–4.0 elevated, above 4.0 above the limit. */
export function co2Status(mmHg) {
  const id = mmHg > CO2_OPS_LIMIT_MMHG ? 'aboveLimit' : mmHg >= CO2_SYMPTOM_MMHG ? 'elevated' : 'nominal';
  return { id, label: CO2.status[id] };
}

/** Number of distinct mission weeks with at least one value above the operational limit. */
export function weeksAboveLimit(series, limit = CO2_OPS_LIMIT_MMHG) {
  const weeks = new Set();
  for (const p of series) if (p.co2 > limit) weeks.add(Math.floor((p.day - 1) / 7));
  return weeks.size;
}

/** Latest point of the series, or null. */
export function latestCo2(series) {
  return series.length ? series[series.length - 1] : null;
}

/** Chart.js datasets (right axis `co2`): the CO2 line plus dashed reference lines at 2.3 and 4.0 mmHg. */
export function co2Datasets(series, { line = '#8aa0b8', symptom = '#64748b', limit = '#cbd5e1' } = {}) {
  if (!series.length) return [];
  const x0 = series[0].day;
  const x1 = series[series.length - 1].day;
  const ref = (y, label, color) => ({
    label,
    data: [
      { x: x0, y },
      { x: x1, y },
    ],
    yAxisID: 'co2',
    borderColor: color,
    borderDash: [2, 5],
    borderWidth: 1.2,
    pointRadius: 0,
  });
  return [
    {
      label: CO2.legend,
      data: series.map((p) => ({ x: p.day, y: p.co2 })),
      yAxisID: 'co2',
      borderColor: line,
      backgroundColor: line,
      pointBackgroundColor: line,
      pointBorderColor: line,
      borderWidth: 1.5,
      pointRadius: 2,
      tension: 0.25,
    },
    ref(CO2_SYMPTOM_MMHG, `CO₂ ${CO2_SYMPTOM_MMHG.toFixed(1)} mmHg — ${CO2.symptomLabel}`, symptom),
    ref(CO2_OPS_LIMIT_MMHG, `CO₂ ${CO2_OPS_LIMIT_MMHG.toFixed(1)} mmHg — ${CO2.opsLimitLabel}`, limit),
  ];
}
