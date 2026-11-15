// Local validation harness: runs clean-up + auto-detection + ONSD measurement on real images listed
// in a manifest and compares the results with expert values. Images, the manifest, the report and
// the overlays are NEVER committed.
//
// Usage:  npm run validate                 (uses validation/manifest.json, else the example)
//         node validation/run.mjs my.json  (custom manifest)
//
// Per image it reports
//   - the distance between the auto-detected globe point and `expertGlobePoint` (mm),
//   - ONSD in two modes: "auto" (auto-detected axis) and "manual" (axis straight down from
//     `expertGlobePoint`, like the two-click flow),
//   - each mode with every edge method (fraction 0.5 / 0.65 / 0.75 and gradient),
// and writes validation/out/<file>_overlay.png.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { autodetect } from '../src/lib/autodetect.js';
import { axisFrame, measureOnAxis, pointAlongAxis, snapGlobePoint } from '../src/lib/measure.js';
import { preprocess, rgbaToGrey } from '../src/lib/preprocess.js';
import { EDGE_METHOD, EDGE_THRESHOLD_FRACTION, MEASURE_DEPTH_MM } from '../src/config.js';
import { EDGE_VARIANTS, phantomSweep, sweepTable } from './phantomSweep.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(here, 'images');
const outDir = join(here, 'out');
const reportPath = join(here, 'report.md');
const GLOBE_OK_MM = 1.5;
const DEFAULT_VARIANT =
  EDGE_METHOD === 'gradient' ? 'gradient' : `fraction ${EDGE_THRESHOLD_FRACTION.toFixed(2)}`;

function pickManifest() {
  const arg = process.argv[2];
  if (arg) return resolve(arg);
  const local = join(here, 'manifest.json');
  if (existsSync(local)) return local;
  console.log('No validation/manifest.json found — using validation/manifest.example.json.');
  return join(here, 'manifest.example.json');
}

/** Decode PNG or JPEG into { rgba, pixels (grey), width, height }, optionally cropped to [x, y, w, h]. */
function loadImage(file, crop = null) {
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();
  let rgba;
  let width;
  let height;
  if (ext === '.png') {
    const png = PNG.sync.read(buf);
    ({ width, height } = png);
    rgba = png.data;
  } else if (ext === '.jpg' || ext === '.jpeg') {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    ({ width, height } = img);
    rgba = img.data;
  } else {
    throw new Error(`Unsupported image type "${ext}" (use .png, .jpg or .jpeg).`);
  }
  const fullSize = [width, height];
  if (crop) {
    const [cx, cy, cw, ch] = crop;
    const w = Math.min(cw, width - cx);
    const h = Math.min(ch, height - cy);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const start = ((y + cy) * width + cx) * 4;
      out.set(rgba.subarray(start, start + w * 4), y * w * 4);
    }
    rgba = out;
    width = w;
    height = h;
  } else {
    rgba = new Uint8ClampedArray(rgba);
  }
  return { kind: 'upload', rgba, pixels: rgbaToGrey(rgba, width, height), width, height, fullSize };
}

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// --- Overlay drawing (no canvas dependency) ---------------------------------------------------

const FONT = {
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11110000010000101110000010000111110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100', '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000',
  ':': '00000011000110000000011000110000000', ' ': '00000000000000000000000000000000000',
  A: '01110100011000111111100011000110001', U: '10001100011000110001100011000101110', T: '11111001000010000100001000010000100',
  O: '01110100011000110001100011000101110', M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001',
  L: '10000100001000010000100001000011111', E: '11111100001000011110100001000011111', X: '10001100010101000100010101000110001',
  P: '11110100011000111110100001000010000', R: '11110100011000111110101001001010001',
};

function makeCanvas(image) {
  const { width, height, rgba } = image;
  const data = new Uint8ClampedArray(rgba);
  const set = (x, y, [r, g, b]) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  const line = (a, b, color, thick = 1) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let k = 0; k <= steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const y = a.y + ((b.y - a.y) * k) / steps;
      for (let t = 0; t < thick; t++) {
        set(x + t, y, color);
        set(x, y + t, color);
      }
    }
  };
  const cross = (p, color, size = 8) => {
    line({ x: p.x - size, y: p.y }, { x: p.x + size, y: p.y }, color, 2);
    line({ x: p.x, y: p.y - size }, { x: p.x, y: p.y + size }, color, 2);
  };
  const text = (str, x0, y0, color, scale = 2) => {
    let x = x0;
    for (const ch of str.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT[' '];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy * 5 + gx] !== '1') continue;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(x + gx * scale + sx, y0 + gy * scale + sy, color);
        }
      }
      x += 6 * scale;
    }
  };
  const rect = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, color);
  };
  return { data, width, height, set, line, cross, text, rect };
}

