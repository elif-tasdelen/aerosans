import { useEffect, useMemo, useRef, useState } from 'react';
import { generatePhantom } from '../lib/phantom.js';
import { autodetect } from '../lib/autodetect.js';
import {
  axisFrame,
  calibrationOverlapsEdges,
  calibrationSegmentTooShort,
  computeMmPerPx,
  computeMmPerPxFromDepth,
  dragEdge,
  edgePoint,
  measureOnAxis,
  pointAlongAxis,
  projectOnto,
  snapGlobePoint,
  withEdgeOffsets,
} from '../lib/measure.js';
import { buildResultState } from '../lib/result.js';
import { autoMeasure, AUTO_MEASURE_METHOD, prepareSource } from '../lib/autoMeasure.js';
import { co2Status, latestCo2 } from '../lib/cabinCo2.js';
import { buildReportModel } from '../lib/report.js';
import {
  AUTO_MEASURE_SCAN_MS,
  AXIS_MIN_DISTANCE_MM,
  AXIS_MIN_DISTANCE_PX,
  CALIBRATION_LABELS,
  MEASURE_DEPTH_MM,
  MEASURE_MARKER_COLOR,
  MESSAGES,
  PHANTOM_ONSD_DEFAULT_MM,
  PHANTOM_ONSD_MAX_MM,
  PHANTOM_ONSD_MIN_MM,
  REPORT,
  RISK_LABELS,
} from '../config.js';
import pkg from '../../package.json';
import ResultCard from './ResultCard.jsx';
import { BrandLogo } from './Brand.jsx';
import { renderReportPdf } from './reportPdf.js';

const MAX_UPLOAD_WIDTH = 900;
const HANDLE_RADIUS_DISPLAY_PX = 12;
const REPORT_IMAGE_BG = '#0f1a2e';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Copy a canvas onto an opaque background and return it as an image for the PDF report. */
function snapshotCanvas(canvas, type = 'image/png') {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d');
  ctx.fillStyle = REPORT_IMAGE_BG;
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0);
  return { dataUrl: copy.toDataURL(type, 0.9), width: copy.width, height: copy.height };
}

const CAL_MODES = [
  { id: 'scaleBar', label: 'Scale bar', hint: 'Click both ends of a ruler or scale bar, then enter its length in mm.' },
  {
    id: 'depth',
    label: 'Image depth',
    hint: 'Enter the depth shown on the scanner, then click the top of the image field (skin line) and the bottom (depth marker).',
  },
  { id: 'none', label: 'No scale available', hint: 'Measure in pixels only. No mm value, risk signal or ICP.' },
];

const FLOW_STEPS = [
  { id: 1, title: 'Load scan' },
  { id: 2, title: 'Measure' },
  { id: 3, title: 'Result' },
];

const STEPS = [
  { id: 1, title: 'Load an image', text: 'Upload an ocular ultrasound image, or generate a synthetic phantom.' },
  { id: 2, title: 'Calibrate the scale', text: 'Choose a calibration mode. Phantoms calibrate automatically from their scale bar.' },
  { id: 3, title: 'Mark the nerve axis', text: MESSAGES.clickGlobe },
  { id: 4, title: 'Measure', text: `ONSD is measured ${MEASURE_DEPTH_MM} mm behind the globe, perpendicular to the nerve axis.` },
  { id: 5, title: 'Review', text: 'Check the edges (drag to adjust), then read the result. Press Reset to start again.' },
];

/** Convert a greyscale array to RGBA ImageData for display. */
function greyToImageData(ctx, pixels, width, height) {
  const data = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  return data;
}

/** Load an uploaded File into a greyscale image (downscaled if very wide). */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_UPLOAD_WIDTH / img.naturalWidth);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const pixels = new Uint8ClampedArray(width * height);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
      }
      URL.revokeObjectURL(url);
      // The RGBA copy is kept so coloured annotations can be recognised and removed before measuring.
      resolve({ pixels, rgba, width, height, scaleFactor: scale });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be read as an image.'));
    };
    img.src = url;
  });
}

function drawLabel(ctx, text, x, y, color) {
  ctx.font = 'bold 13px system-ui, sans-serif';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - 4, y - 14, w + 8, 19);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawCross(ctx, p, color, size = 7) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y);
  ctx.lineTo(p.x + size, p.y);
  ctx.moveTo(p.x, p.y - size);
  ctx.lineTo(p.x, p.y + size);
  ctx.stroke();
}

