import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { eyeViewState, nerveRadius, sheathColor, sheathRadius } from '../src/lib/eye.js';
import {
  buildEye,
  defaultView,
  DURA_COLOR,
  duraColor,
  eyeBounds,
  fitDistance,
  GLOBE_FILL_RADIUS,
  irisDirection,
  NERVE_LENGTH,
  NERVE_START_X,
  nerveCentre,
  setRingNeutral,
  setSheathRadius,
} from '../src/lib/eyeModel.js';
import { buildResultState } from '../src/lib/result.js';
import {
  EYE_DEFAULT_ONSD_MM,
  EYE_MM_PER_UNIT,
  EYE_PART_INFO,
  ONSD_BORDERLINE_MM,
  ONSD_HIGH_MM,
  PHANTOM_ONSD_MAX_MM,
  RISK_COLORS,
} from '../src/config.js';

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

  it('the measurement ring is gold (#FFD700) with a dark outline on both sides along the nerve', () => {
    expect(eye.ring.material.color.getHexString()).toBe('ffd700');
    expect(eye.ringOutline).toHaveLength(2);
    const xs = eye.ringOutline.map((o) => worldPos(o).x - worldPos(eye.ring).x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(0);
    expect(xs[1]).toBeGreaterThan(0);
    for (const edge of eye.ringOutline) {
      const hsl = edge.material.color.getHSL({});
      expect(hsl.l).toBeLessThan(0.15);
      expect(Math.abs(worldPos(edge).y)).toBeLessThan(1e-9);
    }
  });

  describe('layered optic nerve', () => {
    // Distance of the tube's vertices from the nerve centre line at the measurement ring.
    const ringRadii = (mesh) => {
      mesh.updateMatrixWorld(true);
      const ringX = eye.ring.position.x;
      const pos = mesh.geometry.attributes.position;
      const { segments, radial } = mesh.geometry.userData;
      let best = 0;
      let bestDx = Infinity;
      for (let i = 0; i <= segments; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i * (radial + 1)).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.x - ringX) < bestDx) {
          bestDx = Math.abs(v.x - ringX);
          best = i;
        }
      }
      const radii = [];
      for (let j = 0; j <= radial; j++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, best * (radial + 1) + j).applyMatrix4(mesh.matrixWorld);
        radii.push(Math.hypot(v.y, v.z));
      }
      return radii;
    };

    it('shows the default ONSD of 5.0 mm when there is no measurement', () => {
      expect(EYE_DEFAULT_ONSD_MM).toBe(5.0);
      const fresh = buildEye();
      expect(fresh.sheath.userData.radius * EYE_MM_PER_UNIT * 2).toBeCloseTo(5.0, 10);
    });

    it.each([4.0, 5.18, 6.5])('dura outer radius at the ring = ONSD / 2 for %s mm', (onsdMm) => {
      setSheathRadius(eye, sheathRadius(onsdMm));
      for (const r of ringRadii(eye.sheath)) expect(r * EYE_MM_PER_UNIT).toBeCloseTo(onsdMm / 2, 2);
      expect(eye.ring.scale.x).toBeCloseTo(sheathRadius(onsdMm) + 0.02, 10);
      setSheathRadius(eye, sheathRadius(EYE_DEFAULT_ONSD_MM));
    });

    it('only the sheath and the fluid layer widen; the nerve keeps its diameter', () => {
      setSheathRadius(eye, sheathRadius(4.0));
      const nerve4 = ringRadii(eye.nerve)[0];
      const csf4 = ringRadii(eye.csf)[0];
      setSheathRadius(eye, sheathRadius(6.5));
      const nerve65 = ringRadii(eye.nerve)[0];
      const csf65 = ringRadii(eye.csf)[0];
      expect(nerve65).toBeCloseTo(nerve4, 10);
      expect(nerve4 * EYE_MM_PER_UNIT * 2).toBeCloseTo(3, 1);
      expect(csf65).toBeGreaterThan(csf4);
      expect(csf65).toBeGreaterThan(nerve65);
      expect(csf65).toBeLessThan(sheathRadius(6.5));
      setSheathRadius(eye, sheathRadius(EYE_DEFAULT_ONSD_MM));
    });

    it('the ring sits exactly 3 mm behind the globe surface, on the nerve centre line', () => {
      expect((eye.ring.position.x - 1) * EYE_MM_PER_UNIT).toBeCloseTo(3, 10);
      const u = (eye.ring.position.x - NERVE_START_X) / NERVE_LENGTH;
      const c = nerveCentre(u);
      expect(Math.hypot(c.y, c.z)).toBeLessThan(1e-9);
    });

    it('the nerve is gently S-shaped further back and about 26 mm long', () => {
      const ys = [0.4, 0.6, 0.8, 1].map((u) => nerveCentre(u).y);
      expect(Math.max(...ys)).toBeGreaterThan(0.02);
      expect(Math.min(...ys)).toBeLessThan(-0.02);
      expect(NERVE_LENGTH * EYE_MM_PER_UNIT).toBeGreaterThan(24);
      expect(NERVE_LENGTH * EYE_MM_PER_UNIT).toBeLessThan(28);
    });

    it('has the artery, the vein and seeded surface vessels as clickable or decorative parts', () => {
      const parts = eye.pickables.map((m) => m.userData.part);
      for (const part of ['opticNerve', 'subarachnoidSpace', 'duraSheath', 'centralRetinalArtery', 'centralRetinalVein']) {
        expect(parts).toContain(part);
        expect(EYE_PART_INFO[part].name.length).toBeGreaterThan(3);
        expect(eye.anchors[part]).toBeDefined();
      }
      expect(eye.duraVessels.length).toBeGreaterThanOrEqual(5);
      const again = buildEye();
      expect(Array.from(again.duraVessels[0].geometry.attributes.position.array)).toEqual(
        Array.from(eye.duraVessels[0].geometry.attributes.position.array)
      );
    });

    it('switches to a grey dashed ring without a scale', () => {
      setRingNeutral(eye, true);
      expect(eye.ring.visible).toBe(false);
      expect(eye.ringDashed.visible).toBe(true);
      expect(eye.ringDashed.children.length).toBeGreaterThan(8);
      setRingNeutral(eye, false);
      expect(eye.ring.visible).toBe(true);
      expect(eye.ringDashed.visible).toBe(false);
    });

    it('tints the dura towards the risk color', () => {
      const base = new THREE.Color(DURA_COLOR);
      const high = duraColor(RISK_COLORS.high);
      const normal = duraColor(RISK_COLORS.normal);
      expect(high.r - high.g).toBeGreaterThan(base.r - base.g);
      expect(normal.g).toBeGreaterThan(normal.r);
    });
  });

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

  it('the globe is solid: opaque sclera with a dark inner fill, and only the cornea is see-through', () => {
    const m = eye.globe.material;
    expect(m.transparent).toBe(false);
    expect(m.opacity).toBe(1);
    expect(m.depthWrite).toBe(true);
    expect(m.side).toBe(THREE.FrontSide);
    // The texture orientation is unchanged.
    expect(eye.globe.rotation.y).toBeCloseTo(Math.PI, 10);

    expect(eye.vitreous).toBeDefined();
    expect(eye.vitreous.geometry.parameters.radius).toBeCloseTo(GLOBE_FILL_RADIUS, 10);
    expect(GLOBE_FILL_RADIUS).toBeLessThan(1);
    expect(eye.vitreous.material.side).toBe(THREE.BackSide);
    expect(eye.vitreous.material.color.getHexString()).toBe('3a1414');
    expect(eye.vitreous.material.transparent).toBe(false);

    expect(eye.cornea.material.transmission).toBeGreaterThan(0.8);
    expect(eye.cornea.material.transparent).toBe(true);
    // Cornea in front of the iris (−X), lens just behind the corneal dome.
    expect(worldPos(eye.cornea).x).toBeLessThan(0);
    expect(worldPos(eye.lens).x).toBeLessThan(-0.9);
    expect(eye.lens.scale.x).toBeLessThan(eye.lens.scale.y);
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
