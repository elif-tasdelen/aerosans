import { describe, expect, it } from 'vitest';
import mission from '../src/data/mission_onsd.json';
import { buildWeeklySeries } from '../src/lib/mission.js';
import { classifyRisk } from '../src/lib/measure.js';
import { latestPoint, pointColors, segmentColors, trendChartData } from '../src/lib/trend.js';
import { ONSD_BORDERLINE_MM, ONSD_HIGH_MM, RISK_COLORS } from '../src/config.js';

const series = buildWeeklySeries(mission.anchors, 1);

describe('trend chart data', () => {
  it('colors every point by its risk, using RISK_COLORS', () => {
    const colors = pointColors(series);
    expect(colors).toHaveLength(series.length);
    series.forEach((p, i) => {
      expect(colors[i]).toBe(RISK_COLORS[classifyRisk(p.onsd)]);
    });
    expect(new Set(colors)).toEqual(new Set(['#22c55e', '#f59e0b', '#ef4444']));
  });

  it('colors each segment by the risk of the point it leads to', () => {
    const seg = segmentColors(series);
    expect(seg).toHaveLength(series.length - 1);
    seg.forEach((c, i) => expect(c).toBe(RISK_COLORS[series[i + 1].risk]));

    const ds = trendChartData(series).datasets[0];
    expect(ds.segment.borderColor({ p0DataIndex: 0 })).toBe(seg[0]);
    expect(ds.segment.borderColor({ p0DataIndex: seg.length - 1 })).toBe(RISK_COLORS.high);
  });

  it('maps days and ONSD to x/y and keeps the point colors on the dataset', () => {
    const ds = trendChartData(series).datasets[0];
    expect(ds.data).toEqual(series.map((p) => ({ x: p.day, y: p.onsd })));
    expect(ds.pointBackgroundColor).toEqual(pointColors(series));
  });

  it('adds dashed threshold lines at 5.0 and 5.7 mm across the mission', () => {
    const [, borderline, high] = trendChartData(series).datasets;
    expect(borderline.data.map((d) => d.y)).toEqual([ONSD_BORDERLINE_MM, ONSD_BORDERLINE_MM]);
    expect(high.data.map((d) => d.y)).toEqual([ONSD_HIGH_MM, ONSD_HIGH_MM]);
    expect(borderline.data.map((d) => d.x)).toEqual([1, 180]);
    expect(borderline.borderDash.length).toBeGreaterThan(0);
    expect(borderline.borderColor).toBe(RISK_COLORS.borderline);
    expect(high.borderColor).toBe(RISK_COLORS.high);
  });

  it('reports the latest point', () => {
    expect(latestPoint(series).day).toBe(180);
    expect(latestPoint([])).toBeNull();
  });
});
