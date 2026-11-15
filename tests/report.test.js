import { describe, expect, it } from 'vitest';
import { buildCrewMission } from '../src/lib/crew.js';
import { buildReportModel, formatDate, pdfSafe, reportFilename } from '../src/lib/report.js';
import { buildResultState } from '../src/lib/result.js';
import { renderReportPdf } from '../src/components/reportPdf.js';
import { ACTIONS, DISCLAIMER_TEXT, REPORT, SCIENCE_NOTES } from '../src/config.js';

const NOW = new Date(2026, 10, 14, 9, 5);
const { crew, series, co2 } = buildCrewMission('A');
const source = { kind: 'phantom', seed: 42, realism: 'clean', tiltDeg: 0 };

const scaledResult = buildResultState({
  widthPx: 104,
  mmPerPx: 0.05,
  calibrationMode: 'scaleBar',
  calibrationLabel: 'Scale bar (phantom metadata)',
  method: 'auto-measure',
  confidence: 0.91,
  level: 'high',
  groundTruthMm: 5.2,
});
const noScaleResult = buildResultState({ widthPx: 104, mmPerPx: null, calibrationMode: 'none', calibrationLabel: 'No scale', method: 'manual' });

const model = (result, extra = {}) =>
  buildReportModel({ result, source, crewName: crew.name, series, co2, version: '0.1.0', now: NOW, ...extra });
const ids = (m) => m.sections.map((s) => s.id);
const text = (m) => JSON.stringify(m);

describe('report model', () => {
  it('returns null without a measurement', () => {
    expect(model(null)).toBeNull();
  });

  it('builds the header, file name and footer', () => {
    const m = model(scaledResult);
    expect(m.title).toBe('AeroSANS — ONSD Risk Report');
    expect(m.filename).toBe('AeroSANS_report_Crew_Member_A_2026-11-14.pdf');
    expect(m.meta).toEqual(['Generated: 2026-11-14 09:05', 'Crew member: Crew Member A (fictional)', 'App version: 0.1.0']);
    expect(m.disclaimer).toBe(DISCLAIMER_TEXT);
    expect(m.footer).toBe(
      'Simulated data where labeled. Not for clinical use. AI was used in this project (see README: AI Usage Declaration).'
    );
  });

  it('contains every section in order for a calibrated measurement', () => {
    const m = model(scaledResult);
    expect(ids(m)).toEqual(['measurement', 'risk', 'icp', 'action', 'trend', 'cabin', 'image', 'limitations', 'references']);
    const section = (id) => m.sections.find((s) => s.id === id);
    expect(section('measurement').lines.join('\n')).toContain('ONSD: 5.20 mm');
    expect(section('measurement').lines.join('\n')).toContain('Method: auto-measure');
    expect(section('measurement').lines.join('\n')).toContain('High (91%)');
    expect(section('measurement').lines.join('\n')).toContain('3 mm behind the globe');
    expect(section('risk').lines.join('\n')).toMatch(/BORDERLINE[\s\S]*Maissan et al., 2015[\s\S]*Soldatos et al., 2008[\s\S]*Berhanu/);
    expect(section('icp').lines.join('\n')).toMatch(/mmH₂O[\s\S]*mmHg[\s\S]*Wang et al., 2017[\s\S]*±0\.3 mm/);
    expect(section('action').lines).toEqual([ACTIONS.borderline]);
    expect(section('trend').image).toBe('trend');
    expect(section('trend').lines.join('\n')).toMatch(/Latest value \(day 180\): 5\.85 mm — High[\s\S]*Normal \d+, Borderline \d+, High \d+/);
    expect(section('cabin').lines.join('\n')).toMatch(/at scan time \(simulated\): \d\.\d mmHg[\s\S]*Weeks above 4\.0 mmHg/);
    expect(section('cabin').smallLines.join('\n')).toMatch(/OCHMO-TB-004[\s\S]*20150019624[\s\S]*Evans LA/);
    expect(section('image').image).toBe('measurement');
    expect(section('limitations').lines).toEqual([SCIENCE_NOTES.limitations]);
    expect(section('references').smallLines.length).toBeGreaterThanOrEqual(12);
  });

  it('omits risk, ICP and action without a scale and says why', () => {
    const m = model(noScaleResult, { source: { kind: 'upload' } });
    expect(m.scaled).toBe(false);
    expect(ids(m)).toEqual(['measurement', 'trend', 'cabin', 'image', 'limitations', 'references']);
    const lines = m.sections[0].lines.join('\n');
    expect(lines).toContain(REPORT.noScale);
    expect(lines).toContain('ONSD: 104.0 px');
    expect(lines).toContain('Uploaded ultrasound image');
    expect(lines).toContain('not applicable (manual edges)');
  });

  it('omits risk and ICP when the calibration has a warning', () => {
    const warned = buildResultState({
      widthPx: 104,
      mmPerPx: 0.05,
      calibrationMode: 'scaleBar',
      calibrationWarning: 'Calibration should use a known scale, not the structure being measured.',
      method: 'auto',
    });
    const m = model(warned);
    expect(ids(m)).not.toContain('risk');
    expect(ids(m)).not.toContain('icp');
    expect(m.sections[0].lines.join('\n')).toContain('Calibration warning');
  });

  it('uses the selected crew member in the name and the file name', () => {
    const c = buildCrewMission('C');
    const m = model(scaledResult, { crewName: c.crew.name, series: c.series, co2: c.co2 });
    expect(m.filename).toBe('AeroSANS_report_Crew_Member_C_2026-11-14.pdf');
    expect(m.meta[1]).toBe('Crew member: Crew Member C (fictional)');
  });

  it('never claims that anything is sent, and never calls the method AI', () => {
    const { footer, ...body } = model(scaledResult);
    const all = text(body);
    expect(all).not.toMatch(/transmit|mission control/i);
    // The measurement is never called AI; the footer only discloses AI use in development.
    expect(all).not.toMatch(/\bAI\b|artificial intelligence/);
    expect(footer).toMatch(/AI was used in this project/);
  });

  it('formats dates and file names, and makes text safe for the PDF fonts', () => {
    expect(formatDate(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(reportFilename('Crew Member B', new Date(2026, 0, 3))).toBe('AeroSANS_report_Crew_Member_B_2026-01-03.pdf');
    expect(pdfSafe('CO₂ ≤ 4.0, ONSD ≥ 5.7, −111.92 mmH₂O…')).toBe('CO2 <= 4.0, ONSD >= 5.7, -111.92 mmH2O...');
  });
});

describe('report PDF', () => {
  // 1×1 PNG stretched to the real snapshot sizes, so the layout is the same as in the browser.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const images = { trend: { dataUrl: png, width: 1200, height: 320 }, measurement: { dataUrl: png, width: 640, height: 480 } };

  it('lays out the full report on at most two A4 pages', async () => {
    const doc = await renderReportPdf(model(scaledResult), images);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const size = doc.internal.pageSize;
    expect(Math.round(size.getWidth())).toBe(210);
    expect(Math.round(size.getHeight())).toBe(297);
  });

  it('renders a no-scale report and a report without images', async () => {
    const a = await renderReportPdf(model(noScaleResult), images);
    expect(a.getNumberOfPages()).toBeLessThanOrEqual(2);
    const b = await renderReportPdf(model(scaledResult));
    expect(b.getNumberOfPages()).toBeLessThanOrEqual(2);
  });
});
