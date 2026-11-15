// Procedural 3D eye model and camera fitting. Uses three.js only (no React / DOM), so it is testable.
//
// Model frame (scene units, 1 unit ≈ 12 mm): globe centred at the origin, optic nerve along +X
// (to the right), cornea toward −X (left), up = +Y. The nerve is straight and coaxial with the
// globe's posterior pole: no tilt, no offset.

import * as THREE from 'three';
import { EYE_DEFAULT_ONSD_MM, EYE_MM_PER_UNIT, MEASURE_DEPTH_MM, MEASURE_MARKER_COLOR } from '../config.js';
import { nerveRadius, sheathRadius } from './eye.js';

export const NERVE_LENGTH = 2.2;
export const NERVE_START_X = 0.95; // just inside the posterior globe wall
export const SHEATH_LENGTH = NERVE_LENGTH - 0.45; // the far end of the nerve stays bare (easy to click)
export const NERVE_AXIS = new THREE.Vector3(1, 0, 0);
/** Inner fill of the globe (vitreous): radius relative to the sclera, and its dark red-brown color. */
export const GLOBE_FILL_RADIUS = 0.98;
export const VITREOUS_COLOR = 0x3a1414;
export const RING_OUTLINE_COLOR = 0x1c1917;
export const RING_NEUTRAL_COLOR = 0x94a3b8;
/** The dura covers this fraction of the nerve; the far end of the nerve stays bare. */
export const SHEATH_SPAN = SHEATH_LENGTH / NERVE_LENGTH;
/** Origin of the nerve meshes: on the optic axis, half-way along the nerve. */
export const NERVE_ORIGIN = new THREE.Vector3(NERVE_START_X + NERVE_LENGTH / 2, 0, 0);
/** Sideways amplitude of the nerve's slack S shape (scene units, about 1 mm). */
export const NERVE_S_AMPLITUDE = 0.085;
/** The central retinal artery and vein enter the nerve about this far behind the globe (mm). */
export const CRA_ENTRY_MM = 10;
export const NERVE_COLOR = 0xe8dcc2;
export const CSF_COLOR = 0x9ad1ff;
export const DURA_COLOR = 0xf3d9d6;
/** How far the dura color is pulled towards the risk color (0–1). */
export const DURA_RISK_TINT = 0.7;
export const ARTERY_COLOR = 0xc0392b;
export const VEIN_COLOR = 0x7d2a3a;
export const PIAL_VESSEL_COLOR = 0xb03a2e;
export const VESSEL_SEED = 20261115;
export const EYE_TEXTURE_PATH = 'textures/eye.png';
export const EYE_TEXTURE_LABEL = 'Eye texture: AI-generated (Gemini), edited';

/** World direction in which the texture centre (the iris) points. */
export function irisDirection(eye) {
  eye.group.updateMatrixWorld(true);
  return eye.globe.userData.textureCenterLocal.clone().transformDirection(eye.globe.matrixWorld);
}

/**
 * Build the eye. Returns the group, pickable meshes, tooltip anchors (group-local) and the
 * objects animated per frame (sheath, ring).
 */