function drawRing(ctx, p, color, r = 4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLine(ctx, a, b, color, width = 1.5, dash = null) {
  ctx.save();
  if (dash) ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

/** Edge marker: a short tick along the nerve axis plus a round drag handle. */
function drawEdgeMarker(ctx, p, u, color) {
  drawLine(ctx, pointAlongAxis(p, u, -14), pointAlongAxis(p, u, 14), color, 2.5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

export default function MeasureScreen({ onResult, crew, series = [], co2 = [], side = null }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null); // 'left' | 'right' | null
  const suppressClickRef = useRef(false);
  const scanTimerRef = useRef(null);

  const [scanning, setScanning] = useState(false); // Auto-Measure scan animation running
  const [autoCircle, setAutoCircle] = useState(null); // globe circle found by Auto-Measure
  const [reportState, setReportState] = useState('idle'); // 'idle' | 'generating' | 'ready'

  const [source, setSource] = useState(null);
  const [phantomOnsd, setPhantomOnsd] = useState(PHANTOM_ONSD_DEFAULT_MM);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [realism, setRealism] = useState('clean');
  const [seed, setSeed] = useState(42);

  const [calMode, setCalMode] = useState(null); // mode being set up in step 2
  const [calibPts, setCalibPts] = useState([]);
  const [calibMm, setCalibMm] = useState('5');
  const [depthCm, setDepthCm] = useState('4');
  const [calibration, setCalibration] = useState(null); // { mode, mmPerPx, points, auto, confirmedIndependent }

  const [clicks, setClicks] = useState([]); // [globe, axis, (depth when no scale)]
  const [globePt, setGlobePt] = useState(null); // globe point after snapping
  const [measurement, setMeasurement] = useState(null);
  const [manualPts, setManualPts] = useState([]);
  const [proposal, setProposal] = useState(null); // auto-detect result waiting for Accept / Re-pick
  const [viewStep, setViewStep] = useState(null); // earlier step opened from the stepper, or null
  const [notice, setNotice] = useState('');

  const scaled = calibration?.mode === 'scaleBar' || calibration?.mode === 'depth';
  const mmPerPx = scaled ? calibration.mmPerPx : null;
  const needClicks = calibration?.mode === 'none' ? 3 : 2;
  // Uploaded images are cleaned once per scale (annotations removed, scan-area mask, median filter);
  // detection and the edge profile use the cleaned copies, the canvas shows the original.
  const prepared = useMemo(
    () => (source?.kind === 'upload' && mmPerPx > 0 ? prepareSource(source, { mmPerPx }) : null),
    [source, mmPerPx]
  );
  const measureImage = prepared?.measure ?? source;
  const hasEdges = measurement?.leftOffset != null && measurement?.rightOffset != null;
  const manual = measurement != null && !hasEdges;

  let step = 1;
  if (source) step = 2;
  if (calibration) step = 3;
  if (measurement) step = 4;
  if (hasEdges) step = 5;

  // Calibration warning: a user scale bar laid over the measured sheath itself.
  let calibrationWarning = null;
  if (hasEdges && calibration?.mode === 'scaleBar' && !calibration.auto && !calibration.confirmedIndependent) {
    const edges = [
      edgePoint(measurement.center, measurement.n, measurement.leftOffset),
      edgePoint(measurement.center, measurement.n, measurement.rightOffset),
    ];
    if (calibrationOverlapsEdges(calibration.points, edges)) calibrationWarning = MESSAGES.calibOverlap;
  }

  const result = hasEdges
    ? buildResultState({
        widthPx: measurement.widthPx,
        mmPerPx,
        calibrationMode: calibration.mode,
        calibrationLabel: calibration.auto ? CALIBRATION_LABELS.phantom : CALIBRATION_LABELS[calibration.mode],
        calibrationWarning,
        method: measurement.method,
        confidence: measurement.confidence,
        level: measurement.level,
        groundTruthMm: source?.kind === 'phantom' ? source.groundTruthOnsdMm : null,
      })
    : null;

  useEffect(() => {
    onResult?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.onsdMm, result?.widthPx, result?.showClinical, result?.method]);

  // --- State transitions -------------------------------------------------------------

  useEffect(() => () => clearTimeout(scanTimerRef.current), []);

  // A new image, calibration or result always shows its own step again.
  const flowKey = `${source ? source.kind + (source.seed ?? source.name ?? '') : 'none'}|${Boolean(calibration)}|${measurement?.leftOffset != null}`;
  useEffect(() => setViewStep(null), [flowKey]);

  const clearMeasurement = () => {
    clearTimeout(scanTimerRef.current);
    setScanning(false);
    setAutoCircle(null);
    setClicks([]);
    setGlobePt(null);
    setMeasurement(null);
    setManualPts([]);
    setProposal(null);
  };

  const clearCalibration = () => {
    setCalibration(null);
    setCalMode(null);
    setCalibPts([]);
  };

  const reset = () => {
    clearMeasurement();
    clearCalibration();
    setSource(null);
    setNotice('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGenerate = (nextSeed = seed) => {
    clearMeasurement();
    const ph = generatePhantom({ onsdMm: phantomOnsd, seed: nextSeed, tiltDeg, realism });
    const sb = ph.scaleBar;
    const scale = computeMmPerPx({ x: sb.x1, y: sb.y1 }, { x: sb.x2, y: sb.y2 }, sb.lengthMm);
    setSource({ kind: 'phantom', ...ph });
    setCalMode('scaleBar');
    setCalibPts([]);
    setCalibration({
      mode: 'scaleBar',
      mmPerPx: scale,
      points: [{ x: sb.x1, y: sb.y1 }, { x: sb.x2, y: sb.y2 }],
      auto: true,
    });
    setNotice(`Phantom generated and auto-calibrated from its ${sb.lengthMm} mm scale bar. ${MESSAGES.clickGlobe}`);
  };

  const handleNewSeed = () => {
    const next = Math.floor(Math.random() * 1e6);
    setSeed(next);
    handleGenerate(next);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      clearMeasurement();
      clearCalibration();
      setSource({ kind: 'upload', name: file.name, ...img });
      setNotice(
        `${img.scaleFactor < 1 ? 'Large image was downscaled for display. ' : ''}Choose how to calibrate the scale.`
      );
    } catch (err) {
      setNotice(err.message);
    }
  };

  const chooseCalMode = (mode) => {
    setCalMode(mode);
    setCalibPts([]);
    if (mode === 'none') {
      setCalibration({ mode: 'none', mmPerPx: null, points: [] });
      setNotice(`${MESSAGES.noScale} ${MESSAGES.clickGlobe}`);
    } else {
      setNotice(CAL_MODES.find((m) => m.id === mode).hint);
    }
  };

  const confirmCalibration = () => {
    try {
      if (calMode === 'scaleBar') {
        if (calibrationSegmentTooShort(calibPts[0], calibPts[1])) {
          setNotice(MESSAGES.calibTooShort);
          return;
        }
        const scale = computeMmPerPx(calibPts[0], calibPts[1], parseFloat(calibMm));
        setCalibration({ mode: 'scaleBar', mmPerPx: scale, points: calibPts });
        setNotice(`Calibrated: ${(1 / scale).toFixed(1)} px per mm. ${MESSAGES.clickGlobe}`);
      } else if (calMode === 'depth') {
        const scale = computeMmPerPxFromDepth(parseFloat(depthCm) * 10, calibPts[0], calibPts[1]);
        setCalibration({ mode: 'depth', mmPerPx: scale, points: calibPts });
        setNotice(`Calibrated from image depth: ${(1 / scale).toFixed(1)} px per mm. ${MESSAGES.clickGlobe}`);
      }
    } catch (err) {
      setNotice(err.message);
    }
  };

  const runMeasure = (clickList, { snap = true, method = 'auto' } = {}) => {
    try {
      let globe = clickList[0];
      const axisPt = clickList[1];
      if (scaled && snap) {
        const { u, n } = axisFrame(globe, axisPt);
        globe = snapGlobePoint(measureImage, globe, u, n, mmPerPx);
      }
      setGlobePt(globe);
      const res = measureOnAxis(measureImage, { globePt: globe, axisPt, mmPerPx, depthPt: clickList[2] ?? null });
      setManualPts([]);
      if (res.ok) {
        setMeasurement({ ...res, method });
        setNotice(MESSAGES.edgesAuto);
      } else {
        setMeasurement({ ...res, leftOffset: null, rightOffset: null, widthPx: null, onsdMm: null, method: 'manual' });
        setNotice(MESSAGES.edgesUnclear);
      }
    } catch (err) {
      setNotice(err.message);
    }
  };

  const handleAxisClick = (pt) => {
    const next = [...clicks, pt];
    if (next.length === 2) {
      const minPx = scaled ? AXIS_MIN_DISTANCE_MM / mmPerPx : AXIS_MIN_DISTANCE_PX;
      if (Math.hypot(pt.x - next[0].x, pt.y - next[0].y) < minPx) {
        setNotice(MESSAGES.axisTooShort);
        return;
      }
    }
    setClicks(next);
    if (next.length < needClicks) {
      setNotice(next.length === 1 ? (scaled ? MESSAGES.clickAxis : MESSAGES.clickAxisNoScale) : MESSAGES.clickDepth);
      return;
    }
    runMeasure(next);
  };

  const handleManualClick = (pt) => {
    const pts = [...manualPts, pt];
    setManualPts(pts);
    if (pts.length < 2) {
      setNotice('Now click the other inner edge of the bright sheath.');
      return;
    }
    const offsets = pts.map((p) => projectOnto(p, measurement.center, measurement.n));
    setMeasurement((m) => ({ ...m, ...withEdgeOffsets(offsets[0], offsets[1], mmPerPx), method: 'manual' }));
    setNotice('Manual measurement complete. Drag the edge markers to fine-tune.');
  };

  const autoPick = () => {
    if (source?.kind !== 'phantom') return;
    const pts = [source.nerve.globePoint, source.nerve.axisPoint];
    setClicks(pts);
    runMeasure(pts, { snap: false });
  };

  // --- Auto-detect (beta): proposes points; the user accepts or re-picks them -------------

  const runAutodetect = () => {
    clearMeasurement();
    const res = autodetect(prepared?.detect ?? source, { mmPerPx: scaled ? mmPerPx : null, sector: prepared?.sector ?? null });
    setProposal(res);
    setNotice(res.level === 'low' || !res.globePoint ? MESSAGES.autoUnreliable : MESSAGES.autoDetected);
  };

  const acceptProposal = () => {
    const pts = [proposal.globePoint, proposal.axisPoint];
    const fromAutoMeasure = Boolean(proposal.fromAutoMeasure);
    if (fromAutoMeasure) setAutoCircle(proposal.debug?.circle ?? null);
    setProposal(null);
    setClicks(pts);
    if (calibration?.mode === 'none') {
      setNotice(MESSAGES.clickDepth);
      return;
    }
    // The detected point is already refined.
    runMeasure(pts, { snap: false, method: fromAutoMeasure ? AUTO_MEASURE_METHOD : 'auto' });
  };

  const repickManually = () => {
    setProposal(null);
    setClicks([]);
    setNotice(MESSAGES.clickGlobe);
  };

  // --- Auto-Measure: one click from a calibrated image to a result ------------------------

  const finishAutoMeasure = () => {
    const res = autoMeasure(source, { mmPerPx, prepared });
    setScanning(false);
    if (!res.ok) {
      if (res.points) {
        // Uncertain: show the globe and axis as a proposal the user can confirm or replace.
        setProposal({
          globePoint: res.points.globePoint,
          axisPoint: res.points.axisPoint,
          level: 'low',
          confidence: res.detection?.confidence ?? 0,
          debug: { circle: res.circle },
          fromAutoMeasure: true,
        });
        setNotice(MESSAGES.autoMeasureUncertain);
      } else {
        setNotice(`${MESSAGES.autoMeasureFailed} ${MESSAGES.clickGlobe}`);
      }
      return;
    }
    setAutoCircle(res.circle);
    setClicks([res.points.globePoint, res.points.axisPoint]);
    setGlobePt(res.points.globePoint);
    setMeasurement(res.measurement);
    setNotice(MESSAGES.autoMeasureDone);
  };

  const runAutoMeasure = () => {
    if (!source || !scaled || scanning) return;
    clearMeasurement();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finishAutoMeasure();
      return;
    }
    setScanning(true);
    setNotice('Auto-Measure: locating the globe, the nerve axis and the sheath edges…');
    scanTimerRef.current = setTimeout(finishAutoMeasure, AUTO_MEASURE_SCAN_MS);
  };

  // --- PDF report (downloaded locally; nothing is sent anywhere) ---------------------------

  const generateReport = async () => {
    if (!result || reportState !== 'idle') return;
    setReportState('generating');
    const started = performance.now();
    try {
      const model = buildReportModel({
        result,
        source,
        crewName: crew?.name ?? 'Crew Member A',
        series,
        co2,
        version: pkg.version,
        now: new Date(),
      });
      const doc = await renderReportPdf(model, {
        trend: snapshotCanvas(document.querySelector('.trend-chart canvas')),
        measurement: snapshotCanvas(canvasRef.current, 'image/jpeg'),
      });
      await wait(Math.max(0, REPORT.generatingMs - (performance.now() - started)));
      setReportState('ready');
      doc.save(model.filename);
      await wait(REPORT.readyMs);
    } catch (err) {
      setNotice(`The report could not be generated: ${err.message}`);
    } finally {
      setReportState('idle');
    }
  };

  const switchToManual = () => {
    setManualPts([]);
    setMeasurement((m) => ({ ...m, leftOffset: null, rightOffset: null, widthPx: null, onsdMm: null, method: 'manual' }));
    setNotice(MESSAGES.edgesUnclear);
  };

  // --- Canvas interaction ----------------------------------------------------------------

  const toImage = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
      scale: canvas.width / rect.width,
    };
  };

  const edgeUnderPointer = (p) => {
    if (!hasEdges) return null;
    const r = HANDLE_RADIUS_DISPLAY_PX * p.scale;
    for (const side of ['left', 'right']) {
      const e = edgePoint(measurement.center, measurement.n, side === 'left' ? measurement.leftOffset : measurement.rightOffset);
      if (Math.hypot(e.x - p.x, e.y - p.y) <= r) return side;
    }
    return null;
  };

  const onPointerDown = (e) => {
    const p = toImage(e);
    const side = edgeUnderPointer(p);
    if (side) {
      dragRef.current = side;
      canvasRef.current.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const onPointerMove = (e) => {
    const p = toImage(e);
    if (dragRef.current) {
      const side = dragRef.current;
      setMeasurement((m) => {
        const next = dragEdge(m, side, p, mmPerPx);
        // Keep the dragged handle identity if it crossed the other edge.
        const draggedOffset = projectOnto(p, m.center, m.n);
        dragRef.current = draggedOffset === next.leftOffset ? 'left' : 'right';
        const adjustable = m.method === 'auto' || m.method === 'auto-measure';
        return { ...next, method: adjustable ? `${m.method} (adjusted)` : m.method };
      });
      suppressClickRef.current = true;
      return;
    }
    canvasRef.current.style.cursor = edgeUnderPointer(p) ? 'ew-resize' : step <= 4 || manual ? 'crosshair' : 'default';
  };

  const onPointerUp = (e) => {
    if (dragRef.current) {
      dragRef.current = null;
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const handleCanvasClick = (e) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!source || scanning) return;
    const { x, y } = toImage(e);
    const pt = { x, y };
    if (step === 2 && (calMode === 'scaleBar' || calMode === 'depth') && !calibration) {
      setCalibPts((pts) => (pts.length >= 2 ? [pt] : [...pts, pt]));
      return;
    }
    if (step === 3) {
      if (proposal) setProposal(null); // a manual click replaces the auto-detect proposal
      handleAxisClick(pt);
      return;
    }
    if (manual && manualPts.length < 2) handleManualClick(pt);
  };

  // --- Drawing -----------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(greyToImageData(ctx, source.pixels, source.width, source.height), 0, 0);

    if (source.kind === 'phantom') {
      const sb = source.scaleBar;
      drawLabel(ctx, `${sb.lengthMm} mm`, sb.x1 + 30, sb.y1 - 12, '#ffffff');
      ctx.save();
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText('SYNTHETIC PHANTOM', 16, 32);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(
        `Generated by AeroSANS — not a patient image · ${source.realism}, tilt ${source.tiltDeg}°`,
        16,
        50
      );
      ctx.restore();
    }

    // Calibration overlay (user calibration only).
    const calPts = calibration && !calibration.auto ? calibration.points : calibPts;
    const calKind = calibration ? calibration.mode : calMode;
    if (calPts?.length) {
      if (calKind === 'depth') {
        calPts.forEach((p, i) => {
          drawLine(ctx, { x: 0, y: p.y }, { x: source.width, y: p.y }, '#38bdf8', 1.5, [6, 4]);
          drawLabel(ctx, i === 0 ? 'Top of image field' : `Depth marker (${depthCm} cm)`, 12, p.y - 6, '#7dd3fc');
        });
      } else {
        if (calPts.length === 2) drawLine(ctx, calPts[0], calPts[1], '#38bdf8', 2);
        calPts.forEach((p) => drawCross(ctx, p, '#38bdf8'));
      }
    }

    // Auto-detect proposal: dashed globe circle, row minima, globe point and axis.
    if (proposal) {
      const { circle, minima } = proposal.debug ?? {};
      if (circle) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
      (minima ?? []).forEach((m) => ctx.fillRect(m.x - 1, m.y - 1, 2, 2));
      if (proposal.globePoint && proposal.axisPoint) {
        const { u } = axisFrame(proposal.globePoint, proposal.axisPoint);
        const axisColor = proposal.fromAutoMeasure ? MEASURE_MARKER_COLOR : '#22d3ee';
        drawLine(ctx, pointAlongAxis(proposal.globePoint, u, -20), pointAlongAxis(proposal.globePoint, u, 260), axisColor, 1.5, [5, 5]);
        drawCross(ctx, proposal.globePoint, '#f472b6', 9);
        drawCross(ctx, proposal.axisPoint, '#22d3ee', 7);
      }
      const label = proposal.fromAutoMeasure ? 'Proposal — confirm or measure manually' : `Auto-detected (confidence: ${proposal.level})`;
      drawLabel(ctx, label, 16, source.height - 52, proposal.level === 'low' ? '#fca5a5' : '#7dd3fc');
    }

    // Axis clicks.
    if (clicks[0]) drawRing(ctx, clicks[0], '#f9a8d4', 5);
    if (globePt) drawCross(ctx, globePt, '#f472b6', 9);
    if (clicks[1]) drawCross(ctx, clicks[1], '#22d3ee', 7);
    if (clicks[2]) drawRing(ctx, clicks[2], MEASURE_MARKER_COLOR, 5);

    // Globe circle found by Auto-Measure.
    if (autoCircle && measurement) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(autoCircle.x, autoCircle.y, autoCircle.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (measurement) {
      const { center, u, n, globePt: g, halfWidthPx } = measurement;
      // Nerve axis and depth.
      drawLine(ctx, g, pointAlongAxis(center, u, 80), '#22d3ee', 1.2, [5, 5]);
      if (scaled) {
        drawLabel(
          ctx,
          `${MEASURE_DEPTH_MM} mm`,
          (g.x + center.x) / 2 + 12 * n.x + 6,
          (g.y + center.y) / 2 + 12 * n.y + 4,
          MEASURE_MARKER_COLOR
        );
      }
      // Measurement line (the 3 mm marker), perpendicular to the axis.
      drawLine(ctx, pointAlongAxis(center, n, -halfWidthPx), pointAlongAxis(center, n, halfWidthPx), MEASURE_MARKER_COLOR, 1.5);

      manualPts.forEach((p) => drawEdgeMarker(ctx, edgePoint(center, n, projectOnto(p, center, n)), u, '#fb923c'));

      if (hasEdges) {
        const color = measurement.method === 'auto' || measurement.method === 'auto-measure' ? '#22c55e' : '#fb923c';
        const l = edgePoint(center, n, measurement.leftOffset);
        const r = edgePoint(center, n, measurement.rightOffset);
        drawEdgeMarker(ctx, l, u, color);
        drawEdgeMarker(ctx, r, u, color);
        const text =
          measurement.onsdMm != null && scaled
            ? `ONSD ${measurement.onsdMm.toFixed(2)} mm`
            : `ONSD ${measurement.widthPx.toFixed(1)} px`;
        const labelAt = pointAlongAxis(r, n, 12);
        drawLabel(ctx, text, labelAt.x, labelAt.y + 28, color);
      }
    }
  }, [source, calibration, calMode, calibPts, depthCm, clicks, globePt, measurement, manualPts, scaled, proposal, autoCircle]);

  // --- Render ----------------------------------------------------------------------------

  const clickHint = (() => {
    if (scanning) return 'Scanning…';
    if (step === 2 && calMode === 'scaleBar' && !calibration) return `Scale bar: click point ${Math.min(calibPts.length + 1, 2)} of 2`;
    if (step === 2 && calMode === 'depth' && !calibration) return calibPts.length === 0 ? 'Click the top of the image field' : 'Click the depth marker (bottom)';
    if (step === 3 && proposal) return 'Accept the proposal, or click to pick manually';
    if (step === 3) return ['Click the posterior globe boundary', 'Click further down the nerve (center of the dark band)', 'Click the point 3 mm behind the globe'][clicks.length];
    if (manual) return manualPts.length === 0 ? 'Click one inner edge of the bright sheath' : 'Click the other inner edge';
    if (hasEdges) return 'Drag an edge marker to adjust';
    return '';
  })();

  const co2Latest = latestCo2(co2);
  const showCalibChoice = source?.kind === 'upload' && step === 2;
  const calibReady = calibPts.length === 2;

  // --- Three-step flow: ① Load scan → ② Measure → ③ Result ---------------------------------
  // `step` (1–5) is the detailed internal state; the stepper shows three steps. The user can open
  // an earlier step again without losing the current measurement.
  const uiStep = hasEdges ? 3 : calibration ? 2 : 1;
  const shown = Math.min(viewStep ?? uiStep, uiStep);
  const measureAgain = () => {
    clearMeasurement();
    setNotice(MESSAGES.clickGlobe);
  };
  const instruction = notice || STEPS[step - 1].text;

  const loadButtons = (primaryDemo) => (
    <div className="row load-actions">
      <button
        className={`btn ${primaryDemo ? 'btn-primary' : ''}`}
        onClick={() => handleGenerate()}
        aria-label="Use the demo phantom: generate a synthetic ultrasound image"
      >
        Use demo phantom
      </button>
      <label className="btn" htmlFor="file-input" tabIndex={0} aria-label="Upload an ultrasound image">
        Upload image
      </label>
    </div>
  );

  const phantomOptions = (
    <details className="advanced-phantom">
      <summary>Demo phantom options</summary>
      <label htmlFor="onsd-slider">
        Phantom ONSD: <strong>{phantomOnsd.toFixed(1)} mm</strong>
      </label>
      <input
        id="onsd-slider"
        type="range"
        min={PHANTOM_ONSD_MIN_MM}
        max={PHANTOM_ONSD_MAX_MM}
        step="0.1"
        value={phantomOnsd}
        onChange={(e) => setPhantomOnsd(parseFloat(e.target.value))}
      />
      <label htmlFor="tilt-slider">
        Nerve tilt: <strong>{tiltDeg > 0 ? '+' : ''}{tiltDeg}°</strong>
      </label>
      <input
        id="tilt-slider"
        type="range"
        min="-30"
        max="30"
        step="1"
        value={tiltDeg}
        onChange={(e) => setTiltDeg(parseInt(e.target.value, 10))}
      />
      <div className="segmented" role="radiogroup" aria-label="Phantom realism">
        {['clean', 'realistic'].map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={realism === r}
            className={`btn btn-ghost ${realism === r ? 'active' : ''}`}
            onClick={() => setRealism(r)}
          >
            {r === 'clean' ? 'Clean' : 'Realistic'}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={handleNewSeed} title="New random speckle pattern">
          New seed
        </button>
      </div>
    </details>
  );

  return (
    <div className="flow">
      <input id="file-input" ref={fileRef} type="file" accept="image/*" onChange={handleUpload} hidden />

      <ol className="stepper" aria-label="Measurement steps">
        {FLOW_STEPS.map((s) => {
          const state = s.id === shown ? 'active' : s.id < uiStep || (s.id === uiStep && s.id !== shown) ? 'done' : '';
          const reachable = s.id <= uiStep;
          return (
            <li key={s.id} className={`stepper-item ${state} ${s.id <= uiStep ? 'reached' : ''}`}>
              <button
                className="stepper-btn"
                onClick={() => setViewStep(s.id)}
                disabled={!reachable}
                aria-current={s.id === shown ? 'step' : undefined}
                aria-label={`Step ${s.id}: ${s.title}`}
              >
                <span className="stepper-num">{s.id < uiStep ? '✓' : s.id}</span>
                <span className="stepper-title">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flow-grid">
        <section className="card step-card" key={shown} aria-live="polite">
          {/* ① Load scan */}
          {shown === 1 && !source && (
            <div className="empty-state">
              <BrandLogo />
              <p className="empty-lead">
                No scan yet — try the demo phantom. AeroSANS measures the optic nerve sheath diameter (ONSD) on an
                eye ultrasound image and turns it into a risk signal for spaceflight-associated neuro-ocular
                syndrome (SANS).
              </p>
              {loadButtons(true)}
              <p className="muted small">Only upload images you have the right to use. Images stay in this browser.</p>
              {phantomOptions}
            </div>
          )}
          {shown === 1 && source && (
            <>
              <h2>Load a scan</h2>
              {loadButtons(!calibration && source.kind !== 'upload')}
              {phantomOptions}
              {source.kind === 'upload' && !calibration && (
                <div className="calib-panel">
                  <p className="step-instruction">Choose how to set the scale of this image.</p>
                  <div className="calib-cards" role="radiogroup" aria-label="Calibration mode">
                    {CAL_MODES.map((m) => (
                      <button
                        key={m.id}
                        role="radio"
                        aria-checked={calMode === m.id}
                        className={`calib-card ${calMode === m.id ? 'active' : ''}`}
                        onClick={() => chooseCalMode(m.id)}
                      >
                        <strong>{m.label}</strong>
                        <span>{m.hint}</span>
                      </button>
                    ))}
                  </div>
                  {calMode === 'scaleBar' && (
                    <div className="calib-box">
                      <span>Points: {calibPts.length}/2 · Length:</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={calibMm}
                        onChange={(e) => setCalibMm(e.target.value)}
                        aria-label="Scale bar length in mm"
                      />
                      <span>mm</span>
                      <button className="btn btn-primary" disabled={!calibReady} onClick={confirmCalibration}>
                        Confirm calibration
                      </button>
                    </div>
                  )}
                  {calMode === 'depth' && (
                    <div className="calib-box">
                      <span>Depth on screen:</span>
                      <input
                        type="number"
                        min="0.5"
                        step="0.1"
                        value={depthCm}
                        onChange={(e) => setDepthCm(e.target.value)}
                        aria-label="Image depth in cm"
                      />
                      <span>cm · Points: {calibPts.length}/2</span>
                      <button className="btn btn-primary" disabled={!calibReady} onClick={confirmCalibration}>
                        Confirm calibration
                      </button>
                    </div>
                  )}
                </div>
              )}
              {calibration && (
                <p className="small muted">
                  Scale: {calibration.auto ? CALIBRATION_LABELS.phantom : CALIBRATION_LABELS[calibration.mode]}.{' '}
                  {source.kind === 'upload' && (
                    <button
                      className="link-btn"
                      onClick={() => {
                        clearMeasurement();
                        clearCalibration();
                      }}
                    >
                      Change calibration
                    </button>
                  )}
                </p>
              )}
            </>
          )}

          {/* ② Measure */}
          {shown === 2 && (
            <>
              <h2>Measure the sheath</h2>
              <p className={`step-instruction ${proposal?.fromAutoMeasure ? 'uncertain' : ''}`}>{instruction}</p>
              {proposal ? (
                <div className="row">
                  <button
                    className="btn btn-primary"
                    onClick={acceptProposal}
                    disabled={!proposal.globePoint || (proposal.level === 'low' && !proposal.fromAutoMeasure)}
                  >
                    Confirm
                  </button>
                  <button className="btn" onClick={repickManually}>
                    Measure manually
                  </button>
                </div>
              ) : (
                <div className="row">
                  <button
                    className="btn btn-primary"
                    onClick={runAutoMeasure}
                    disabled={!scaled || scanning}
                    aria-label="Auto-Measure: find the globe, the nerve axis and the sheath edges"
                    title={
                      scaled
                        ? 'Finds the globe, the nerve axis and the sheath edges in one step (classical image processing)'
                        : 'Without a scale, mark the points manually on the image'
                    }
                  >
                    {scanning ? 'Measuring…' : 'Auto-Measure'}
                  </button>
                  <button className="btn" onClick={measureAgain} disabled={scanning}>
                    Measure manually
                  </button>
                  {clicks.length > 0 && (
                    <button className="link-btn" onClick={measureAgain}>
                      Re-pick points
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ③ Result: heading only; the result card follows the image */}
          {shown === 3 && (
            <>
              <h2>Review the result</h2>
              <p className="step-instruction">{instruction}</p>
            </>
          )}

          {source && (
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                className="measure-canvas clickable"
                onClick={handleCanvasClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
              {scanning && (
                <div className="scan-overlay" aria-hidden="true" style={{ '--scan-ms': `${AUTO_MEASURE_SCAN_MS}ms` }}>
                  <div className="scan-line" />
                </div>
              )}
              {clickHint && <div className="canvas-hint">{clickHint}</div>}
            </div>
          )}
          {source?.kind === 'upload' && <p className="small muted real-note">{MESSAGES.realImageNote}</p>}
          {source?.kind === 'phantom' && (
            <p className="small muted">
              Simulated data — synthetic phantom (seed {source.seed}, {source.realism}, tilt {source.tiltDeg}°).
            </p>
          )}

          {shown === 3 && result && (
            <ResultCard
              result={result}
              onRecalibrate={() => {
                clearMeasurement();
                clearCalibration();
                setNotice('Choose a calibration mode and use a known scale (ruler, scale bar or image depth).');
              }}
              onConfirmScale={() => setCalibration((c) => ({ ...c, confirmedIndependent: true }))}
              co2={co2Latest ? { value: co2Latest.co2, status: co2Status(co2Latest.co2) } : null}
              onGenerateReport={generateReport}
              reportBusy={reportState !== 'idle'}
              onMeasureAgain={measureAgain}
              onManualEdges={measurement?.method !== 'manual' ? switchToManual : null}
            />
          )}
        </section>

        <aside className="flow-side">
          {side}
          <section className={`card summary-card ${result?.showClinical ? `risk-${result.risk}` : ''}`} aria-label="Result summary">
            <div className="label">Latest result</div>
            {result ? (
              <div className="summary-row">
                <span className="summary-value">
                  {result.onsdMm != null ? `${result.onsdMm.toFixed(2)} mm` : `${result.widthPx.toFixed(1)} px`}
                </span>
                {result.showClinical ? (
                  <span className={`risk-badge small-badge risk-badge-${result.risk}`}>{RISK_LABELS[result.risk]}</span>
                ) : (
                  <span className="risk-badge small-badge risk-badge-none">No risk signal</span>
                )}
              </div>
            ) : (
              <p className="muted small">No measurement yet. Load a scan and measure to see the result here.</p>
            )}
          </section>
        </aside>
      </div>

      {reportState !== 'idle' && (
        <div className="report-overlay" role="status" aria-live="polite">
          <div className="report-overlay-box">
            {reportState === 'generating' && <div className="spinner" aria-hidden="true" />}
            <strong>{reportState === 'generating' ? REPORT.generating : REPORT.ready}</strong>
            <span className="small muted">The PDF is saved to this device. Nothing is sent anywhere.</span>
          </div>
        </div>
      )}
    </div>
  );
}
