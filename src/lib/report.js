// Content of the PDF report. Pure logic: no React / DOM / jsPDF imports.
// buildReportModel turns the app state into plain sections; the renderer only lays them out.

import {
  ACTIONS,
  CO2,
  CO2_OPS_LIMIT_MMHG,
  DISCLAIMER_TEXT,
  MEASURE_DEPTH_MM,
  MMH2O_PER_MMHG,
  ONSD_BORDERLINE_MM,
  ONSD_HIGH_MM,
  REFERENCES,
  REPORT,
  RISK_LABELS,
  RISK_SUMMARIES,
  SCIENCE_NOTES,
  WANG_INTERCEPT,
  WANG_SLOPE,
} from '../config.js';
import { co2Status, latestCo2, weeksAboveLimit } from './cabinCo2.js';
import { weeklyRiskCounts } from './mission.js';

const pad = (n) => String(n).padStart(2, '0');
const CONFIDENCE_TEXT = { high: 'High', medium: 'Medium', low: 'Low' };

/** Local date as YYYY-MM-DD. */
export function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** File name: AeroSANS_report_<CrewName>_<YYYY-MM-DD>.pdf (spaces become underscores). */
export function reportFilename(crewName, date) {
  const name = String(crewName).trim().replace(/[^A-Za-z0-9]+/g, '_');
  return `AeroSANS_report_${name}_${formatDate(date)}.pdf`;
}

/** Replace characters the built-in PDF fonts cannot draw (subscripts, ≥, ≤, minus sign, arrows). */
export function pdfSafe(text) {
  return String(text)
    .replace(/₂/g, '2')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/…/g, '...');
}

function describeSource(source) {
  if (source?.kind === 'phantom') {
    return `Synthetic phantom (seed ${source.seed}, ${source.realism}, tilt ${source.tiltDeg}°) — simulated, not a patient image`;
  }
  if (source?.simulated) {
    return `Simulated crew scan (code-generated, ground-truth ONSD ${source.groundTruthOnsdMm.toFixed(1)} mm) — not a real patient image`;
  }
  return 'Uploaded ultrasound image';
}

/**
 * @param {object} state
 * @param {object} state.result      from buildResultState
 * @param {object} state.source      loaded image ({ kind, seed, realism, tiltDeg })
 * @param {string} state.crewName    fictional crew member name
 * @param {Array}  state.series      simulated ONSD series (buildWeeklySeries)
 * @param {Array}  state.co2         simulated CO2 series (buildCo2Series)
 * @param {string} state.version     app version
 * @param {Date}   state.now
 * @returns {null | { filename, title, meta: string[], disclaimer, scaled: boolean, sections: object[], footer }}
 */
