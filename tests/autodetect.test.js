import { describe, expect, it } from 'vitest';
import { autodetect, fitCircle, otsuThreshold } from '../src/lib/autodetect.js';
import { generatePhantom, createRng } from '../src/lib/phantom.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Signed tilt (degrees from vertical, positive toward image right) of the detected axis. */
const tiltOf = (r) => (Math.atan2(r.axisPoint.x - r.globePoint.x, r.axisPoint.y - r.globePoint.y) * 180) / Math.PI;

// The detected "posterior globe point" is the dark→bright step from vitreous to retina
// (the same boundary the user is asked to click), i.e. nerve.innerGlobePoint in the phantom metadata.

describe('autodetect helpers', () => {
  it('fits a circle exactly to points on a circle', () => {
    const pts = Array.from({ length: 50 }, (_, i) => {
      const a = (i / 50) * Math.PI * 1.5;
      return { x: 100 + 40 * Math.cos(a), y: 80 + 40 * Math.sin(a) };
    });
    const c = fitCircle(pts);
    expect(c.cx).toBeCloseTo(100, 6);
    expect(c.cy).toBeCloseTo(80, 6);
    expect(c.r).toBeCloseTo(40, 6);
  });

  it('Otsu separates two grey levels', () => {
    const data = new Float32Array(1000).map((_, i) => (i < 400 ? 30 : 200));
    const t = otsuThreshold(data);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(200);
  });
});

describe('autodetect on phantoms', () => {
  for (const tilt of [-20, 0, 20]) {
    it(`clean phantom, tilt ${tilt}°: globe point within 0.3 mm, axis within 3°`, () => {
      const ph = generatePhantom({ onsdMm: 5.2, tiltDeg: tilt, seed: 3 });
      const r = autodetect(ph, { mmPerPx: ph.mmPerPx });
      expect(r.globePoint).not.toBeNull();
      expect(dist(r.globePoint, ph.nerve.innerGlobePoint) * ph.mmPerPx).toBeLessThan(0.3);
      expect(Math.abs(tiltOf(r) - tilt)).toBeLessThan(3);
      expect(r.level).not.toBe('low');
    });
  }

  it('clean phantom without a scale (pixel mode) still finds the axis', () => {
    const ph = generatePhantom({ onsdMm: 6.0, tiltDeg: 10, seed: 5 });
    const r = autodetect(ph, { mmPerPx: null });
    expect(dist(r.globePoint, ph.nerve.innerGlobePoint)).toBeLessThan(8);
    expect(Math.abs(tiltOf(r) - 10)).toBeLessThan(3);
  });

  it('realistic phantoms: within 0.5 mm / 5°, or low confidence', () => {
    const rows = [];
    for (const tilt of [-20, 0, 20]) {
      for (const onsd of [4.5, 6.0]) {
        const ph = generatePhantom({ onsdMm: onsd, tiltDeg: tilt, seed: 3, realism: 'realistic' });
        const r = autodetect(ph, { mmPerPx: ph.mmPerPx });
        const errMm = r.globePoint ? dist(r.globePoint, ph.nerve.innerGlobePoint) * ph.mmPerPx : null;
        const errDeg = r.globePoint ? Math.abs(tiltOf(r) - tilt) : null;
        rows.push({ tilt, onsd, level: r.level, errMm, errDeg });
        expect((r.globePoint && errMm < 0.5 && errDeg < 5) || r.level === 'low').toBe(true);
      }
    }
    console.log(
      'Auto-detect on realistic phantoms:\n' +
        rows
          .map((x) => `  ${x.onsd} mm, ${String(x.tilt).padStart(3)}°: ${x.level}, point error ${x.errMm?.toFixed(2)} mm, angle error ${x.errDeg?.toFixed(1)}°`)
          .join('\n')
    );
  });
});

describe('autodetect robustness', () => {
  it('blank image → low confidence, no crash', () => {
    const img = { pixels: new Uint8ClampedArray(320 * 240).fill(128), width: 320, height: 240 };
    const r = autodetect(img);
    expect(r.level).toBe('low');
    expect(r.globePoint).toBeNull();
  });

  it('noise image → low confidence, no crash', () => {
    const rng = createRng(11);
    const img = { pixels: new Uint8ClampedArray(320 * 240).map(() => Math.floor(rng() * 256)), width: 320, height: 240 };
    const r = autodetect(img, { mmPerPx: 0.05 });
    expect(r.level).toBe('low');
  });

  it('tiny image → low confidence, no crash', () => {
    expect(autodetect({ pixels: new Uint8ClampedArray(25), width: 5, height: 5 }).level).toBe('low');
  });
});
