import { describe, expect, it } from 'vitest';
import {
  classifyRisk,
  computeMmPerPx,
  estimateIcp,
  findSheathEdges,
  measureOnsd,
  measurementLineY,
  onsdFromEdges,
  sampleProfile,
  smooth,
} from '../src/lib/measure.js';
import { createRng, generatePhantom } from '../src/lib/phantom.js';
import { MMH2O_PER_MMHG, ONSD_MEASUREMENT_ERROR_MM } from '../src/config.js';

describe('calibration', () => {
  it('computes mm per pixel from a horizontal scale bar', () => {
    expect(computeMmPerPx({ x: 0, y: 0 }, { x: 100, y: 0 }, 5)).toBeCloseTo(0.05, 10);
  });

  it('uses the Euclidean distance for diagonal points', () => {
    expect(computeMmPerPx({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)).toBeCloseTo(0.2, 10);
  });

  it('rejects identical points and non-positive lengths', () => {
    expect(() => computeMmPerPx({ x: 5, y: 5 }, { x: 5, y: 5 }, 5)).toThrow();
    expect(() => computeMmPerPx({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toThrow();
  });

  it('places the measurement line 3 mm behind the globe', () => {
    expect(measurementLineY(100, 0.05)).toBeCloseTo(160, 10);
    expect(measurementLineY(100, 0.1, 3)).toBeCloseTo(130, 10);
  });
});

describe('ICP estimate (Wang et al. 2017)', () => {
  it('gives 274.88 mmH2O at 5.0 mm', () => {
    const icp = estimateIcp(5.0);
    expect(icp.mmH2O.mid).toBeCloseTo(274.88, 6);
    expect(icp.mmHg.mid).toBeCloseTo(274.88 / MMH2O_PER_MMHG, 6);
  });

  it('returns a range from the measurement error', () => {
    const icp = estimateIcp(5.0);
    const e = ONSD_MEASUREMENT_ERROR_MM;
    expect(icp.mmH2O.low).toBeCloseTo(-111.92 + 77.36 * (5.0 - e), 6);
    expect(icp.mmH2O.high).toBeCloseTo(-111.92 + 77.36 * (5.0 + e), 6);
    expect(icp.mmH2O.low).toBeLessThan(icp.mmH2O.mid);
    expect(icp.mmH2O.high).toBeGreaterThan(icp.mmH2O.mid);
  });

  it('never returns negative pressures', () => {
    expect(estimateIcp(1.0).mmH2O.low).toBe(0);
  });
});

describe('risk classification', () => {
  it('respects the borderline and high boundaries', () => {
    expect(classifyRisk(4.99)).toBe('normal');
    expect(classifyRisk(5.0)).toBe('borderline');
    expect(classifyRisk(5.69)).toBe('borderline');
    expect(classifyRisk(5.7)).toBe('high');
    expect(classifyRisk(7.0)).toBe('high');
  });

  it('accepts custom thresholds', () => {
    expect(classifyRisk(5.5, { borderline: 5.6, high: 6.0 })).toBe('normal');
  });
});

describe('profile helpers', () => {
  it('smooth keeps a constant signal constant', () => {
    const out = smooth([3, 3, 3, 3, 3], 2);
    expect(Array.from(out)).toEqual([3, 3, 3, 3, 3]);
  });

  it('sampleProfile averages rows', () => {
    const width = 4;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = y * 10;
    const { values, x0 } = sampleProfile({ pixels, width, height }, { y: 2, xCenter: 2, halfWidthPx: 1, rowHalf: 2 });
    expect(x0).toBe(1);
    expect(Array.from(values)).toEqual([20, 20, 20]);
  });

  it('finds the edges of a clean synthetic band', () => {
    // 40 bright samples, 30 dark samples, 40 bright samples.
    const v = [...Array(40).fill(200), ...Array(30).fill(40), ...Array(41).fill(200)];
    const edges = findSheathEdges(v, { smoothRadius: 0 });
    expect(edges).not.toBeNull();
    expect(onsdFromEdges(edges, 0.1)).toBeCloseTo(3.0, 0);
  });

  it('returns null on a flat, low-contrast profile', () => {
    const rng = createRng(7);
    const v = Array.from({ length: 241 }, () => 100 + rng() * 6);
    expect(findSheathEdges(v)).toBeNull();
  });
});

describe('phantom round-trip', () => {
  it('is deterministic for a given seed', () => {
    const a = generatePhantom({ onsdMm: 5.2, seed: 11 });
    const b = generatePhantom({ onsdMm: 5.2, seed: 11 });
    expect(a.pixels).toEqual(b.pixels);
  });

  for (const onsdMm of [4.5, 5.2, 6.0]) {
    for (const seed of [1, 2, 3]) {
      it(`measures ${onsdMm} mm within 0.3 mm (seed ${seed})`, () => {
        const ph = generatePhantom({ onsdMm, seed });
        const sb = ph.scaleBar;
        const mmPerPx = computeMmPerPx({ x: sb.x1, y: sb.y1 }, { x: sb.x2, y: sb.y2 }, sb.lengthMm);
        expect(mmPerPx).toBeCloseTo(ph.mmPerPx, 10);

        const res = measureOnsd(ph, {
          globeX: ph.nerve.centerX,
          globeY: ph.nerve.globeBoundaryY,
          mmPerPx,
        });
        expect(res.onsdMm).not.toBeNull();
        expect(Math.abs(res.onsdMm - ph.groundTruthOnsdMm)).toBeLessThan(0.3);
      });
    }
  }

  it('tolerates an imprecise click (±1 mm off the nerve axis)', () => {
    const ph = generatePhantom({ onsdMm: 5.2, seed: 5 });
    for (const dx of [-20, 20]) {
      const res = measureOnsd(ph, {
        globeX: ph.nerve.centerX + dx,
        globeY: ph.nerve.globeBoundaryY + 4,
        mmPerPx: ph.mmPerPx,
      });
      expect(res.onsdMm).not.toBeNull();
      expect(Math.abs(res.onsdMm - 5.2)).toBeLessThan(0.3);
    }
  });
});
