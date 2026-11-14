// AeroSANS — NASA Space Apps Challenge 2026
// Portions of this file were generated with AI assistance (Claude Code, Anthropic) and reviewed by the team.

import { useCallback, useEffect, useRef, useState } from 'react';
import { generatePhantom } from '../lib/phantom.js';
import { computeMmPerPx, measureOnsd, measurementLineY } from '../lib/measure.js';
import {
  MEASURE_DEPTH_MM,
  PHANTOM_ONSD_DEFAULT_MM,
  PHANTOM_ONSD_MAX_MM,
  PHANTOM_ONSD_MIN_MM,
  PROFILE_HALF_WIDTH_MM,
} from '../config.js';
import ResultCard from './ResultCard.jsx';

const MAX_UPLOAD_WIDTH = 900;

const STEPS = [
  { id: 1, title: 'Load an image', text: 'Upload an ocular ultrasound image, or generate a synthetic phantom.' },
  { id: 2, title: 'Calibrate the scale', text: 'Click both ends of the scale bar, then enter its length in mm. Phantoms calibrate automatically.' },
  { id: 3, title: 'Mark the globe', text: 'Click the posterior globe boundary where the optic nerve leaves the eye.' },
  { id: 4, title: 'Measure', text: `ONSD is measured ${MEASURE_DEPTH_MM} mm behind the globe, perpendicular to the nerve. If detection fails, click the left and right edges of the dark nerve band.` },
  { id: 5, title: 'Review', text: 'Read the risk signal and the recommended action. Press Reset to start again.' },
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
      resolve({ pixels, width, height, scaleFactor: scale });
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

function drawMarker(ctx, x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEdgeTick(ctx, x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
}

export default function MeasureScreen({ onResult }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  const [source, setSource] = useState(null);
  const [phantomOnsd, setPhantomOnsd] = useState(PHANTOM_ONSD_DEFAULT_MM);
  const [seed, setSeed] = useState(42);
  const [mmPerPx, setMmPerPx] = useState(null);
  const [calibPts, setCalibPts] = useState([]);
  const [calibMm, setCalibMm] = useState('5');
  const [globePt, setGlobePt] = useState(null);
  const [measurement, setMeasurement] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualPts, setManualPts] = useState([]);
  const [notice, setNotice] = useState('');

  // Derived step (1–5).
  let step = 1;
  if (source) step = 2;
  if (source && mmPerPx) step = 3;
  if (globePt) step = 4;
  if (measurement && measurement.onsdMm != null) step = 5;

  const result =
    measurement && measurement.onsdMm != null
      ? { onsdMm: measurement.onsdMm, mode: measurement.mode, groundTruthMm: source?.kind === 'phantom' ? source.groundTruthOnsdMm : undefined }
      : null;

  useEffect(() => {
    onResult?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.onsdMm, result?.mode]);

  const clearMeasurement = () => {
    setGlobePt(null);
    setMeasurement(null);
    setManual(false);
    setManualPts([]);
    setNotice('');
  };

  const reset = () => {
    clearMeasurement();
    setSource(null);
    setMmPerPx(null);
    setCalibPts([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGenerate = (nextSeed = seed) => {
    clearMeasurement();
    const ph = generatePhantom({ onsdMm: phantomOnsd, seed: nextSeed });
    const { scaleBar } = ph;
    // Auto-calibrate from the burnt-in scale bar.
    const scale = computeMmPerPx({ x: scaleBar.x1, y: scaleBar.y1 }, { x: scaleBar.x2, y: scaleBar.y2 }, scaleBar.lengthMm);
    setSource({ kind: 'phantom', ...ph });
    setMmPerPx(scale);
    setCalibPts([]);
    setNotice(`Phantom generated and auto-calibrated from its ${scaleBar.lengthMm} mm scale bar.`);
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
      setSource({ kind: 'upload', name: file.name, ...img });
      setMmPerPx(null);
      setCalibPts([]);
      setNotice(img.scaleFactor < 1 ? 'Large image was downscaled for display. Calibrate on this view.' : '');
    } catch (err) {
      setNotice(err.message);
    }
  };

  const runAutoMeasure = useCallback(
    (pt) => {
      const res = measureOnsd(source, { globeX: pt.x, globeY: pt.y, mmPerPx });
      if (res.onsdMm != null) {
        setMeasurement({ ...res, mode: 'auto' });
        setManual(false);
        setNotice('Edges detected automatically. Check that the green ticks sit on the borders of the dark nerve band.');
      } else {
        setMeasurement({ ...res, mode: 'manual' });
        setManual(true);
        setManualPts([]);
        setNotice(`${res.reason} Manual mode: click the left, then the right edge of the dark nerve band on the yellow line.`);
      }
    },
    [source, mmPerPx]
  );

  const confirmCalibration = () => {
    const mm = parseFloat(calibMm);
    try {
      const scale = computeMmPerPx(calibPts[0], calibPts[1], mm);
      setMmPerPx(scale);
      setNotice(`Calibrated: ${(1 / scale).toFixed(1)} px per mm.`);
    } catch (err) {
      setNotice(err.message);
    }
  };

  const handleCanvasClick = (e) => {
    if (!source) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;

    if (step === 2) {
      setCalibPts((pts) => (pts.length >= 2 ? [{ x, y }] : [...pts, { x, y }]));
      return;
    }
    if (step === 3) {
      const pt = { x, y };
      setGlobePt(pt);
      runAutoMeasure(pt);
      return;
    }
    if (manual && measurement && manualPts.length < 2) {
      const pts = [...manualPts, { x, y: measurement.lineY }];
      setManualPts(pts);
      if (pts.length === 2) {
        const leftX = Math.min(pts[0].x, pts[1].x);
        const rightX = Math.max(pts[0].x, pts[1].x);
        const onsdMm = (rightX - leftX) * mmPerPx;
        setMeasurement((m) => ({ ...m, leftX, rightX, onsdMm, mode: 'manual' }));
        setNotice('Manual measurement complete.');
      }
    }
  };

  const switchToManual = () => {
    setManual(true);
    setManualPts([]);
    setMeasurement((m) => ({ ...m, leftX: undefined, rightX: undefined, onsdMm: null, mode: 'manual' }));
    setNotice('Manual mode: click the left, then the right edge of the dark nerve band on the yellow line.');
  };

  const autoPickGlobe = () => {
    if (source?.kind !== 'phantom') return;
    const pt = { x: source.nerve.centerX, y: source.nerve.globeBoundaryY };
    setGlobePt(pt);
    runAutoMeasure(pt);
  };

  // Redraw the canvas whenever anything visible changes.
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
      // Mandatory watermark.
      ctx.save();
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText('SYNTHETIC PHANTOM', 16, 32);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Generated by AeroSANS — not a patient image', 16, 50);
      ctx.restore();
    }

    // Calibration points.
    if (calibPts.length) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      if (calibPts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(calibPts[0].x, calibPts[0].y);
        ctx.lineTo(calibPts[1].x, calibPts[1].y);
        ctx.stroke();
      }
      calibPts.forEach((p) => drawMarker(ctx, p.x, p.y, '#38bdf8'));
    }

    if (globePt && mmPerPx) {
      drawMarker(ctx, globePt.x, globePt.y, '#f472b6');
      const lineY = measurementLineY(globePt.y, mmPerPx);
      const half = PROFILE_HALF_WIDTH_MM / mmPerPx;

      // Depth bracket.
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(globePt.x, globePt.y);
      ctx.lineTo(globePt.x, lineY);
      ctx.stroke();
      ctx.restore();
      drawLabel(ctx, `${MEASURE_DEPTH_MM} mm`, globePt.x + 10, (globePt.y + lineY) / 2 + 4, '#f9a8d4');

      // Measurement line (perpendicular to the vertical nerve axis).
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(globePt.x - half, lineY);
      ctx.lineTo(globePt.x + half, lineY);
      ctx.stroke();

      manualPts.forEach((p) => drawEdgeTick(ctx, p.x, p.y, '#fb923c'));

      if (measurement?.leftX != null && measurement?.rightX != null) {
        const color = measurement.mode === 'manual' ? '#fb923c' : '#22c55e';
        drawEdgeTick(ctx, measurement.leftX, lineY, color);
        drawEdgeTick(ctx, measurement.rightX, lineY, color);
        drawLabel(
          ctx,
          `ONSD ${measurement.onsdMm.toFixed(2)} mm`,
          measurement.rightX + 10,
          lineY + 30,
          color
        );
      }
    }
  }, [source, calibPts, globePt, mmPerPx, measurement, manualPts]);

  const cursorHint =
    step === 2 ? 'Click an end of the scale bar' : step === 3 ? 'Click the posterior globe boundary' : manual && manualPts.length < 2 ? (manualPts.length === 0 ? 'Click the left edge' : 'Click the right edge') : '';

  return (
    <div className="measure-layout">
      <section className="card measure-card">
        <div className="measure-header">
          <h2>ONSD measurement</h2>
          <button className="btn btn-ghost" onClick={reset} disabled={!source}>
            Reset
          </button>
        </div>

        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.id} className={s.id === step ? 'active' : s.id < step ? 'done' : ''}>
              <span className="step-num">{s.id < step ? '✓' : s.id}</span>
              <div>
                <strong>{s.title}</strong>
                {s.id === step && <div className="step-text">{s.text}</div>}
              </div>
            </li>
          ))}
        </ol>

        <div className="controls">
          <div className="control-group">
            <label className="btn" htmlFor="file-input">
              Upload ultrasound image
            </label>
            <input id="file-input" ref={fileRef} type="file" accept="image/*" onChange={handleUpload} hidden />
            <span className="muted small">Only use images you have the right to use.</span>
          </div>

          <div className="control-group phantom-group">
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
            <div className="row">
              <button className="btn btn-primary" onClick={() => handleGenerate()}>
                Generate synthetic phantom
              </button>
              <button className="btn btn-ghost" onClick={handleNewSeed} title="New random speckle pattern">
                New seed
              </button>
            </div>
          </div>
        </div>

        {step === 2 && source?.kind === 'upload' && (
          <div className="calib-box">
            <span>
              Points: {calibPts.length}/2 · Length:
            </span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={calibMm}
              onChange={(e) => setCalibMm(e.target.value)}
              aria-label="Scale bar length in mm"
            />
            <span>mm</span>
            <button className="btn btn-primary" disabled={calibPts.length !== 2} onClick={confirmCalibration}>
              Confirm calibration
            </button>
          </div>
        )}

        {source && <div className="notice">{notice || STEPS[step - 1].text}</div>}

        <div className="canvas-wrap">
          {source ? (
            <>
              <canvas
                ref={canvasRef}
                className={`measure-canvas ${cursorHint ? 'clickable' : ''}`}
                onClick={handleCanvasClick}
              />
              {cursorHint && <div className="canvas-hint">{cursorHint}</div>}
            </>
          ) : (
            <div className="canvas-empty">
              <p>No image loaded.</p>
              <p className="muted small">Generate a synthetic phantom to try the full flow.</p>
            </div>
          )}
        </div>

        <div className="row">
          {step === 3 && source?.kind === 'phantom' && (
            <button className="btn btn-ghost" onClick={autoPickGlobe}>
              Auto-pick globe point (phantom)
            </button>
          )}
          {measurement?.mode === 'auto' && measurement.onsdMm != null && (
            <button className="btn btn-ghost" onClick={switchToManual}>
              Use manual edges instead
            </button>
          )}
          {globePt && (
            <button className="btn btn-ghost" onClick={clearMeasurement}>
              Re-pick globe point
            </button>
          )}
        </div>
        {source?.kind === 'phantom' && <p className="small muted">Simulated data — synthetic phantom (seed {source.seed}).</p>}
      </section>

      <ResultCard onsdMm={result?.onsdMm ?? null} mode={result?.mode} groundTruthMm={result?.groundTruthMm} />
    </div>
  );
}