export function buildEye() {
  const group = new THREE.Group();
  const pickables = [];
  const anchors = {};

  // Globe (sclera). The color map (public/textures/eye.png, AI-generated and edited, 2:1
  // equirectangular, iris at the image centre) is loaded by the component and set on
  // globe.material.map. SphereGeometry maps the image centre (u = 0.5) to +X, the nerve side,
  // so the globe is turned 180° about Y to put the iris on −X, on the optic axis opposite the nerve.
  // Solid and opaque, like a real eye seen from outside.
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.FrontSide,
    })
  );
  globe.rotation.y = Math.PI;
  globe.userData.part = 'globe';
  globe.userData.textureCenterLocal = new THREE.Vector3(1, 0, 0); // where the iris (image centre) lands
  group.add(globe);
  pickables.push(globe);
  anchors.globe = new THREE.Vector3(-0.45, 0.72, 0.3);

  // Inner fill (vitreous): a dark, matt shell just inside the sclera, seen from the inside, so the
  // globe never looks hollow when the camera comes close or passes through the surface.
  const vitreous = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_FILL_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ color: VITREOUS_COLOR, roughness: 1, metalness: 0, side: THREE.BackSide })
  );
  group.add(vitreous);

  // Retina: inner shell lining the posterior half of the globe (x > 0). Hidden behind the opaque
  // sclera from outside; it stays in the model for the parts list and its info card.
  const retina = new THREE.Mesh(
    new THREE.SphereGeometry(0.965, 64, 32, Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.7, side: THREE.DoubleSide })
  );
  retina.userData.part = 'retina';
  group.add(retina);
  pickables.push(retina);
  anchors.retina = new THREE.Vector3(0.55, 0.55, 0.3);

  // Front of the eye (−X). Only the cornea is see-through, as in a real eye: a clear dome that
  // bulges slightly in front of the iris. Orientation hints only, not clickable.
  const cornea = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 48, 24, 0, Math.PI * 2, 0, Math.PI / 3),
    new THREE.MeshPhysicalMaterial({
      color: 0xeaf6ff,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.9,
      ior: 1.37,
      thickness: 0.05,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  cornea.rotation.z = Math.PI / 2; // cap pointing to −X
  cornea.position.x = -0.66;
  cornea.renderOrder = 3;
  group.add(cornea);

  // Lens: a small, slightly cloudy biconvex body at the pupil, just visible through the cornea.
  // (The iris and pupil come from the globe texture; no separate iris disc.)
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false })
  );
  lens.scale.set(0.3, 1, 1);
  lens.position.x = -0.985;
  lens.renderOrder = 2;
  group.add(lens);

  // --- Optic nerve: three layers along a gently S-shaped centre line (see nerveCentre) -------
  const place = (mesh) => {
    mesh.rotation.z = -Math.PI / 2; // local +Y → world +X
    mesh.position.copy(NERVE_ORIGIN);
    return mesh;
  };

  // 1. Neural tissue: fixed diameter, cream, with fine lengthwise fascicle lines.
  const nerve = place(
    new THREE.Mesh(
      tubeGeometry(0, 1, 72, 28),
      new THREE.MeshStandardMaterial({ color: NERVE_COLOR, roughness: 0.65, map: fascicleTexture() })
    )
  );
  setTubeRadius(nerve.geometry, (u) => nerveRadius() * (1 - 0.18 * smoothstep(0.75, 1, u)));
  nerve.userData.part = 'opticNerve';
  group.add(nerve);
  pickables.push(nerve);
  anchors.opticNerve = nerveCentre(0.95);

  // 2. Subarachnoid space (cerebrospinal fluid) between the nerve and the dura: thin, pale blue.
  const csf = place(
    new THREE.Mesh(
      tubeGeometry(0, SHEATH_SPAN, 60, 32),
      new THREE.MeshPhysicalMaterial({
        color: CSF_COLOR,
        roughness: 0.2,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
  );
  csf.userData.part = 'subarachnoidSpace';
  csf.renderOrder = 1;
  group.add(csf);
  pickables.push(csf);
  anchors.subarachnoidSpace = nerveCentre(0.42).add(new THREE.Vector3(0, -0.17, 0.05));

  // 3. Dura sheath: outer radius = ONSD / 2 (set by setSheathRadius). Pale pink, tinted with the
  //    risk color by the view; translucent so the nerve stays visible. It flares into the sclera.
  const sheath = place(
    new THREE.Mesh(
      tubeGeometry(0, SHEATH_SPAN, 60, 40),
      new THREE.MeshPhysicalMaterial({
        color: DURA_COLOR,
        emissive: 0x000000,
        roughness: 0.3,
        clearcoat: 0.4,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
  );
  sheath.userData.part = 'duraSheath';
  sheath.renderOrder = 2;
  group.add(sheath);
  pickables.push(sheath);
  anchors.duraSheath = nerveCentre(0.5).add(new THREE.Vector3(0, 0.3, 0));

  // Central retinal artery and vein: they enter the nerve from below about 10 mm behind the globe
  // and run inside it to the optic disc (the part inside the nerve is hidden).
  const vesselTube = (points, radius, color, part) => {
    const curve = new THREE.CatmullRomCurve3(points.map(toNerveLocal));
    const mesh = place(
      new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 8, false), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }))
    );
    mesh.userData.part = part;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  };
  const entryU = (CRA_ENTRY_MM / EYE_MM_PER_UNIT + 1 - NERVE_START_X) / NERVE_LENGTH;
  const entry = nerveCentre(entryU);
  const centralPath = (dz) => [
    entry.clone().add(new THREE.Vector3(0.42, -0.46, dz * 2.5)),
    entry.clone().add(new THREE.Vector3(0.24, -0.33, dz * 2)),
    entry.clone().add(new THREE.Vector3(0.08, -0.17, dz * 1.3)),
    entry.clone().add(new THREE.Vector3(-0.04, -0.04, dz)),
    nerveCentre(entryU * 0.6).add(new THREE.Vector3(0, 0, dz)),
    nerveCentre(0.02).add(new THREE.Vector3(0, 0, dz)),
  ];
  const artery = vesselTube(centralPath(0.022), 0.016, ARTERY_COLOR, 'centralRetinalArtery');
  const vein = vesselTube(centralPath(-0.022), 0.019, VEIN_COLOR, 'centralRetinalVein');
  anchors.centralRetinalArtery = entry.clone().add(new THREE.Vector3(0.22, -0.32, 0.05));
  anchors.centralRetinalVein = entry.clone().add(new THREE.Vector3(0.3, -0.4, -0.05));

  // Fine pial / dural vessels on the dura surface (procedural, fixed seed). Their geometry follows
  // the sheath radius (see setSheathRadius). Not clickable.
  const rng = seededRandom(VESSEL_SEED);
  const duraVessels = [];
  for (let k = 0; k < 5; k++) {
    const phi0 = (k / 5) * Math.PI * 2 + rng() * 0.8;
    const main = {
      u0: 0.1 + rng() * 0.08,
      u1: 0.82 + rng() * 0.14,
      phi0,
      twist: (rng() - 0.5) * 2.4,
      wobble: 0.25 + rng() * 0.3,
      freq: 5 + rng() * 5,
      radius: 0.0075,
    };
    const paths = [main];
    if (k % 2 === 0) {
      const ub = main.u0 + (0.3 + rng() * 0.3) * (main.u1 - main.u0);
      paths.push({
        ...main,
        u0: ub,
        u1: Math.min(0.97, ub + 0.25 + rng() * 0.15),
        branchOf: main,
        twist: main.twist + (rng() < 0.5 ? -1 : 1) * (2.2 + rng()),
        radius: 0.005,
      });
    }
    for (const path of paths) {
      const mesh = place(
        new THREE.Mesh(surfaceVesselGeometry(36, 5), new THREE.MeshStandardMaterial({ color: PIAL_VESSEL_COLOR, roughness: 0.6 }))
      );
      mesh.userData.path = path;
      group.add(mesh);
      duraVessels.push(mesh);
    }
  }

  // Ring marking where ONSD is measured (3 mm behind the globe), perpendicular to the nerve.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.06, 8, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(MEASURE_MARKER_COLOR) })
  );
  ring.rotation.y = Math.PI / 2; // ring plane ⟂ X
  ring.position.set(1 + MEASURE_DEPTH_MM / EYE_MM_PER_UNIT, 0, 0);
  group.add(ring);
  // Thin dark outline on both sides of the ring (along the nerve), so the gold marker stays
  // visible on the amber borderline sheath. Children of the ring, so they follow its scale.
  const ringOutline = [-1, 1].map((side) => {
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.03, 8, 64),
      new THREE.MeshBasicMaterial({ color: RING_OUTLINE_COLOR })
    );
    edge.position.z = side * 0.075; // ring-local Z is the nerve direction
    ring.add(edge);
    return edge;
  });
  // Grey dashed ring shown instead of the gold one when there is no scale.
  const ringDashed = new THREE.Group();
  const dashes = 14;
  for (let k = 0; k < dashes; k++) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.05, 6, 6, (Math.PI * 2 * 0.55) / dashes),
      new THREE.MeshBasicMaterial({ color: RING_NEUTRAL_COLOR })
    );
    arc.rotation.z = (k / dashes) * Math.PI * 2;
    ringDashed.add(arc);
  }
  ringDashed.rotation.y = Math.PI / 2;
  ringDashed.position.copy(ring.position);
  ringDashed.visible = false;
  group.add(ringDashed);

  const eye = { group, pickables, anchors, globe, vitreous, retina, cornea, lens, nerve, csf, sheath, artery, vein, duraVessels, ring, ringOutline, ringDashed };
  setSheathRadius(eye, sheathRadius(EYE_DEFAULT_ONSD_MM));
  return eye;
}

