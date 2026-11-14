import { describe, expect, it } from 'vitest';
import { autoMeasure, AUTO_MEASURE_METHOD } from '../src/lib/autoMeasure.js';
import { createRng, generatePhantom } from '../src/lib/phantom.js';

function noiseImage(width = 320, height = 240, seed = 3) {
  const rng = createRng(seed);
  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(rng() * 256);
  return { kind: 'upload', pixels, width, height };
}

describe('Auto-Measure', () => {
  it.each([4.5, 5.2, 6.0])('measures a clean %s mm phantom with error < 0.15 mm', (onsdMm) => {
    const ph = generatePhantom({ onsdMm, seed: 42 });
    const res = autoMeasure({ kind: 'phantom', ...ph }, { mmPerPx: ph.mmPerPx });
    expect(res.ok).toBe(true);
    expect(res.measurement.method).toBe(AUTO_MEASURE_METHOD);
    expect(res.level).not.toBe('low');
    expect(Math.abs(res.measurement.onsdMm - onsdMm)).toBeLessThan(0.15);
    expect(res.points.globePoint).toEqual(ph.nerve.globePoint);
  });

  it.each([4.5, 5.2, 6.0])('measures a clean %s mm phantom as an uploaded image (no metadata)', (onsdMm) => {
    const ph = generatePhantom({ onsdMm, seed: 42 });
    const res = autoMeasure({ kind: 'upload', pixels: ph.pixels, width: ph.width, height: ph.height }, { mmPerPx: ph.mmPerPx });
    expect(res.ok).toBe(true);
    expect(res.circle).not.toBeNull();
    expect(Math.abs(res.measurement.onsdMm - onsdMm)).toBeLessThan(0.15);
  });

  it('returns the low-confidence state on a noise image without crashing', () => {
    const res = autoMeasure(noiseImage(), { mmPerPx: 0.05 });
    expect(res.ok).toBe(false);
    expect(res.level).toBe('low');
    expect(res.measurement).toBeNull();
    expect(typeof res.reason).toBe('string');
  });

  it('returns the low-confidence state on a blank image', () => {
    const blank = { kind: 'upload', pixels: new Uint8ClampedArray(200 * 150).fill(128), width: 200, height: 150 };
    const res = autoMeasure(blank, { mmPerPx: 0.05 });
    expect(res.ok).toBe(false);
    expect(res.level).toBe('low');
  });

  it('needs an image and a scale', () => {
    expect(autoMeasure(null, { mmPerPx: 0.05 }).ok).toBe(false);
    expect(autoMeasure(noiseImage(), { mmPerPx: null }).stage).toBe('input');
    expect(autoMeasure(noiseImage()).ok).toBe(false);
  });
});
