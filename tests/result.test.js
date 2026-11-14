import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/measure.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    classifyRisk: vi.fn(actual.classifyRisk),
    estimateIcp: vi.fn(actual.estimateIcp),
  };
});

const { classifyRisk, estimateIcp } = await import('../src/lib/measure.js');
const { buildResultState } = await import('../src/lib/result.js');

describe('result state', () => {
  beforeEach(() => {
    classifyRisk.mockClear();
    estimateIcp.mockClear();
  });

  it('no-scale mode: pixels only, risk and ICP are never computed', () => {
    const r = buildResultState({ widthPx: 104, mmPerPx: null, calibrationMode: 'none', method: 'auto' });
    expect(r.widthPx).toBe(104);
    expect(r.onsdMm).toBeNull();
    expect(r.risk).toBeNull();
    expect(r.icp).toBeNull();
    expect(r.showClinical).toBe(false);
    expect(classifyRisk).not.toHaveBeenCalled();
    expect(estimateIcp).not.toHaveBeenCalled();
  });

  it('a calibration warning hides risk and ICP but keeps the mm value', () => {
    const r = buildResultState({
      widthPx: 104,
      mmPerPx: 0.05,
      calibrationMode: 'scaleBar',
      calibrationWarning: 'Calibration should use a known scale, not the structure being measured.',
      method: 'manual',
    });
    expect(r.onsdMm).toBeCloseTo(5.2, 10);
    expect(r.risk).toBeNull();
    expect(r.icp).toBeNull();
    expect(estimateIcp).not.toHaveBeenCalled();
  });

  it('scale bar or image depth: risk and ICP are shown', () => {
    for (const mode of ['scaleBar', 'depth']) {
      const r = buildResultState({ widthPx: 120, mmPerPx: 0.05, calibrationMode: mode, method: 'auto' });
      expect(r.onsdMm).toBeCloseTo(6.0, 10);
      expect(r.risk).toBe('high');
      expect(r.icp.mmH2O.low).toBeLessThan(r.icp.mmH2O.high);
      expect(r.showClinical).toBe(true);
    }
    expect(estimateIcp).toHaveBeenCalledTimes(2);
  });

  it('returns null without a width', () => {
    expect(buildResultState({ widthPx: null, mmPerPx: 0.05, calibrationMode: 'scaleBar', method: 'auto' })).toBeNull();
  });
});
