import { describe, expect, it } from 'vitest';
import { autodetect } from '../src/lib/autodetect.js';
import { autoMeasure, prepareSource } from '../src/lib/autoMeasure.js';
import { detectSheathEdges, measureOnAxis } from '../src/lib/measure.js';
import { generatePhantom } from '../src/lib/phantom.js';
import { annotationMask, medianFilter, preprocess, sectorMask } from '../src/lib/preprocess.js';
import { addScreenFrame, addSpeckle, drawAnnotations, withRgba } from './helpers/syntheticScan.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const measure = (image, ph, extra = {}) =>
  measureOnAxis(image, { globePt: ph.nerve.globePoint, axisPt: ph.nerve.axisPoint, mmPerPx: ph.mmPerPx, ...extra });

describe('preprocessing', () => {
  const ph = generatePhantom({ onsdMm: 5.2, seed: 42 });

  it('leaves a clean phantom measurable: annotation clean-up changes the ONSD by < 0.05 mm', () => {
    const pre = preprocess(withRgba(ph), { mmPerPx: ph.mmPerPx });
    const raw = measure(ph, ph);
    const cleaned = measure(pre.cleaned, ph);
    expect(cleaned.ok).toBe(true);
    expect(Math.abs(cleaned.onsdMm - raw.onsdMm)).toBeLessThan(0.05);
    expect(pre.annotationFraction).toBeLessThan(0.01);
  });

  it('the median filter keeps the phantom edges in place (< 0.1 mm)', () => {
    const pre = preprocess(withRgba(ph), { mmPerPx: ph.mmPerPx });
    const raw = measure(ph, ph);
    const filtered = measure(pre.despeckled, ph);
    expect(filtered.ok).toBe(true);
    expect(Math.abs(filtered.onsdMm - raw.onsdMm)).toBeLessThan(0.1);
  });

  it('median filter removes isolated outliers and keeps flat areas', () => {
    const px = new Uint8ClampedArray(81).fill(100);
    px[40] = 255;
    const out = medianFilter(px, 9, 9, 1);
    expect(out[40]).toBe(100);
    expect(new Set(out)).toEqual(new Set([100]));
  });

  it('masks white calipers and a yellow line, and the measurement changes by < 0.2 mm', () => {
    const base = measure(ph, ph);
    // Calipers on both sheath edges on the measurement line, joined by a yellow line, plus two more marks.
    const y = base.center.y;
    const l = { x: base.center.x + base.leftOffset, y };
    const r = { x: base.center.x + base.rightOffset, y };
    const annotated = drawAnnotations(ph, [l, r, ph.nerve.globePoint, { x: base.center.x, y: y + 20 }]);

    const mask = annotationMask(annotated, { mmPerPx: ph.mmPerPx });
    const at = (p) => mask[Math.round(p.y) * ph.width + Math.round(p.x)];
    expect(at(l)).toBe(1);
    expect(at({ x: (l.x + r.x) / 2, y })).toBe(1);

    const pre = preprocess(annotated, { mmPerPx: ph.mmPerPx });
    const cleaned = measure(pre.cleaned, ph);
    expect(cleaned.ok).toBe(true);
    expect(Math.abs(cleaned.onsdMm - base.onsdMm)).toBeLessThan(0.2);
    expect(Math.abs(cleaned.onsdMm - 5.2)).toBeLessThan(0.2);
  });

  it('finds the scan area inside a black screen frame with a ruler and a text panel', () => {
    const { image, offset } = addScreenFrame(ph);
    const { mask, bounds } = sectorMask(image.pixels, image.width, image.height);
    expect(Math.abs(bounds.x0 - offset.x)).toBeLessThanOrEqual(24);
    expect(Math.abs(bounds.y0 - offset.y)).toBeLessThanOrEqual(24);
    expect(Math.abs(bounds.x1 - (offset.x + ph.width))).toBeLessThanOrEqual(24);
    expect(Math.abs(bounds.y1 - (offset.y + ph.height))).toBeLessThanOrEqual(24);
    // The dark globe interior belongs to the scan area; the frame, ruler and text do not.
    const c = { x: Math.round(ph.nerve.globePoint.x + offset.x), y: Math.round(ph.nerve.globePoint.y + offset.y - 60) };
    expect(mask[c.y * image.width + c.x]).toBe(1);
    expect(mask[(offset.y + 100) * image.width + 30]).toBe(0);
    expect(mask[(offset.y + 100) * image.width + offset.x + ph.width + 30]).toBe(0);
  });
});

