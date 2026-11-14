// Local validation harness: runs auto-detection + ONSD measurement on real images listed in a
// manifest and compares the result with an expert measurement. Images are NEVER committed.
//
// Usage:  npm run validate                 (uses validation/manifest.json, else the example)
//         node validation/run.mjs my.json  (custom manifest)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { autodetect } from '../src/lib/autodetect.js';
import { measureOnAxis } from '../src/lib/measure.js';

const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(here, 'images');
const reportPath = join(here, 'report.md');

function pickManifest() {
  const arg = process.argv[2];
  if (arg) return resolve(arg);
  const local = join(here, 'manifest.json');
  if (existsSync(local)) return local;
  console.log('No validation/manifest.json found — using validation/manifest.example.json.');
  return join(here, 'manifest.example.json');
}

/** Decode PNG or JPEG into a greyscale { pixels, width, height }. */
function loadGrey(file) {
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
  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  return { pixels, width, height };
}

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));

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
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log('The manifest is empty — no images found. See validation/README.md.');
    return;
  }

  const rows = [];
  const skipped = [];
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
      const image = loadGrey(file);
      const det = autodetect(image, { mmPerPx: e.mmPerPx });
      let measured = null;
      let edgeLevel = null;
      if (det.globePoint) {
        const m = measureOnAxis(image, { globePt: det.globePoint, axisPt: det.axisPoint, mmPerPx: e.mmPerPx });
        edgeLevel = m.level;
        measured = m.ok ? m.onsdMm : null;
      }
      const diff = measured != null && e.expertOnsdMm != null ? measured - e.expertOnsdMm : null;
      rows.push({ file: e.file, detLevel: det.level, detConf: det.confidence, measured, expert: e.expertOnsdMm, diff, edgeLevel });
    } catch (err) {
      skipped.push(`${e.file}: ${err.message}`);
    }
  }

  if (rows.length === 0) {
    console.log('No images found — nothing to validate. Put images in validation/images/ (see validation/README.md).');
    skipped.forEach((s) => console.log(`  skipped: ${s}`));
    return;
  }

  const header = '| File | Auto-detect confidence | Measured (mm) | Expert (mm) | Difference (mm) | Edge confidence |';
  const sep = '|---|---|---|---|---|---|';
  const lines = rows.map(
    (r) =>
      `| ${r.file} | ${r.detLevel} (${Math.round(r.detConf * 100)}%) | ${fmt(r.measured)} | ${fmt(r.expert)} | ${
        r.diff == null ? '—' : (r.diff >= 0 ? '+' : '') + r.diff.toFixed(2)
      } | ${r.edgeLevel ?? '—'} |`
  );
  const errors = rows.filter((r) => r.diff != null).map((r) => Math.abs(r.diff));
  const mae = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
  const maxErr = errors.length ? Math.max(...errors) : null;
  const lowCount = rows.filter((r) => r.detLevel === 'low' || r.edgeLevel === 'low' || r.measured == null).length;
  const summary = [
    `Images: ${rows.length} (with a measurement: ${errors.length})`,
    `Mean absolute error: ${fmt(mae)} mm`,
    `Max error: ${fmt(maxErr)} mm`,
    `Low-confidence cases (auto-detect or edges): ${lowCount}`,
  ];

  console.log([header, sep, ...lines].join('\n'));
  console.log('');
  summary.forEach((s) => console.log(s));
  skipped.forEach((s) => console.log(`skipped: ${s}`));

  const md = [
    '# AeroSANS validation report',
    '',
    `Manifest: \`${manifestPath}\` · Generated: ${new Date().toISOString()}`,
    '',
    header,
    sep,
    ...lines,
    '',
    ...summary.map((s) => `- ${s}`),
    ...(skipped.length ? ['', 'Skipped:', ...skipped.map((s) => `- ${s}`)] : []),
    '',
  ].join('\n');
  writeFileSync(reportPath, md);
  console.log(`\nReport written to validation/report.md (not committed).`);
}

main();
