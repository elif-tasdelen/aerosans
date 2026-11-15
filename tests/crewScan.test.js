import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { buildCrewMission } from '../src/lib/crew.js';
import {
  addTimelinePoint,
  CREW_SCANS,
  crewScan,
  resetTimeline,
  SAMPLE_MM_PER_PX,
  seriesWithAdded,
  timelineToast,
} from '../src/lib/crewScan.js';
import { buildReportModel } from '../src/lib/report.js';
import { buildResultState } from '../src/lib/result.js';
import { MEASURED_LABEL, trendChartData } from '../src/lib/trend.js';
import { RISK_COLORS } from '../src/config.js';

describe('crew sample scans (simulated)', () => {
  it('with Crew Member A selected, loads the crew A file with mmPerPx = 0.04', () => {
    const scan = crewScan('A');
    expect(scan.file).toBe('crewA_scan_onsd54.png');
    expect(scan.path).toBe('samples/crewA_scan_onsd54.png');
    expect(scan.mmPerPx).toBe(0.04);
    expect(scan.depthMm).toBe(40);
    expect(scan.groundTruthMm).toBe(5.4);
    expect(scan.label).toBe('Simulated scan');
  });

  it('maps every crew member to their own file, which exists in public/samples/', () => {
    expect(crewScan('B').file).toBe('crewB_scan_onsd46.png');
    expect(crewScan('C').file).toBe('crewC_scan_onsd62.png');
    expect(crewScan('B').groundTruthMm).toBe(4.6);
    expect(crewScan('C').groundTruthMm).toBe(6.2);
    for (const id of Object.keys(CREW_SCANS)) {
      expect(crewScan(id).mmPerPx).toBe(SAMPLE_MM_PER_PX);
      expect(existsSync(`public/${crewScan(id).path}`)).toBe(true);
    }
    expect(crewScan('nope').crewId).toBe('A');
  });
});

describe('add to timeline', () => {
  const a = buildCrewMission('A');
  const b = buildCrewMission('B');

  it('adds the point to the selected crew member only, 7 days after the last day', () => {
    const { added, point } = addTimelinePoint({}, 'A', a.series, 5.318);
    expect(Object.keys(added)).toEqual(['A']);
    expect(added.A).toHaveLength(1);
    expect(added.B).toBeUndefined();
    expect(point.day).toBe(a.series[a.series.length - 1].day + 7);
    expect(point.onsd).toBe(5.32);
    expect(point.risk).toBe('borderline');
    expect(point.measured).toBe(true);
    expect(point.icp.mmH2O.mid).toBeGreaterThan(0);
  });

  it('keeps other crew members and stacks further points 7 days apart', () => {
    let added = addTimelinePoint({}, 'A', a.series, 5.32).added;
    const before = added;
    added = addTimelinePoint(added, 'B', b.series, 4.43).added;
    added = addTimelinePoint(added, 'A', a.series, 5.9).added;
    expect(before.A).toHaveLength(1); // the input map is not changed
    expect(added.A.map((p) => p.day)).toEqual([187, 194]);
    expect(added.B.map((p) => p.day)).toEqual([187]);
    expect(added.A[1].risk).toBe('high');
    expect(seriesWithAdded(a.series, added.A)).toHaveLength(a.series.length + 2);

    const cleared = resetTimeline(added, 'A');
    expect(cleared.A).toEqual([]);
    expect(cleared.B).toHaveLength(1);
  });

  it('builds the toast text', () => {
    const { point } = addTimelinePoint({}, 'A', a.series.filter((p) => p.day <= 120), 5.32);
    expect(point.day).toBe(127);
    expect(timelineToast(point, 'Crew Member A')).toBe('Added: 5.32 mm on day 127 (Crew Member A)');
  });

  it('shows measured points as a separate, larger, filled dataset in the risk color', () => {
    const { added } = addTimelinePoint({}, 'A', a.series, 5.32);
    const { datasets } = trendChartData(a.series, a.co2, added.A);
    expect(datasets[0].label).toBe('Simulated baseline');
    const measured = datasets[datasets.length - 1];
    expect(measured.label).toBe(MEASURED_LABEL);
    expect(MEASURED_LABEL).toBe('Measured in AeroSANS');
    expect(measured.data[measured.data.length - 1]).toEqual({ x: 187, y: 5.32 });
    expect(measured.pointRadius[1]).toBeGreaterThan(Math.max(...datasets[0].pointRadius));
    expect(measured.pointBackgroundColor[1]).toBe(RISK_COLORS.borderline);
    // Threshold lines reach the new point; without added points nothing changes.
    expect(datasets[1].data[1].x).toBe(187);
    expect(trendChartData(a.series, a.co2).datasets).toHaveLength(6);
    expect(trendChartData(a.series, a.co2, added.A).datasets).toHaveLength(7);
  });

  it('the report trend includes the added point and names the simulated scan', () => {
    const { added } = addTimelinePoint({}, 'A', a.series, 5.32);
    const result = buildResultState({ widthPx: 133, mmPerPx: 0.04, calibrationMode: 'depth', method: 'auto-measure', confidence: 0.9, level: 'high', groundTruthMm: 5.4 });
    const model = buildReportModel({
      result,
      source: { kind: 'upload', simulated: true, groundTruthOnsdMm: 5.4 },
      crewName: 'Crew Member A',
      series: seriesWithAdded(a.series, added.A),
      co2: a.co2,
      version: '0.1.0',
      now: new Date(2026, 10, 15, 14, 0),
    });
    const trend = model.sections.find((s) => s.id === 'trend').lines.join('\n');
    expect(trend).toContain('Latest value (day 187): 5.32 mm — Borderline');
    expect(model.sections[0].lines[0]).toContain('Simulated crew scan');
    expect(model.sections[0].lines[0]).not.toContain('Uploaded');
  });
});
