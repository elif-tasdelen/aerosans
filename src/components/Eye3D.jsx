import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { eyeViewState, sheathColor, sheathRadius } from '../lib/eye.js';
import { buildEye, defaultView, EYE_TEXTURE_LABEL, EYE_TEXTURE_PATH, eyeBounds } from '../lib/eyeModel.js';
import {
  EYE_DEFAULT_ONSD_MM,
  EYE_PART_INFO,
  EYE_VIEW_NOTE,
  MEASURE_DEPTH_MM,
  PHANTOM_ONSD_MAX_MM,
  PHANTOM_ONSD_MIN_MM,
  RISK_LABELS,
} from '../config.js';

const PART_ORDER = ['globe', 'retina', 'opticNerve', 'sheath'];
const CLICK_TOLERANCE_PX = 5;
const FOV_DEG = 35;
const SHEATH_EMISSIVE = 0.22; // slight self-glow so the risk color reads clearly
// Add ?fps to the URL to show a frame-rate counter (performance check).
const SHOW_FPS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fps');

/** Place the tooltip on the side of the clicked point that has more room, so it never hides the part. */
function tooltipStyle({ x, y }, stage) {
  const w = stage?.clientWidth ?? 600;
  const h = stage?.clientHeight ?? 400;
  const TOOLTIP_H = 230;
  const right = x < w / 2;
  return {
    // Beside the point horizontally, centred on it vertically and kept inside the stage.
    left: right ? Math.min(x + 18, w - 290) : undefined,
    right: right ? undefined : Math.min(w - x + 18, w - 290),
    top: Math.max(8, Math.min(y - TOOLTIP_H / 2, h - TOOLTIP_H - 8)),
    maxHeight: h - 16,
    overflowY: 'auto',
  };
}

/**
 * Props: `latest` — the latest result from buildResultState (src/lib/result.js), or null.
 * The eye is linked to it only when it has a real scale (latest.showClinical). Otherwise it
 * shows a neutral "NO SCALE" state; slider values are always labelled as a preview.
 */
