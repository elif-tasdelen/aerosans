import { describe, expect, it } from 'vitest';
import mission from '../src/data/mission_onsd.json';
import { buildCrewMission, CREW, getCrew } from '../src/lib/crew.js';
import { buildCo2Series, CO2_BASE_MAX, CO2_BASE_MIN, co2Datasets, co2Status, latestCo2, weeksAboveLimit } from '../src/lib/cabinCo2.js';
import { buildWeeklySeries, weeklyRiskCounts } from '../src/lib/mission.js';
import { trendChartData } from '../src/lib/trend.js';
import { CO2, CO2_OPS_LIMIT_MMHG, CO2_SYMPTOM_MMHG, ONSD_BORDERLINE_MM, ONSD_HIGH_MM } from '../src/config.js';

describe('crew roster (simulated)', () => {
  it('has three fictional crew members A, B and C', () => {
    expect(CREW.map((c) => c.name)).toEqual(['Crew Member A', 'Crew Member B', 'Crew Member C']);
    expect(getCrew('nope').id).toBe('A');
  });

  it('builds a deterministic mission for each crew member', () => {
    for (const { id } of CREW) {
      const a = buildCrewMission(id);
      const b = buildCrewMission(id);
      expect(a.series).toEqual(b.series);
      expect(a.co2).toEqual(b.co2);
      expect(a.co2.map((p) => p.day)).toEqual(a.series.map((p) => p.day));
    }
    expect(buildCrewMission('B').series).not.toEqual(buildCrewMission('C').series);
    expect(buildCrewMission('B').co2).not.toEqual(buildCrewMission('C').co2);
  });

  it('keeps Crew Member A on the existing mission data', () => {
    expect(buildCrewMission('A').series).toEqual(buildWeeklySeries(mission.anchors, 1));
  });

  it('Crew Member B never exceeds 5.0 mm and stays Normal', () => {
    const { series } = buildCrewMission('B');
    expect(Math.max(...series.map((p) => p.onsd))).toBeLessThan(ONSD_BORDERLINE_MM);
    expect(series.every((p) => p.risk === 'normal')).toBe(true);
  });

  it('Crew Member C reaches High around day 120, earlier than A', () => {
    const firstHigh = (id) => buildCrewMission(id).series.find((p) => p.onsd >= ONSD_HIGH_MM)?.day;
    expect(firstHigh('C')).toBeGreaterThanOrEqual(106);
    expect(firstHigh('C')).toBeLessThanOrEqual(127);
    expect(firstHigh('C')).toBeLessThan(firstHigh('A'));
  });

  it('counts mission weeks per risk level', () => {
    const counts = weeklyRiskCounts(buildCrewMission('B').series);
    expect(counts.borderline + counts.high).toBe(0);
    expect(counts.normal).toBe(26);
    const a = weeklyRiskCounts(buildCrewMission('A').series);
    expect(a.normal + a.borderline + a.high).toBe(26);
    expect(a.high).toBeGreaterThan(0);
  });
});

describe('cabin CO2 series (simulated)', () => {
  const days = buildCrewMission('A').series.map((p) => p.day);

  it('is deterministic per seed and has one value per scan day', () => {
    expect(buildCo2Series(days, 5)).toEqual(buildCo2Series(days, 5));
    expect(buildCo2Series(days, 5)).not.toEqual(buildCo2Series(days, 6));
    expect(buildCo2Series(days, 5).map((p) => p.day)).toEqual(days);
    expect(buildCo2Series([], 5)).toEqual([]);
  });

  it('stays in the 2.0–3.2 mmHg band except for one elevated period', () => {
    for (const seed of [1, 11, 22, 33, 99]) {
      const s = buildCo2Series(days, seed);
      expect(s.every((p) => p.simulated)).toBe(true);
      const base = s.filter((p) => !p.elevated);
      expect(Math.min(...base.map((p) => p.co2))).toBeGreaterThanOrEqual(CO2_BASE_MIN);
      expect(Math.max(...base.map((p) => p.co2))).toBeLessThanOrEqual(CO2_BASE_MAX);
      // One contiguous run of elevated points, with values above the operational limit.
      const idx = s.map((p, i) => (p.elevated ? i : -1)).filter((i) => i >= 0);
      expect(idx.length).toBe(4);
      expect(idx[idx.length - 1] - idx[0]).toBe(idx.length - 1);
      expect(s.some((p) => p.co2 > CO2_OPS_LIMIT_MMHG)).toBe(true);
      expect(weeksAboveLimit(s)).toBeGreaterThanOrEqual(1);
      expect(weeksAboveLimit(s)).toBeLessThanOrEqual(2);
    }
  });

  it('classifies CO2 status at 2.3 and 4.0 mmHg', () => {
    expect(co2Status(2.2).id).toBe('nominal');
    expect(co2Status(CO2_SYMPTOM_MMHG).id).toBe('elevated');
    expect(co2Status(CO2_OPS_LIMIT_MMHG).id).toBe('elevated');
    expect(co2Status(4.1).id).toBe('aboveLimit');
    expect(co2Status(4.1).label).toBe('Above ISS operational limit');
    expect(co2Status(3).label).toBe('Elevated — symptoms possible');
    expect(co2Status(2).label).toBe('Nominal');
  });

  it('counts distinct weeks above the limit and reports the latest value', () => {
    const s = [
      { day: 1, co2: 4.2 },
      { day: 3, co2: 4.4 },
      { day: 8, co2: 4.1 },
      { day: 15, co2: 4.0 },
    ];
    expect(weeksAboveLimit(s)).toBe(2);
    expect(latestCo2(s).day).toBe(15);
    expect(latestCo2([])).toBeNull();
  });

  it('adds CO2 to the trend chart on a second axis with labeled reference lines', () => {
    const { series, co2 } = buildCrewMission('A');
    const { datasets } = trendChartData(series, co2);
    expect(datasets).toHaveLength(6);
    const [line, symptom, limit] = datasets.slice(3);
    expect(line.label).toBe(CO2.legend);
    expect(line.yAxisID).toBe('co2');
    expect(line.data).toEqual(co2.map((p) => ({ x: p.day, y: p.co2 })));
    expect(symptom.data.map((d) => d.y)).toEqual([2.3, 2.3]);
    expect(limit.data.map((d) => d.y)).toEqual([4.0, 4.0]);
    expect(symptom.label).toContain(CO2.symptomLabel);
    expect(limit.label).toContain(CO2.opsLimitLabel);
    expect(symptom.borderDash.length).toBeGreaterThan(0);
    expect(trendChartData(series).datasets).toHaveLength(3);
    expect(co2Datasets([])).toEqual([]);
  });
});
