import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { eyeViewState, nerveRadius, sheathColor, sheathRadius } from '../src/lib/eye.js';
import { buildEye, defaultView, eyeBounds, fitDistance, irisDirection } from '../src/lib/eyeModel.js';
import { buildResultState } from '../src/lib/result.js';
import { ONSD_BORDERLINE_MM, ONSD_HIGH_MM, PHANTOM_ONSD_MAX_MM, RISK_COLORS } from '../src/config.js';

describe('3D eye helpers', () => {
  it('sheath radius grows with ONSD and stays wider than the nerve', () => {
    expect(sheathRadius(6)).toBeGreaterThan(sheathRadius(5));
    expect(sheathRadius(4)).toBeGreaterThan(nerveRadius());
    expect(sheathRadius(6) / sheathRadius(3)).toBeCloseTo(2, 10);
  });

  it('risk colors are the agreed palette (borderline is amber)', () => {
    expect(RISK_COLORS).toMatchObject({ normal: '#22c55e', borderline: '#f59e0b', high: '#ef4444' });
    expect(sheathColor(5.3)).toBe('#f59e0b');
  });

  it('uses the exact risk-badge colors', () => {
    expect(sheathColor(4.0)).toBe(RISK_COLORS.normal);
    expect(sheathColor(ONSD_BORDERLINE_MM)).toBe(RISK_COLORS.borderline);
    expect(sheathColor(ONSD_HIGH_MM - 0.01)).toBe(RISK_COLORS.borderline);
    expect(sheathColor(ONSD_HIGH_MM)).toBe(RISK_COLORS.high);
    expect(sheathColor(7.0)).toBe(RISK_COLORS.high);
  });

  it('is neutral grey when not linked to a calibrated measurement', () => {
    expect(sheathColor(6.5, { neutral: true })).toBe(RISK_COLORS.neutral);
    expect(sheathColor(null)).toBe(RISK_COLORS.neutral);
  });
});

describe('3D eye model orientation and framing', () => {
  const eye = buildEye();
  eye.group.updateMatrixWorld(true);
  const worldPos = (obj) => obj.getWorldPosition(new THREE.Vector3());

  it('the optic nerve runs along +X (within 1°), straight from the posterior pole', () => {
    const axis = worldPos(eye.nerve).sub(worldPos(eye.globe)).normalize();
    const angle = THREE.MathUtils.radToDeg(axis.angleTo(new THREE.Vector3(1, 0, 0)));
    expect(angle).toBeLessThan(1);

    // The cylinder's own axis (local +Y) must also lie along X: no tilt.
    const cylAxis = new THREE.Vector3(0, 1, 0).transformDirection(eye.nerve.matrixWorld);
    expect(Math.abs(cylAxis.x)).toBeGreaterThan(Math.cos(THREE.MathUtils.degToRad(1)));

    // Coaxial with the globe: no offset in Y or Z.
    expect(Math.abs(worldPos(eye.nerve).y)).toBeLessThan(1e-9);
    expect(Math.abs(worldPos(eye.nerve).z)).toBeLessThan(1e-9);
    expect(Math.abs(worldPos(eye.sheath).y) + Math.abs(worldPos(eye.sheath).z)).toBeLessThan(1e-9);
  });

  it('the texture centre (iris) faces −X, on the optic axis opposite the nerve (within 2°)', () => {
    // three.js convention check: the vertex with uv (0.5, 0.5) — the image centre — lies on local +X.
    const geo = eye.globe.geometry;
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    let centre = null;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(uv.getX(i) - 0.5) < 1e-6 && Math.abs(uv.getY(i) - 0.5) < 1e-6) {
        centre = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        break;
      }
    }
    expect(centre).not.toBeNull();
    expect(centre.x).toBeCloseTo(1, 6);

    const iris = irisDirection(eye);
    const irisAngle = THREE.MathUtils.radToDeg(iris.angleTo(new THREE.Vector3(-1, 0, 0)));
    expect(irisAngle).toBeLessThan(2);

    const nerveDir = worldPos(eye.nerve).sub(worldPos(eye.globe)).normalize();
    expect(THREE.MathUtils.radToDeg(nerveDir.angleTo(new THREE.Vector3(1, 0, 0)))).toBeLessThan(2);
    expect(THREE.MathUtils.radToDeg(iris.angleTo(nerveDir))).toBeGreaterThan(178); // same axis, opposite sides
    expect(eye.group.up.y).toBe(1);
  });

  it('has no separate iris disc overlapping the textured globe', () => {
    const discs = [];
    eye.group.traverse((o) => {
      if (['RingGeometry', 'CircleGeometry'].includes(o.geometry?.type)) discs.push(o);
    });
    expect(discs).toHaveLength(0);
  });

  for (const aspect of [1280 / 800, 1.7, 1.0, 0.6, 2.6]) {
    it(`auto-fit keeps the whole eye inside the view (aspect ${aspect.toFixed(2)})`, () => {
      const box = eyeBounds(eye, sheathRadius(PHANTOM_ONSD_MAX_MM));
      const fov = 35;
      const view = defaultView(box, fov, aspect);
      expect(view.distance).toBeCloseTo(fitDistance(box, fov, aspect), 10);

      const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
      camera.position.copy(view.position);
      camera.lookAt(view.target);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();

      // Pure side view: the camera looks along −Z.
      const dir = camera.getWorldDirection(new THREE.Vector3());
      expect(dir.z).toBeCloseTo(-1, 10);

      let maxNdc = 0;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(camera);
            maxNdc = Math.max(maxNdc, Math.abs(p.x), Math.abs(p.y));
            expect(p.z).toBeGreaterThan(-1); // in front of the near plane
            expect(p.z).toBeLessThan(1); // before the far plane
          }
        }
      }
      expect(maxNdc).toBeLessThanOrEqual(1);
      expect(maxNdc).toBeGreaterThan(0.8); // fitted, not tiny (≈ 1 / 1.15 margin)
    });
  }
});