// --- Nerve geometry helpers ----------------------------------------------------------------

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Centre line of the optic nerve in model coordinates, u = 0 (at the globe) … 1 (orbital apex).
 * It leaves the posterior pole along +X, stays straight for the first ~5 mm (so the 3 mm
 * measurement ring sits on the axis) and then runs in a slack, gentle S shape.
 */
export function nerveCentre(u) {
  const w = smoothstep(0.2, 0.55, u);
  return new THREE.Vector3(
    NERVE_START_X + u * NERVE_LENGTH,
    NERVE_S_AMPLITUDE * w * Math.sin(2 * Math.PI * (u - 0.2) * 1.1),
    0.6 * NERVE_S_AMPLITUDE * w * Math.sin(Math.PI * (u - 0.2) * 1.25)
  );
}

/** Model coordinates → the local frame shared by the nerve meshes (local +Y is model +X). */
function toNerveLocal(v) {
  return new THREE.Vector3(-v.y, v.x - NERVE_ORIGIN.x, v.z);
}

/** Tangent and two unit normals of the centre line at u. */
function nerveFrame(u) {
  const e = 1e-3;
  const t = nerveCentre(Math.min(1, u + e)).sub(nerveCentre(Math.max(0, u - e))).normalize();
  const n1 = new THREE.Vector3(0, 0, 1).cross(t).normalize();
  const n2 = t.clone().cross(n1).normalize();
  return { c: nerveCentre(u), t, n1, n2 };
}

