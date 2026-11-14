import { describe, expect, it } from 'vitest';
import {
  axisFrame,
  calibrationOverlapsEdges,
  calibrationSegmentTooShort,
  computeMmPerPx,
  computeMmPerPxFromDepth,
  dragEdge,
  edgePoint,
  measureOnAxis,
  sampleNormalProfile,
  snapGlobePoint,
  withEdgeOffsets,
} from '../src/lib/measure.js';
import { generatePhantom } from '../src/lib/phantom.js';

const ONSDS = [4.5, 5.2, 6.0];
const TILTS = [-20, 0, 20];

function measurePhantom(ph, { withScale = true } = {}) {
  const { globePoint, axisPoint } = ph.nerve;
  if (withScale) {
    const sb = ph.scaleBar;
    const mmPerPx = computeMmPerPx({ x: sb.x1, y: sb.y1 }, { x: sb.x2, y: sb.y2 }, sb.lengthMm);
    return measureOnAxis(ph, { globePt: globePoint, axisPt: axisPoint, mmPerPx });
  }
  // No scale: the user clicks the measurement depth (3 mm = 60 px here) directly.
  const { u } = axisFrame(globePoint, axisPoint);
  const depthPt = { x: globePoint.x + u.x * 60, y: globePoint.y + u.y * 60 };
  return measureOnAxis(ph, { globePt: globePoint, axisPt: axisPoint, mmPerPx: null, depthPt });
}

describe('calibration modes', () => {
  it('scale bar: mm per pixel from two points', () => {
    expect(computeMmPerPx({ x: 10, y: 10 }, { x: 110, y: 10 }, 5)).toBeCloseTo(0.05, 10);
  });

  it('image depth: 40 mm over 400 px gives 0.1 mm/px', () => {
    expect(computeMmPerPxFromDepth(40, { x: 50, y: 20 }, { x: 52, y: 420 })).toBeCloseTo(0.1, 10);
    expect(() => computeMmPerPxFromDepth(40, { x: 0, y: 5 }, { x: 9, y: 5 })).toThrow();
  });

  it('warns when the scale-bar segment is shorter than 30 px', () => {
    expect(calibrationSegmentTooShort({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe(true);
    expect(calibrationSegmentTooShort({ x: 0, y: 0 }, { x: 30, y: 0 })).toBe(false);
  });

  it('warns when the calibration segment sits on the measured sheath edges', () => {
    const edges = [{ x: 100, y: 200 }, { x: 200, y: 200 }];
    expect(calibrationOverlapsEdges([{ x: 104, y: 202 }, { x: 195, y: 199 }], edges)).toBe(true);
    expect(calibrationOverlapsEdges([{ x: 195, y: 199 }, { x: 104, y: 202 }], edges)).toBe(true);
    expect(calibrationOverlapsEdges([{ x: 20, y: 450 }, { x: 120, y: 450 }], edges)).toBe(false);
    expect(calibrationOverlapsEdges([{ x: 100, y: 200 }, { x: 150, y: 200 }], edges)).toBe(false);
  });
});

describe('nerve axis', () => {
  for (const tilt of TILTS) {
    it(`builds a perpendicular profile for tilt ${tilt}°`, () => {
      const th = (tilt * Math.PI) / 180;
      const globePt = { x: 320, y: 100 };
      const axisPt = { x: 320 + Math.sin(th) * 100, y: 100 + Math.cos(th) * 100 };
      const { u, n } = axisFrame(globePt, axisPt);
      expect(u.x * n.x + u.y * n.y).toBeCloseTo(0, 10);
      expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 10);
      expect(n.x).toBeGreaterThan(0);

      // Image whose intensity grows by 2 per px along n: the profile must be a clean ramp.
      const width = 400;
      const height = 300;
      const center = { x: 200, y: 150 };
      const pixels = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixels[y * width + x] = 128 + 2 * ((x + 0.5 - center.x) * n.x + (y + 0.5 - center.y) * n.y);
        }
      }
      const { values, half } = sampleNormalProfile({ pixels, width, height }, { center, u, n, halfWidthPx: 40, stripHalfPx: 5 });
      expect(values[half]).toBeCloseTo(128, 3);
      expect(values[half + 30] - values[half - 30]).toBeCloseTo(120, 3);
    });
  }
});

