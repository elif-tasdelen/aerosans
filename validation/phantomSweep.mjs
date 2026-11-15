// Phantom sweep: ONSD error of each edge method on synthetic phantoms (clean and realistic,
// tilted). Used together with validation/run.mjs to choose the default edge method.
//
// Usage: node validation/phantomSweep.mjs

import { generatePhantom } from '../src/lib/phantom.js';
import { measureOnAxis } from '../src/lib/measure.js';

export const EDGE_VARIANTS = [
  { name: 'fraction 0.50', edge: { method: 'fraction', fraction: 0.5 } },
  { name: 'fraction 0.65', edge: { method: 'fraction', fraction: 0.65 } },
  { name: 'fraction 0.75', edge: { method: 'fraction', fraction: 0.75 } },
  { name: 'gradient', edge: { method: 'gradient' } },
];

export function phantomSweep() {
  const rows = [];
  for (const variant of EDGE_VARIANTS) {
    for (const realism of ['clean', 'realistic']) {
      const errors = [];
      let failed = 0;
      for (const onsdMm of [4.0, 4.5, 5.2, 6.0, 7.0]) {
        for (const tiltDeg of [-20, 0, 20]) {
          for (const seed of [3, 42]) {
            const ph = generatePhantom({ onsdMm, tiltDeg, seed, realism });
            const m = measureOnAxis(ph, {
              globePt: ph.nerve.globePoint,
              axisPt: ph.nerve.axisPoint,
              mmPerPx: ph.mmPerPx,
              edge: variant.edge,
            });
            if (m.ok) errors.push(m.onsdMm - onsdMm);
            else failed++;
          }
        }
      }
      const abs = errors.map(Math.abs);
      rows.push({
        variant: variant.name,
        realism,
        n: errors.length,
        failed,
        mean: errors.reduce((a, b) => a + b, 0) / (errors.length || 1),
        mae: abs.reduce((a, b) => a + b, 0) / (abs.length || 1),
        max: abs.length ? Math.max(...abs) : NaN,
      });
    }
  }
  return rows;
}

export function sweepTable(rows) {
  const f = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
  return [
    '| Edge method | Phantom | Measured | Failed | Mean error (mm) | MAE (mm) | Max error (mm) |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.variant} | ${r.realism} | ${r.n} | ${r.failed} | ${r.mean >= 0 ? '+' : ''}${f(r.mean)} | ${f(r.mae)} | ${f(r.max)} |`),
  ].join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('phantomSweep.mjs')) {
  console.log(sweepTable(phantomSweep()));
}
