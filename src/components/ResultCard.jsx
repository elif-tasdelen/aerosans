import { classifyRisk, estimateIcp } from '../lib/measure.js';
import {
  ACTIONS,
  HOW_TO_SCAN,
  ONSD_BORDERLINE_MM,
  ONSD_HIGH_MM,
  RISK_LABELS,
  RISK_SUMMARIES,
  SCIENCE_NOTES,
} from '../config.js';

const fmt = (v, digits = 0) => v.toFixed(digits);

/** Signed error with 2 decimals; values that round to zero show as "0.00 mm" (no sign). */
function formatSignedMm(diff) {
  const abs = Math.abs(diff).toFixed(2);
  if (abs === '0.00') return '0.00 mm';
  return `${diff > 0 ? '+' : '−'}${abs} mm`;
}

function HowToScan({ open = false }) {
  return (
    <details className="how-to-scan" open={open}>
      <summary>How to scan</summary>
      <ol>
        {HOW_TO_SCAN.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

/**
 * Result panel: ONSD, colour-coded risk badge, ICP range, limitation notes,
 * "What to do now" action and scanning instructions.
 * Props: onsdMm (number | null), mode ('auto' | 'manual'), groundTruthMm (number, phantoms only).
 */
export default function ResultCard({ onsdMm, mode, groundTruthMm }) {
  if (onsdMm == null) {
    return (
      <section className="card result-card">
        <h2>Result</h2>
        <p className="muted">
          No measurement yet. Follow the steps on the left to measure the optic nerve sheath
          diameter (ONSD).
        </p>
        <p className="muted small">{SCIENCE_NOTES.riskSignal}</p>
        <HowToScan open />
      </section>
    );
  }

  const risk = classifyRisk(onsdMm);
  const icp = estimateIcp(onsdMm);
  const hasTruth = typeof groundTruthMm === 'number';

  return (
    <section className={`card result-card risk-${risk}`}>
      <h2>Result</h2>

      <div className="result-main">
        <div>
          <div className="label">ONSD ({mode === 'manual' ? 'manual edges' : 'automatic edges'})</div>
          <div className="onsd-value">
            {fmt(onsdMm, 2)} <span className="unit">mm</span>
          </div>
        </div>
        <div className={`risk-badge risk-badge-${risk}`} aria-label={`Risk signal: ${RISK_LABELS[risk]}`}>
          {RISK_LABELS[risk]}
        </div>
      </div>

      <p>{RISK_SUMMARIES[risk]}</p>

      <div className="thresholds small muted">
        Thresholds: normal &lt; {ONSD_BORDERLINE_MM.toFixed(1)} mm · borderline{' '}
        {ONSD_BORDERLINE_MM.toFixed(1)}–{ONSD_HIGH_MM.toFixed(1)} mm · high ≥ {ONSD_HIGH_MM.toFixed(1)} mm
      </div>
      <p className="thresholds-note small muted">{SCIENCE_NOTES.thresholds}</p>

      {hasTruth && (
        <div className="truth-box">
          <div>
            <div className="label">Ground truth</div>
            <div>{fmt(groundTruthMm, 2)} mm</div>
          </div>
          <div>
            <div className="label">Measured</div>
            <div>{fmt(onsdMm, 2)} mm</div>
          </div>
          <div>
            <div className="label">Error</div>
            <div>{formatSignedMm(onsdMm - groundTruthMm)}</div>
          </div>
        </div>
      )}

      <div className="icp-box">
        <div className="label">Estimated ICP range</div>
        <div className="icp-range">
          {fmt(icp.mmH2O.low)}–{fmt(icp.mmH2O.high)} mmH₂O
          <span className="muted"> ({fmt(icp.mmHg.low, 1)}–{fmt(icp.mmHg.high, 1)} mmHg)</span>
        </div>
        <p className="small muted">
          {SCIENCE_NOTES.wang} The range reflects ±{icp.errorMm.toFixed(1)} mm measurement error. It
          is an estimate, not an exact pressure value.
        </p>
      </div>

      <div className={`action-box action-${risk}`}>
        <div className="label">What to do now</div>
        <p className="action-text">{ACTIONS[risk]}</p>
      </div>

      <p className="small muted">{SCIENCE_NOTES.riskSignal}</p>
      <HowToScan />
    </section>
  );
}