function writeOverlay(file, image, { auto, manual, expertGlobe, expertOnsd, det }) {
  const c = makeCanvas(image);
  const CYAN = [34, 211, 238];
  const PINK = [244, 114, 182];
  const GOLD = [255, 215, 0];
  const GREEN = [34, 197, 94];
  const ORANGE = [251, 146, 60];
  const WHITE = [255, 255, 255];
  const drawMeasurement = (m, edgeColor) => {
    if (!m) return;
    c.line(m.globePt, pointAlongAxis(m.center, m.u, 90), CYAN);
    c.cross(m.globePt, PINK);
    c.line(pointAlongAxis(m.center, m.n, -m.halfWidthPx), pointAlongAxis(m.center, m.n, m.halfWidthPx), GOLD);
    if (m.leftOffset != null) {
      for (const off of [m.leftOffset, m.rightOffset]) {
        const e = pointAlongAxis(m.center, m.n, off);
        c.line(pointAlongAxis(e, m.u, -14), pointAlongAxis(e, m.u, 14), edgeColor, 3);
      }
    }
  };
  if (det?.debug?.circle) {
    const { x, y, r } = det.debug.circle;
    for (let a = 0; a < 360; a += 0.5) {
      if (Math.floor(a / 3) % 2) continue;
      c.set(x + r * Math.cos((a * Math.PI) / 180), y + r * Math.sin((a * Math.PI) / 180), CYAN);
    }
  }
  drawMeasurement(manual, ORANGE);
  drawMeasurement(auto, GREEN);
  if (expertGlobe) c.cross(expertGlobe, WHITE, 5);
  c.rect(0, 0, c.width, 22, [0, 0, 0]);
  const label = `AUTO ${auto?.onsdMm != null ? auto.onsdMm.toFixed(2) : '-'} MM  MANUAL ${
    manual?.onsdMm != null ? manual.onsdMm.toFixed(2) : '-'
  } MM  EXPERT ${expertOnsd != null ? expertOnsd.toFixed(2) : '-'} MM`;
  c.text(label, 6, 4, WHITE, 2);
  const png = new PNG({ width: c.width, height: c.height });
  png.data = Buffer.from(c.data.buffer);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${file}_overlay.png`);
  writeFileSync(out, PNG.sync.write(png));
  return out;
}

// --- Main ----------------------------------------------------------------------------------

function measureAll(image, globePt, axisPt, mmPerPx) {
  const out = {};
  for (const v of EDGE_VARIANTS) {
    try {
      const m = measureOnAxis(image, { globePt, axisPt, mmPerPx, edge: v.edge });
      out[v.name] = m;
    } catch (err) {
      out[v.name] = { ok: false, reason: err.message };
    }
  }
  return out;
}

function main() {
  const manifestPath = pickManifest();
  let entries;
  try {
    entries = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`Could not read the manifest (${manifestPath}): ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(entries)) entries = [];

  const rows = [];
  const skipped = [];
  const overlays = [];
  for (const e of entries) {
    const file = join(imagesDir, e.file ?? '');
    if (!e.file || !existsSync(file)) {
      skipped.push(`${e.file ?? '(no file name)'}: image not found in validation/images/`);
      continue;
    }
    if (!(e.mmPerPx > 0)) {
      skipped.push(`${e.file}: missing a positive mmPerPx`);
      continue;
    }
    try {
      const image = loadImage(file, e.crop ?? null);
      if (e.size && (e.size[0] !== image.fullSize[0] || e.size[1] !== image.fullSize[1])) {
        skipped.push(`${e.file}: size is ${image.fullSize.join('×')} but the manifest says ${e.size.join('×')} — coordinates may not match`);
      }
      const mmPerPx = e.mmPerPx;
      const pre = preprocess(image, { mmPerPx });
      const expertGlobe = e.expertGlobePoint
        ? { x: e.expertGlobePoint.x - (e.crop?.[0] ?? 0), y: e.expertGlobePoint.y - (e.crop?.[1] ?? 0) }
        : null;

      // Auto mode.
      const det = autodetect(pre.despeckled, { mmPerPx, sector: pre.sector });
      const globeDistMm =
        det.globePoint && expertGlobe ? Math.hypot(det.globePoint.x - expertGlobe.x, det.globePoint.y - expertGlobe.y) * mmPerPx : null;
      const auto = det.globePoint ? measureAll(pre.cleaned, det.globePoint, det.axisPoint, mmPerPx) : {};

      // Manual mode: the expert globe point, axis straight down, globe point snapped like in the app.
      let manual = {};
      if (expertGlobe) {
        const axisPt = { x: expertGlobe.x, y: expertGlobe.y + 6 / mmPerPx };
        const { u, n } = axisFrame(expertGlobe, axisPt);
        const globePt = snapGlobePoint(pre.cleaned, expertGlobe, u, n, mmPerPx);
        manual = measureAll(pre.cleaned, globePt, axisPt, mmPerPx);
      }

      overlays.push(
        writeOverlay(e.file, image, {
          auto: auto[DEFAULT_VARIANT],
          manual: manual[DEFAULT_VARIANT],
          expertGlobe,
          expertOnsd: e.expertOnsdMm ?? null,
          det,
        })
      );
      rows.push({
        file: e.file,
        expert: e.expertOnsdMm ?? null,
        separate: Boolean(e.excludeFromMae),
        method: det.debug?.method ?? '—',
        level: det.level,
        conf: det.confidence,
        reason: [det.reason, ...(det.debug?.rejected ?? [])].filter(Boolean).join('; ') || null,
        globeDistMm,
        hasExpertGlobe: Boolean(expertGlobe),
        auto,
        manual,
        annotationPct: 100 * pre.annotationFraction,
      });
    } catch (err) {
      skipped.push(`${e.file}: ${err.message}`);
    }
  }

  const out = ['# AeroSANS validation report', '', `Manifest: \`${manifestPath}\` · Generated: ${new Date().toISOString()}`, ''];
  out.push(`Default edge method in the app: **${DEFAULT_VARIANT}** · measurement depth ${MEASURE_DEPTH_MM} mm`, '');

  if (rows.length === 0) {
    out.push('No real images found — put them in validation/images/ (see validation/README.md).', '');
  } else {
    const val = (m) => (m?.ok ? fmt(m.onsdMm) : m?.onsdMm != null ? `${fmt(m.onsdMm)}*` : '—');
    // Globe detection.
    out.push('## Globe detection (auto)', '');
    out.push('| File | Method | Confidence | Distance to expert globe point (mm) | Annotations removed (%) |', '|---|---|---|---|---|');
    for (const r of rows) {
      out.push(
        `| ${r.file} | ${r.method} | ${r.level} (${Math.round(r.conf * 100)}%)${r.reason ? ` — ${r.reason}` : ''} | ${fmt(r.globeDistMm)} | ${fmt(r.annotationPct, 1)} |`
      );
    }
    const withGlobe = rows.filter((r) => r.hasExpertGlobe);
    const found = withGlobe.filter((r) => r.globeDistMm != null && r.globeDistMm <= GLOBE_OK_MM).length;
    out.push('', `Globe point within ${GLOBE_OK_MM} mm of the expert point: **${found} / ${withGlobe.length}**`, '');

    // ONSD per mode and edge method.
    for (const mode of ['auto', 'manual']) {
      out.push(`## ONSD — ${mode} mode (mm; * = low edge confidence)`, '');
      out.push(`| File | Expert | ${EDGE_VARIANTS.map((v) => v.name).join(' | ')} |`, `|---|---|${EDGE_VARIANTS.map(() => '---').join('|')}|`);
      for (const r of rows) {
        out.push(`| ${r.file}${r.separate ? ' (separate)' : ''} | ${fmt(r.expert)} | ${EDGE_VARIANTS.map((v) => val(r[mode][v.name])).join(' | ')} |`);
      }
      const maeRow = EDGE_VARIANTS.map((v) => {
        const errs = rows
          .filter((r) => r.expert != null && !r.separate && r[mode][v.name]?.onsdMm != null)
          .map((r) => Math.abs(r[mode][v.name].onsdMm - r.expert));
        return errs.length ? `${fmt(mean(errs))} (n=${errs.length})` : '—';
      });
      out.push(`| **MAE vs expert** (excluding "separate") | | ${maeRow.join(' | ')} |`, '');
    }
    out.push('Overlays:', ...overlays.map((o) => `- ${o}`), '');
  }

  out.push('## Synthetic phantoms (each edge method)', '', sweepTable(phantomSweep()), '');
  if (skipped.length) out.push('Skipped / warnings:', ...skipped.map((s) => `- ${s}`), '');

  const md = out.join('\n');
  console.log(md);
  writeFileSync(reportPath, md);
  console.log(`\nReport written to validation/report.md (not committed).`);
}

main();