function gridIndex(segments, radial) {
  const index = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return index;
}

/**
 * Tube around the centre line from u0 to u1. The radius is written later by setTubeRadius, so the
 * same geometry can change thickness without being rebuilt.
 */
function tubeGeometry(u0, u1, segments, radial) {
  const geo = new THREE.BufferGeometry();
  const count = (segments + 1) * (radial + 1);
  const uv = new Float32Array(count * 2);
  const frames = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    frames.push(nerveFrame(u0 + f * (u1 - u0)));
    for (let j = 0; j <= radial; j++) {
      uv[(i * (radial + 1) + j) * 2] = j / radial;
      uv[(i * (radial + 1) + j) * 2 + 1] = f;
    }
  }
  geo.setIndex(gridIndex(segments, radial));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData = { frames, segments, radial, u0, u1 };
  return geo;
}

/** Write the tube's vertices for radius(f), f = 0 … 1 along the tube. */
export function setTubeRadius(geo, radius) {
  const { frames, segments, radial } = geo.userData;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const dir = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const { c, n1, n2 } = frames[i];
    const r = radius(i / segments);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      dir.copy(n1).multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a));
      const k = i * (radial + 1) + j;
      const p = toNerveLocal(c.clone().addScaledVector(dir, r));
      pos.setXYZ(k, p.x, p.y, p.z);
      nor.setXYZ(k, -dir.y, dir.x, dir.z);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

function surfaceVesselGeometry(segments, radial) {
  const geo = new THREE.BufferGeometry();
  const count = (segments + 1) * (radial + 1);
  geo.setIndex(gridIndex(segments, radial));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.userData = { segments, radial };
  return geo;
}

/**
 * Radius of the dura tube at fraction f of its length for a sheath radius R: a short flare where
 * it joins the sclera and a slight taper at the far end.
 */
export function duraRadiusAt(f, R) {
  const d = f * SHEATH_LENGTH; // distance from the start of the sheath (scene units)
  const flare = 1 + 0.9 * Math.exp(-((d / 0.07) ** 2));
  return R * flare * (1 - 0.1 * smoothstep(0.85, 1, f));
}

function vesselAngle(path, u) {
  if (path.branchOf) return vesselAngle(path.branchOf, path.u0) + path.twist * (u - path.u0);
  return path.phi0 + path.twist * u + path.wobble * Math.sin(path.freq * u);
}