export function buildReportModel({ result, source = null, crewName, series = [], co2 = [], version = '', now = new Date() }) {
  if (!result) return null;
  const scaled = result.onsdMm != null;
  const clinical = Boolean(result.showClinical && result.risk && result.icp);
  const sections = [];

  // 2. Measurement
  const measurement = [
    `Image source: ${describeSource(source)}`,
    `Calibration mode: ${result.calibrationLabel ?? result.calibrationMode}`,
    `Method: ${result.method}`,
    `Detection confidence: ${
      result.level && result.method !== 'manual'
        ? `${CONFIDENCE_TEXT[result.level]} (${Math.round(result.confidence * 100)}%)`
        : 'not applicable (manual edges)'
    }`,
    scaled ? `ONSD: ${result.onsdMm.toFixed(2)} mm` : `ONSD: ${result.widthPx.toFixed(1)} px`,
    scaled
      ? `Measurement depth: ${MEASURE_DEPTH_MM} mm behind the globe, perpendicular to the nerve axis. Edges: inner border of the bright dura on each side.`
      : 'Measurement depth: clicked by the user (no scale). Edges: inner border of the bright dura on each side.',
  ];
  if (typeof result.groundTruthMm === 'number' && scaled) {
    const err = result.onsdMm - result.groundTruthMm;
    measurement.push(
      `Phantom ground truth: ${result.groundTruthMm.toFixed(2)} mm (error ${err >= 0 ? '+' : '-'}${Math.abs(err).toFixed(2)} mm)`
    );
  }
  if (!scaled) measurement.push(REPORT.noScale);
  else if (!clinical && result.calibrationWarning) {
    measurement.push(`Calibration warning: ${result.calibrationWarning} Risk and ICP not computed.`);
  }
  sections.push({ id: 'measurement', heading: 'Measurement', lines: measurement });

  if (clinical) {
    // 3. Risk
    sections.push({
      id: 'risk',
      heading: 'Risk signal',
      lines: [
        `Level: ${RISK_LABELS[result.risk].toUpperCase()} — ${RISK_SUMMARIES[result.risk]}`,
        `Thresholds: borderline from ${ONSD_BORDERLINE_MM.toFixed(1)} mm (Maissan et al., 2015); high from ${ONSD_HIGH_MM.toFixed(1)} mm (Soldatos et al., 2008).`,
        SCIENCE_NOTES.thresholds,
        SCIENCE_NOTES.riskSignal,
      ],
    });
    // 4. ICP
    const { mmH2O, mmHg, errorMm } = result.icp;
    sections.push({
      id: 'icp',
      heading: 'Estimated ICP range',
      lines: [
        `${mmH2O.low.toFixed(0)}–${mmH2O.high.toFixed(0)} mmH₂O (${mmHg.low.toFixed(1)}–${mmHg.high.toFixed(1)} mmHg)`,
        `Formula (Wang et al., 2017): ICP [mmH₂O] = ${WANG_INTERCEPT} + ${WANG_SLOPE} × ONSD [mm]; mmHg = mmH₂O / ${MMH2O_PER_MMHG}.`,
        `The range reflects an assumed measurement error of ±${errorMm.toFixed(1)} mm. The formula comes from 316 neurology patients on Earth and is not validated in microgravity. It is an estimate, not an exact pressure value.`,
      ],
    });
    // 5. Action
    sections.push({ id: 'action', heading: 'What to do now', lines: [ACTIONS[result.risk]] });
  }

  // 6. Mission trend
  if (series.length) {
    const last = series[series.length - 1];
    const weeks = weeklyRiskCounts(series);
    sections.push({
      id: 'trend',
      heading: 'Mission trend',
      image: 'trend',
      lines: [
        `Simulated data — ${crewName} (fictional). ${series.length} scans over ${last.day} mission days.`,
        `Latest value (day ${last.day}): ${last.onsd.toFixed(2)} mm — ${RISK_LABELS[last.risk]}`,
        `Weeks in each risk level: Normal ${weeks.normal}, Borderline ${weeks.borderline}, High ${weeks.high}`,
      ],
    });
  }

  // 7. Cabin environment
  const latest = latestCo2(co2);
  if (latest) {
    const status = co2Status(latest.co2);
    sections.push({
      id: 'cabin',
      heading: 'Cabin environment (simulated)',
      lines: [
        `Cabin CO₂ at scan time (simulated): ${latest.co2.toFixed(1)} mmHg — ${status.label}`,
        `Latest CO₂ (day ${latest.day}, simulated): ${latest.co2.toFixed(1)} mmHg`,
        `Weeks above ${CO2_OPS_LIMIT_MMHG.toFixed(1)} mmHg in the mission: ${weeksAboveLimit(co2)}`,
        CO2.context,
      ],
      smallLines: CO2.sources.map((s) => `Source: ${s.text}${s.url ? ` ${s.url}` : ''}`),
    });
  }

  // 8. Measurement image
  sections.push({
    id: 'image',
    heading: 'Measurement image',
    image: 'measurement',
    lines: ['Annotated measurement canvas: nerve axis, measurement line and detected sheath edges.'],
  });

  // 9. Limitations and references
  sections.push({ id: 'limitations', heading: 'Limitations', lines: [SCIENCE_NOTES.limitations] });
  sections.push({
    id: 'references',
    heading: 'References',
    lines: [],
    smallLines: REFERENCES.map((r, i) => `${i + 1}. ${r.text}${r.url ? ` ${r.url}` : ''}`),
  });

  return {
    filename: reportFilename(crewName, now),
    title: REPORT.title,
    meta: [
      `Generated: ${formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      `Crew member: ${crewName} (fictional)`,
      `App version: ${version}`,
    ],
    disclaimer: DISCLAIMER_TEXT,
    scaled,
    sections,
    footer: REPORT.footer,
  };
}
