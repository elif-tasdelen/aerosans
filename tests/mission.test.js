// AeroSANS — NASA Space Apps Challenge 2026
// Portions of this file were generated with AI assistance (Claude Code, Anthropic) and reviewed by the team.

import { describe, expect, it } from 'vitest';
import { buildWeeklySeries, interpolateOnsd, SERIES_NOISE_MM } from '../src/lib/mission.js';
import mission from '../src/data/mission_onsd.json';

const { anchors } = mission;

describe('mission data file', () => {
  it('is labeled as simulated and uses a fictional crew member', () => {
    expect(mission.label).toBe('Simulated data');
    expect(mission.crewMember).toBe('Crew Member A');
  });
});

describe('buildWeeklySeries', () => {
  const series = buildWeeklySeries(anchors, 42);

  it('preserves anchor values exactly', () => {
    for (const a of anchors) {
      const point = series.find((p) => p.day === a.day);
      expect(point).toBeDefined();
      expect(point.onsd).toBe(a.onsd);
      expect(point.isAnchor).toBe(true);
    }
  });

  it('is sorted and covers days 1–180 weekly', () => {
    const days = series.map((p) => p.day);
    expect(days[0]).toBe(1);
    expect(days[days.length - 1]).toBe(180);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    for (let d = 1; d <= 180; d += 7) expect(days).toContain(d);
  });

  it('keeps noise within ±0.05 mm of the interpolated trend', () => {
    for (const p of series) {
      expect(Math.abs(p.onsd - interpolateOnsd(anchors, p.day))).toBeLessThanOrEqual(SERIES_NOISE_MM + 0.005);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(buildWeeklySeries(anchors, 42)).toEqual(series);
    expect(buildWeeklySeries(anchors, 7)).not.toEqual(series);
  });

  it('adds risk and ICP to every point', () => {
    for (const p of series) {
      expect(['normal', 'borderline', 'high']).toContain(p.risk);
      expect(p.icp.mmH2O.low).toBeLessThan(p.icp.mmH2O.high);
    }
  });

  it('reaches high risk at day 180', () => {
    expect(series.find((p) => p.day === 180).risk).toBe('high');
  });
});