export default function Eye3D({ latest }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const latestOnsd = latest?.showClinical ? latest.onsdMm : null;

  const [previewOnsd, setPreviewOnsd] = useState(EYE_DEFAULT_ONSD_MM);
  const [previewActive, setPreviewActive] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [selected, setSelected] = useState(null); // { part, x, y }
  const [fps, setFps] = useState(null);

  const view = eyeViewState({ latest, previewOnsd, previewActive });
  const targetRef = useRef({ onsd: EYE_DEFAULT_ONSD_MM, neutral: false });
  targetRef.current = { onsd: view.neutral ? EYE_DEFAULT_ONSD_MM : view.onsdMm, neutral: view.neutral };

  // A new measurement leaves preview mode; a calibrated one also moves the slider to its value.
  const latestKey = latest ? `${latest.widthPx}|${latest.onsdMm}|${latest.showClinical}` : 'none';
  useEffect(() => {
    setPreviewActive(false);
    if (latestOnsd != null) setPreviewOnsd(Math.round(latestOnsd * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestKey]);

  // Three.js scene setup (once).
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 380;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV_DEG, width / height, 0.1, 100);

    // Lighting: soft sky/ground fill, a key light from the viewer's upper side, and a soft rim
    // light from behind (the camera looks along −Z) that outlines the globe and the nerve.
    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-2, 4, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfdbfe, 1.1);
    rim.position.set(1, 3, -6);
    scene.add(rim);

    // Model: nerve along +X, cornea toward −X, up +Y (see src/lib/eyeModel.js).
    const eye = buildEye();
    const { group, pickables, anchors, sheath, ring } = eye;

    // Globe color map (AI-generated, edited; labeled in the view). If it fails to load, the plain
    // white globe stays — no error.
    let disposed = false;
    new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}${EYE_TEXTURE_PATH}`,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        eye.globe.material.map = tex;
        eye.globe.material.needsUpdate = true;
      },
      undefined,
      () => {}
    );
    scene.add(group);
    // Bounds with the sheath at its largest preview size, so swelling is never clipped.
    const bounds = eyeBounds(eye, sheathRadius(PHANTOM_ONSD_MAX_MM));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = false; // opt-in via the "Rotate" toggle
    controls.autoRotateSpeed = 0.6;

    // Default view: pure side view (camera on +Z looking along −Z), auto-fitted with 15 % margin.
    let fit = defaultView(bounds, FOV_DEG, width / height);
    const applyFitLimits = () => {
      controls.minDistance = fit.distance * 0.35;
      controls.maxDistance = fit.distance * 3;
    };
    const resetView = () => {
      controls.target.copy(fit.target);
      camera.position.copy(fit.position);
      camera.up.set(0, 1, 0);
      camera.lookAt(fit.target);
      controls.update();
    };
    applyFitLimits();
    resetView();

    // Animation state.
    let currentOnsd = targetRef.current.onsd;
    const currentColor = new THREE.Color(sheathColor(currentOnsd, { neutral: targetRef.current.neutral }));
    const targetColor = new THREE.Color();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let highlighted = null;
    let frames = 0;
    let fpsStart = performance.now();
    let rafId = 0;
    let visible = true;

    // Sheath: size from ONSD; exact risk color (or neutral grey) with a slight emissive glow.
    const applySheath = () => {
      const r = sheathRadius(currentOnsd);
      sheath.scale.set(r, 1, r);
      ring.scale.set(r + 0.02, r + 0.02, 1);
      sheath.material.color.copy(currentColor);
      if (highlighted !== sheath) sheath.material.emissive.copy(currentColor).multiplyScalar(SHEATH_EMISSIVE);
    };
    applySheath();

    const setHighlight = (part) => {
      const prev = highlighted;
      highlighted = part ? pickables.find((m) => m.userData.part === part) : null;
      if (prev && prev !== highlighted) prev.material.emissive?.setHex(0x000000);
      if (prev === sheath) applySheath();
      if (highlighted) highlighted.material.emissive?.setHex(0x334155);
    };

    const pick = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (!hits.length) return null;
      // The globe is see-through: a visible part behind it (retina, nerve) wins the click.
      const first = hits[0];
      if (first.object.userData.part === 'globe') {
        const behind = hits.find((h) => h.object.userData.part !== 'globe');
        if (behind) return behind.object.userData.part;
      }
      return first.object.userData.part;
    };

    let downAt = null;
    const onPointerDown = (e) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > CLICK_TOLERANCE_PX) return;
      const part = pick(e.clientX, e.clientY);
      const rect = mount.getBoundingClientRect();
      if (part) {
        setSelected({ part, x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setSelected(null);
      }
    };
    const onPointerMove = (e) => {
      if (e.buttons) return;
      renderer.domElement.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // Project a part's anchor to container pixels (used by the legend buttons).
    const projectPart = (part) => {
      const v = group.localToWorld(anchors[part].clone()).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
    };

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Re-fit for the new aspect; keep the user's current direction and relative zoom.
      const zoom = camera.position.distanceTo(controls.target) / fit.distance;
      const dir = camera.position.clone().sub(controls.target).normalize();
      fit = defaultView(bounds, FOV_DEG, w / h);
      applyFitLimits();
      camera.position.copy(controls.target).addScaledVector(dir, fit.distance * zoom);
      controls.update();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // Pause rendering while the view is off screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(mount);

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      if (!visible) {
        frames = 0;
        fpsStart = performance.now();
        return;
      }
      // Smoothly animate towards the target ONSD and color (exact risk color or neutral grey).
      const { onsd: target, neutral } = targetRef.current;
      targetColor.set(sheathColor(target, { neutral }));
      const colorDiff =
        Math.abs(targetColor.r - currentColor.r) + Math.abs(targetColor.g - currentColor.g) + Math.abs(targetColor.b - currentColor.b);
      if (Math.abs(target - currentOnsd) > 0.0005 || colorDiff > 0.002) {
        currentOnsd += (target - currentOnsd) * 0.08;
        currentColor.lerp(targetColor, 0.12);
        applySheath();
      }
      controls.update();
      renderer.render(scene, camera);

      if (!SHOW_FPS) return;
      frames++;
      const now = performance.now();
      if (now - fpsStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsStart)));
        frames = 0;
        fpsStart = now;
      }
    };
    loop();

    apiRef.current = { setHighlight, projectPart, controls, resetView };

    return () => {
      disposed = true;
      eye.globe.material.map?.dispose();
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, []);

  // Highlight the selected part and pause idle rotation while a tooltip is open.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.setHighlight(selected?.part ?? null);
    api.controls.autoRotate = rotate && !selected;
  }, [selected, rotate]);

  const selectFromLegend = (part) => {
    const api = apiRef.current;
    if (!api) return;
    if (selected?.part === part) {
      setSelected(null);
      return;
    }
    api.controls.autoRotate = false;
    const { x, y } = api.projectPart(part);
    setSelected({ part, x, y });
  };

  const { mode, risk } = view;
  const info = selected ? EYE_PART_INFO[selected.part] : null;
  const badgeClass =
    mode === 'measured'
      ? `risk-badge-${risk}`
      : mode === 'preview'
        ? `risk-badge-preview risk-text-${risk}`
        : 'risk-badge-none';

  const sheathStatus = (() => {
    if (mode === 'noScale') return { text: 'No calibrated measurement linked to the 3D view.', cls: 'muted' };
    const label = `${view.onsdMm.toFixed(2)} mm · ${RISK_LABELS[risk]}`;
    if (mode === 'preview') return { text: `Preview ONSD: ${label} (not a measurement)`, cls: `risk-text-${risk}` };
    return { text: `Measured ONSD: ${label}`, cls: `risk-text-${risk}` };
  })();

  const onSlider = (e) => {
    setPreviewOnsd(parseFloat(e.target.value));
    setPreviewActive(true);
  };

  const backToLatest = () => {
    setPreviewActive(false);
    if (latestOnsd != null) setPreviewOnsd(Math.round(latestOnsd * 100) / 100);
  };

  return (
    <section className="card eye-card">
      <div className="eye-header">
        <h2>3D eye view</h2>
        <span className={`risk-badge small-badge ${badgeClass}`} aria-label={`3D view state: ${view.badge}`}>
          {view.badge}
        </span>
      </div>

      <div className="eye-layout">
        <div className="eye-stage" ref={mountRef}>
          {info && (
            <div
              className="eye-tooltip"
              style={tooltipStyle(selected, mountRef.current)}
              role="dialog"
              aria-label={info.name}
            >
              <button className="eye-tooltip-close" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
              <strong>{info.name}</strong>
              <p>{info.function}</p>
              <p className="muted">{info.status}</p>
              {selected.part === 'sheath' && (
                <p className={`eye-tooltip-status ${sheathStatus.cls}`}>{sheathStatus.text}</p>
              )}
            </div>
          )}
          <div className="eye-view-controls">
            <button
              className={`btn btn-ghost small-btn ${rotate ? 'active' : ''}`}
              aria-pressed={rotate}
              onClick={() => setRotate((r) => !r)}
            >
              Rotate
            </button>
            <button className="btn btn-ghost small-btn" onClick={() => apiRef.current?.resetView()}>
              Reset view
            </button>
          </div>
          {SHOW_FPS && fps != null && <div className="eye-fps">{fps} fps</div>}
          <div className="eye-ai-label">{EYE_TEXTURE_LABEL}</div>
        </div>

        <div className="eye-side">
          {mode === 'noScale' ? (
            <label htmlFor="eye-onsd">Move the slider to preview an ONSD value.</label>
          ) : (
            <label htmlFor="eye-onsd">
              {mode === 'measured' ? 'Measured ONSD' : 'Preview ONSD'}:{' '}
              <strong>{view.onsdMm.toFixed(2)} mm</strong>
            </label>
          )}
          <input
            id="eye-onsd"
            type="range"
            min={PHANTOM_ONSD_MIN_MM}
            max={PHANTOM_ONSD_MAX_MM}
            step="0.05"
            value={previewOnsd}
            onChange={onSlider}
          />
          {view.note && (
            <p className={`eye-state-note ${mode === 'noScale' ? 'note-noscale' : 'note-preview'}`}>{view.note}</p>
          )}
          {latest && previewActive && (
            <button className="btn btn-ghost" onClick={backToLatest}>
              {latestOnsd != null
                ? `Back to latest measurement (${latestOnsd.toFixed(2)} mm)`
                : 'Back to latest measurement (no scale)'}
            </button>
          )}

          <div className="label">Parts</div>
          <div className="eye-legend">
            {PART_ORDER.map((part) => (
              <button
                key={part}
                className={`btn btn-ghost legend-btn ${selected?.part === part ? 'active' : ''}`}
                onClick={() => selectFromLegend(part)}
              >
                <span className={`legend-dot legend-${part}`} aria-hidden="true" />
                {EYE_PART_INFO[part].name}
              </button>
            ))}
          </div>
          <p className="small muted">
            The yellow ring marks where ONSD is measured ({MEASURE_DEPTH_MM} mm behind the globe). Drag to
            rotate, scroll to zoom.
          </p>
          <p className="small muted">{EYE_VIEW_NOTE}</p>
        </div>
      </div>
    </section>
  );
}