describe('real-like synthetic scans', () => {
  it.each([4.5, 5.2, 6.0])('noisy phantom (extra speckle, fixed seed) %s mm: within 0.3 mm', (onsdMm) => {
    const ph = generatePhantom({ onsdMm, seed: 42 });
    const noisy = addSpeckle(ph, { seed: 9 });
    const res = autoMeasure(noisy, { mmPerPx: ph.mmPerPx });
    expect(res.ok).toBe(true);
    expect(Math.abs(res.measurement.onsdMm - onsdMm)).toBeLessThan(0.3);
  });

  it('noisy realistic phantom: within 0.3 mm', () => {
    const ph = generatePhantom({ onsdMm: 5.2, seed: 42, realism: 'realistic' });
    const res = autoMeasure(addSpeckle(ph, { seed: 9, strength: 0.3 }), { mmPerPx: ph.mmPerPx });
    expect(res.ok).toBe(true);
    expect(Math.abs(res.measurement.onsdMm - 5.2)).toBeLessThan(0.3);
  });

  it.each([0, 15])('black frame + ruler + text, tilt %s°: the globe is still found and measured', (tiltDeg) => {
    const ph = generatePhantom({ onsdMm: 5.2, seed: 42, tiltDeg });
    const { image, offset } = addScreenFrame(ph);
    const prep = prepareSource(image, { mmPerPx: ph.mmPerPx });
    const det = autodetect(prep.detect, { mmPerPx: ph.mmPerPx, sector: prep.sector });
    expect(det.globePoint).not.toBeNull();
    expect(det.level).not.toBe('low');
    const truth = { x: ph.nerve.innerGlobePoint.x + offset.x, y: ph.nerve.innerGlobePoint.y + offset.y };
    expect(dist(det.globePoint, truth) * ph.mmPerPx).toBeLessThan(0.5);

    const res = autoMeasure(image, { mmPerPx: ph.mmPerPx, prepared: prep });
    expect(res.ok).toBe(true);
    expect(Math.abs(res.measurement.onsdMm - 5.2)).toBeLessThan(0.2);
  });

  it('globe that merges with the black frame is found by the posterior-wall path', () => {
    // Crop the phantom so the dark globe touches the left edge of the scan, then add the black frame:
    // the globe's darkness is now connected to the black screen border.
    const ph = generatePhantom({ onsdMm: 5.2, seed: 42 });
    const cut = Math.round(ph.nerve.globePoint.x - 9.5 / ph.mmPerPx);
    const width = ph.width - cut;
    const pixels = new Uint8ClampedArray(width * ph.height);
    for (let y = 0; y < ph.height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = ph.pixels[y * ph.width + x + cut];
    const { image, offset } = addScreenFrame({ pixels, width, height: ph.height });
    const truth = { x: ph.nerve.innerGlobePoint.x - cut + offset.x, y: ph.nerve.innerGlobePoint.y + offset.y };
    // Without the scan-area mask the dark-blob path cannot separate the globe from the frame.
    const det = autodetect(image, { mmPerPx: ph.mmPerPx });
    expect(det.globePoint).not.toBeNull();
    expect(det.debug.method).toBe('posterior-wall');
    expect(det.level).not.toBe('low');
    expect(dist(det.globePoint, truth) * ph.mmPerPx).toBeLessThan(1.0);
    // With the mask, either path may win, and the point is still right.
    const prep = prepareSource(image, { mmPerPx: ph.mmPerPx });
    const masked = autodetect(prep.detect, { mmPerPx: ph.mmPerPx, sector: prep.sector });
    expect(dist(masked.globePoint, truth) * ph.mmPerPx).toBeLessThan(1.0);
  });

  it('reports which globe method was used', () => {
    const ph = generatePhantom({ onsdMm: 5.2, seed: 3 });
    const det = autodetect(ph, { mmPerPx: ph.mmPerPx });
    expect(['dark-blob', 'posterior-wall']).toContain(det.debug.method);
    expect(det.debug.tried.length).toBeGreaterThanOrEqual(1);
  });

  it('returns a proposal (uncertain) instead of a bare error when edges are unclear', () => {
    // Globe and nerve axis are present, but the nerve band below the globe has no bright walls.
    const ph = generatePhantom({ onsdMm: 5.2, seed: 42 });
    const flat = withRgba(ph);
    const y0 = Math.round(ph.nerve.globePoint.y + 1.2 / ph.mmPerPx);
    for (let y = y0; y < ph.height; y++) for (let x = 0; x < ph.width; x++) flat.pixels[y * ph.width + x] = 120;
    const res = autoMeasure(flat, { mmPerPx: ph.mmPerPx });
    expect(res.ok).toBe(false);
    expect(typeof res.reason).toBe('string');
  });
});

describe('edge methods', () => {
  // Synthetic profile: dark band from 80 to 120 (width 40), bright walls 12 samples wide, mid-grey outside.
  const profile = (blur = 0) => {
    const v = new Float64Array(201);
    for (let i = 0; i < v.length; i++) {
      const d = Math.abs(i - 100);
      v[i] = d < 20 ? 20 : d < 32 ? 220 : 110;
    }
    if (!blur) return v;
    const out = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) {
      let acc = 0;
      let ws = 0;
      for (let k = -4 * blur; k <= 4 * blur; k++) {
        const j = Math.min(v.length - 1, Math.max(0, i + k));
        const w = Math.exp(-(k * k) / (2 * blur * blur));
        acc += v[j] * w;
        ws += w;
      }
      out[i] = acc / ws;
    }
    return out;
  };
  const opts = { centerSearch: 15, peakSearch: 60, minWidth: 10, maxWidth: 150, sigma: 2 };

  it('gradient method finds the steepest dark→bright point on both sides (sub-pixel)', () => {
    const res = detectSheathEdges(profile(3), { ...opts, method: 'gradient' });
    expect(res.ok).toBe(true);
    expect(res.right - res.left).toBeGreaterThan(36);
    expect(res.right - res.left).toBeLessThan(41);
    expect(Math.abs((res.left + res.right) / 2 - 100)).toBeLessThan(0.5);
    expect(Number.isInteger(res.left)).toBe(false);
  });

  it('a higher fraction gives a wider result, and the gradient result lies between 50 % and 75 %', () => {
    const w = (extra) => {
      const r = detectSheathEdges(profile(3), { ...opts, ...extra });
      return r.right - r.left;
    };
    const f50 = w({ method: 'fraction', fraction: 0.5 });
    const f65 = w({ method: 'fraction', fraction: 0.65 });
    const f75 = w({ method: 'fraction', fraction: 0.75 });
    const grad = w({ method: 'gradient' });
    expect(f50).toBeLessThan(f65);
    expect(f65).toBeLessThan(f75);
    expect(grad).toBeGreaterThan(f50 - 1);
    expect(grad).toBeLessThan(f75);
  });

  it('skips a narrow speckle spike inside the band and uses the wide wall peak', () => {
    const v = profile(0);
    v[110] = 200; // one-sample spike between the band minimum and the right wall
    v[111] = 200;
    const res = detectSheathEdges(v, { ...opts, sigma: 1, minPeakWidth: 6, method: 'fraction', fraction: 0.65 });
    expect(res.ok).toBe(true);
    expect(res.rightPeak.index).toBeGreaterThanOrEqual(120);
    expect(res.right).toBeGreaterThan(117);
  });
});