function writeSurfaceVessel(mesh, R) {
  const geo = mesh.geometry;
  const { segments, radial } = geo.userData;
  const path = mesh.userData.path;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const out = new THREE.Vector3();
  const side = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = path.u0 + (i / segments) * (path.u1 - path.u0); // fraction of the dura tube
    const { c, t, n1, n2 } = nerveFrame(u * SHEATH_SPAN);
    const phi = vesselAngle(path, u);
    out.copy(n1).multiplyScalar(Math.cos(phi)).addScaledVector(n2, Math.sin(phi));
    side.copy(t).cross(out).normalize();
    const centre = c.clone().addScaledVector(out, duraRadiusAt(u, R) + path.radius * 0.6);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      dir.copy(out).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
      const p = toNerveLocal(centre.clone().addScaledVector(dir, path.radius));
      const k = i * (radial + 1) + j;
      pos.setXYZ(k, p.x, p.y, p.z);
      nor.setXYZ(k, -dir.y, dir.x, dir.z);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/**
 * Set the dura sheath's outer radius (scene units; ONSD / 2). The nerve keeps its size: only the
 * dura and the fluid layer under it widen. The surface vessels and both rings follow.
 */
export function setSheathRadius(eye, R) {
  const inner = nerveRadius();
  setTubeRadius(eye.sheath.geometry, (f) => duraRadiusAt(f, R));
  setTubeRadius(eye.csf.geometry, (f) => duraRadiusAt(f, inner + 0.55 * Math.max(0, R - inner)));
  for (const v of eye.duraVessels) writeSurfaceVessel(v, R);
  eye.ring.scale.set(R + 0.02, R + 0.02, 1);
  eye.ringDashed.scale.set(R + 0.02, R + 0.02, 1);
  eye.sheath.userData.radius = R;
}

/** Gold ring for a calibrated value, grey dashed ring when there is no scale. */
export function setRingNeutral(eye, neutral) {
  eye.ring.visible = !neutral;
  eye.ringDashed.visible = neutral;
}

/** Dura color: the pale pink base tinted towards the risk color (or the neutral grey). */
export function duraColor(riskHex, target = new THREE.Color()) {
  return target.set(DURA_COLOR).lerp(new THREE.Color(riskHex), DURA_RISK_TINT);
}

/** Cream texture with fine lengthwise lines (nerve fibre bundles). Null outside the browser. */
function fascicleTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3ead6';
  ctx.fillRect(0, 0, 256, 64);
  const rng = seededRandom(VESSEL_SEED + 1);
  for (let k = 0; k < 70; k++) {
    const x = rng() * 256;
    const dark = rng() < 0.5;
    const alpha = dark ? 0.12 + rng() * 0.22 : 0.2 + rng() * 0.3;
    ctx.strokeStyle = dark ? 'rgba(150, 120, 80, ' + alpha + ')' : 'rgba(255, 252, 240, ' + alpha + ')';
    ctx.lineWidth = 0.6 + rng() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 6, 20, x + (rng() - 0.5) * 6, 44, x + (rng() - 0.5) * 4, 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

/**
 * Camera distance (from the box centre, looking along −Z) so the whole box fits in the view
 * with `margin` (1.15 = 15 % margin) for a perspective camera with vertical FOV `fovDeg`.
 */
export function fitDistance(box, fovDeg, aspect, margin = 1.15) {
  const size = box.getSize(new THREE.Vector3());
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const halfZ = size.z / 2;
  const byHeight = (margin * size.y) / 2 / tanV;
  const byWidth = (margin * size.x) / 2 / (tanV * aspect);
  return halfZ + Math.max(byHeight, byWidth);
}

/** Bounding box of the eye with the sheath at its largest preview size, so swelling never clips. */
export function eyeBounds(eye, maxSheathRadius) {
  const { group } = eye;
  const prev = eye.sheath.userData.radius;
  setSheathRadius(eye, maxSheathRadius);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  setSheathRadius(eye, prev);
  group.updateMatrixWorld(true);
  return box;
}

/** Default pure side view: camera on +Z looking along −Z at the box centre. */
export function defaultView(box, fovDeg, aspect, margin = 1.15) {
  const target = box.getCenter(new THREE.Vector3());
  const distance = fitDistance(box, fovDeg, aspect, margin);
  return { target, position: new THREE.Vector3(target.x, target.y, target.z + distance), distance };
}