describe('phantom round-trip on the nerve axis', () => {
  for (const onsd of ONSDS) {
    for (const tilt of TILTS) {
      it(`clean: ${onsd} mm at ${tilt}° within 0.15 mm`, () => {
        const ph = generatePhantom({ onsdMm: onsd, tiltDeg: tilt, seed: 3 });
        const res = measurePhantom(ph);
        expect(res.ok).toBe(true);
        expect(res.level).not.toBe('low');
        expect(Math.abs(res.onsdMm - onsd)).toBeLessThan(0.15);
      });
    }
  }

  it('realistic: within 0.3 mm, or low confidence (manual mode)', () => {
    const rows = [];
    for (const onsd of ONSDS) {
      for (const tilt of TILTS) {
        const ph = generatePhantom({ onsdMm: onsd, tiltDeg: tilt, seed: 3, realism: 'realistic' });
        const res = measurePhantom(ph);
        const error = res.ok ? res.onsdMm - onsd : null;
        rows.push({ onsd, tilt, auto: res.ok, level: res.level, error });
        expect((res.ok && Math.abs(error) < 0.3) || (!res.ok && res.level === 'low')).toBe(true);
      }
    }
    const auto = rows.filter((r) => r.auto).length;
    console.log(
      `Realistic phantom: ${auto}/${rows.length} auto-measured, ${rows.length - auto} fell back to manual.\n` +
        rows
          .map((r) => `  ${r.onsd} mm, ${String(r.tilt).padStart(3)}°: ${r.auto ? `auto, ${r.level}, error ${r.error >= 0 ? '+' : ''}${r.error.toFixed(3)} mm` : 'manual'}`)
          .join('\n')
    );
  });

  it('falls back (low confidence) on an image without a nerve', () => {
    const ph = generatePhantom({ onsdMm: 5.2, seed: 9 });
    const noise = { ...ph, pixels: ph.pixels.map((_, i) => 90 + ((i * 2654435761) % 13)) };
    const res = measureOnAxis(noise, { globePt: ph.nerve.globePoint, axisPt: ph.nerve.axisPoint, mmPerPx: ph.mmPerPx });
    expect(res.ok).toBe(false);
    expect(res.level).toBe('low');
    expect(res.onsdMm).toBeNull();
  });

  it('no-scale mode measures the width in pixels only', () => {
    const ph = generatePhantom({ onsdMm: 5.2, tiltDeg: 20, seed: 4 });
    const res = measurePhantom(ph, { withScale: false });
    expect(res.ok).toBe(true);
    expect(res.onsdMm).toBeNull();
    expect(Math.abs(res.widthPx - 5.2 / ph.mmPerPx)).toBeLessThan(3);
  });

  it('snaps an imprecise globe click to the vitreous/retina boundary', () => {
    const ph = generatePhantom({ onsdMm: 5.2, tiltDeg: 0, seed: 2 });
    const { globePoint, axisPoint, innerGlobePoint } = ph.nerve;
    const { u, n } = axisFrame(globePoint, axisPoint);
    const clicked = { x: globePoint.x + u.x * 12, y: globePoint.y + u.y * 12 }; // 0.6 mm too deep
    const snapped = snapGlobePoint(ph, clicked, u, n, ph.mmPerPx);
    expect(Math.hypot(snapped.x - innerGlobePoint.x, snapped.y - innerGlobePoint.y)).toBeLessThan(4);
  });
});

describe('edge dragging', () => {
  it('moving an edge updates the width and ONSD', () => {
    const center = { x: 300, y: 200 };
    const n = { x: 1, y: 0 };
    const start = { center, n, ...withEdgeOffsets(-50, 50, 0.05) };
    expect(start.onsdMm).toBeCloseTo(5.0, 10);

    const moved = dragEdge(start, 'right', { x: 360, y: 214 }, 0.05);
    expect(moved.rightOffset).toBeCloseTo(60, 10);
    expect(moved.onsdMm).toBeCloseTo(5.5, 10);

    const tilted = { center, n: { x: Math.cos(0.3), y: -Math.sin(0.3) }, ...withEdgeOffsets(-40, 40, 0.05) };
    const target = edgePoint(center, tilted.n, -30);
    const narrowed = dragEdge(tilted, 'left', target, 0.05);
    expect(narrowed.widthPx).toBeCloseTo(70, 10);
    expect(narrowed.onsdMm).toBeCloseTo(3.5, 10);
  });

  it('dragging an edge past the other one keeps a positive width', () => {
    const m = { center: { x: 0, y: 0 }, n: { x: 1, y: 0 }, ...withEdgeOffsets(-10, 10, 0.1) };
    const crossed = dragEdge(m, 'left', { x: 25, y: 0 }, 0.1);
    expect(crossed.leftOffset).toBe(10);
    expect(crossed.rightOffset).toBe(25);
    expect(crossed.onsdMm).toBeCloseTo(1.5, 10);
  });
});
