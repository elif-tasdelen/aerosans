// Procedural 3D eye model and camera fitting. Uses three.js only (no React / DOM), so it is testable.
//
// Model frame (scene units, 1 unit ≈ 12 mm): globe centred at the origin, optic nerve along +X
// (to the right), cornea toward −X (left), up = +Y. The nerve is straight and coaxial with the
// globe's posterior pole: no tilt, no offset.

import * as THREE from 'three';
import { EYE_MM_PER_UNIT, MEASURE_DEPTH_MM } from '../config.js';
import { nerveRadius } from './eye.js';

export const NERVE_LENGTH = 2.2;
export const NERVE_START_X = 0.95; // just inside the posterior globe wall
export const SHEATH_LENGTH = NERVE_LENGTH - 0.45; // the far end of the nerve stays bare (easy to click)
export const NERVE_AXIS = new THREE.Vector3(1, 0, 0);
export const GLOBE_OPACITY = 0.82;
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
  // Slightly transparent so the retina and the start of the nerve remain visible.
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      transparent: true,
      opacity: GLOBE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  globe.rotation.y = Math.PI;
  globe.userData.part = 'globe';
  globe.userData.textureCenterLocal = new THREE.Vector3(1, 0, 0); // where the iris (image centre) lands
  globe.renderOrder = 2;
  group.add(globe);
  pickables.push(globe);
  anchors.globe = new THREE.Vector3(-0.45, 0.72, 0.3);

  // Retina: inner shell lining the posterior half of the globe (x > 0).
  const retina = new THREE.Mesh(
    new THREE.SphereGeometry(0.965, 64, 32, Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.7, side: THREE.DoubleSide })
  );
  retina.userData.part = 'retina';
  group.add(retina);
  pickables.push(retina);
  anchors.retina = new THREE.Vector3(0.55, 0.55, 0.3);

  // Front of the eye (−X): transparent cornea and lens. Orientation hints only, not clickable.
  const cornea = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 40, 20, 0, Math.PI * 2, 0, Math.PI / 3),
    new THREE.MeshPhysicalMaterial({
      color: 0xbfe3ff,
      roughness: 0.05,
      transmission: 0.6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  cornea.rotation.z = Math.PI / 2; // cap pointing to −X
  cornea.position.x = -0.7;
  group.add(cornea);

  // (The iris and pupil come from the globe texture; no separate iris disc.)
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, transparent: true, opacity: 0.55, roughness: 0.2 })
  );
  lens.scale.set(0.45, 1, 1);
  lens.position.x = -0.8;
  group.add(lens);

  // Optic nerve: fixed-size cylinder along +X from the posterior pole (cylinders are built along +Y).
  const nerve = new THREE.Mesh(
    new THREE.CylinderGeometry(nerveRadius(), nerveRadius(), NERVE_LENGTH, 32),
    new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.6 })
  );
  nerve.rotation.z = -Math.PI / 2; // +Y → +X
  nerve.position.set(NERVE_START_X + NERVE_LENGTH / 2, 0, 0);
  nerve.userData.part = 'opticNerve';
  group.add(nerve);
  pickables.push(nerve);
  anchors.opticNerve = new THREE.Vector3(NERVE_START_X + NERVE_LENGTH - 0.15, 0, 0);

  // Sheath: unit-radius open tube, scaled to the ONSD every frame (scale.x / scale.z = radius).
  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, SHEATH_LENGTH, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: 0x000000,
      roughness: 0.35,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  sheath.rotation.z = -Math.PI / 2;
  sheath.position.set(NERVE_START_X + SHEATH_LENGTH / 2, 0, 0);
  sheath.userData.part = 'sheath';
  sheath.renderOrder = 1;
  group.add(sheath);
  pickables.push(sheath);
  anchors.sheath = new THREE.Vector3(1.6, 0.3, 0);

  // Ring marking where ONSD is measured (3 mm behind the globe), perpendicular to the nerve.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 64), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  ring.rotation.y = Math.PI / 2; // ring plane ⟂ X
  ring.position.set(1 + MEASURE_DEPTH_MM / EYE_MM_PER_UNIT, 0, 0);
  group.add(ring);

  return { group, pickables, anchors, globe, nerve, sheath, ring };
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
  const { sheath, ring, group } = eye;
  const prev = { s: sheath.scale.clone(), r: ring.scale.clone() };
  sheath.scale.set(maxSheathRadius, 1, maxSheathRadius);
  ring.scale.set(maxSheathRadius + 0.02, maxSheathRadius + 0.02, 1);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  sheath.scale.copy(prev.s);
  ring.scale.copy(prev.r);
  group.updateMatrixWorld(true);
  return box;
}

/** Default pure side view: camera on +Z looking along −Z at the box centre. */
export function defaultView(box, fovDeg, aspect, margin = 1.15) {
  const target = box.getCenter(new THREE.Vector3());
  const distance = fitDistance(box, fovDeg, aspect, margin);
  return { target, position: new THREE.Vector3(target.x, target.y, target.z + distance), distance };
}