describe('3D eye view state', () => {
  const noScale = buildResultState({ widthPx: 110, mmPerPx: null, calibrationMode: 'none', method: 'auto' });
  const measured = buildResultState({ widthPx: 104, mmPerPx: 0.05, calibrationMode: 'scaleBar', method: 'auto' });
  const unconfirmed = buildResultState({
    widthPx: 104,
    mmPerPx: 0.05,
    calibrationMode: 'scaleBar',
    calibrationWarning: 'Calibration should use a known scale, not the structure being measured.',
    method: 'manual',
  });

  it('no-scale result: no risk, neutral sheath, badge "NO SCALE", no mm value', () => {
    const s = eyeViewState({ latest: noScale, previewOnsd: 5.2, previewActive: false });
    expect(s.mode).toBe('noScale');
    expect(s.risk).toBeNull();
    expect(s.badge).toBe('NO SCALE');
    expect(s.onsdMm).toBeNull();
    expect(s.neutral).toBe(true);
    expect(s.note).toMatch(/no mm scale/);
  });

  it('unconfirmed scale: also not linked, no risk', () => {
    const s = eyeViewState({ latest: unconfirmed, previewOnsd: 5.2 });
    expect(s.mode).toBe('noScale');
    expect(s.risk).toBeNull();
  });

  it('calibrated measurement: plain risk badge', () => {
    const s = eyeViewState({ latest: measured, previewOnsd: 4.6 });
    expect(s.mode).toBe('measured');
    expect(s.onsdMm).toBeCloseTo(5.2, 10);
    expect(s.risk).toBe('borderline');
    expect(s.badge).toBe('Borderline');
    expect(s.note).toBeNull();
  });

  it('slider preview: badge starts with "PREVIEW" and says it is not a measurement', () => {
    for (const latest of [null, noScale, measured]) {
      const s = eyeViewState({ latest, previewOnsd: 6.2, previewActive: latest !== null });
      expect(s.mode).toBe('preview');
      expect(s.badge.startsWith('PREVIEW')).toBe(true);
      expect(s.badge).toContain('High');
      expect(s.note).toBe('Preview only — not a measurement.');
    }
  });
});
