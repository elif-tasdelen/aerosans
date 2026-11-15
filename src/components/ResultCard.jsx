import {
  ACTIONS,
  HOW_TO_SCAN,
  MESSAGES,
  METHOD_LABELS,
  ONSD_BORDERLINE_MM,
  ONSD_HIGH_MM,
  RISK_LABELS,
  RISK_SUMMARIES,
  SCIENCE_NOTES,
} from '../config.js';

const fmt = (v, digits = 0) => v.toFixed(digits);
const CONFIDENCE_TEXT = { high: 'High', medium: 'Medium', low: 'Low' };

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
 * Result panel. `result` comes from buildResultState (src/lib/result.js).
 * Risk badge, ICP range and "What to do now" appear only when result.showClinical is true
 * (a real scale and no calibration warning).
 */
export default function ResultCard({ result, onRecalibrate, onConfirmScale, co2 = null, onGenerateReport, reportBusy = false }) {
  if (!result) {
    return (
      <section className="card result-card">
        <h2>Result</h2>
        <p className="muted">
          No measurement yet. Follow the steps on the left to measure the optic nerve sheath
          diameter (ONSD).
        </p>
        <p className="muted small">{SCIENCE_NOTES.riskSignal}</p>
        <button className="btn btn-primary report-btn" disabled title="Available after a measurement">
          Generate report (PDF)
        </button>
        <HowToScan open />
      </section>
    );
  }

  const { onsdMm, widthPx, method, level, confidence, calibrationLabel, calibrationWarning, showClinical, risk, icp, groundTruthMm } =
    result;
  const hasTruth = typeof groundTruthMm === 'number' && onsdMm != null;

  return (
    <section className={`card result-card ${showClinical ? `risk-${risk}` : 'risk-none'}`}>
      <h2>Result</h2>

      <div className="result-main">
        <div>
          <div className="label">ONSD</div>
          <div className="onsd-value">
            {onsdMm != null ? (
              <>
                {fmt(onsdMm, 2)} <span className="unit">mm</span>
              </>
            ) : (
              <>
                {fmt(widthPx, 1)} <span className="unit">px</span>
              </>
            )}
          </div>
        </div>
        {showClinical ? (
          <div className={`risk-badge risk-badge-${risk}`} aria-label={`Risk signal: ${RISK_LABELS[risk]}`}>
            {RISK_LABELS[risk]}
          </div>
        ) : (
          <div className="risk-badge risk-badge-none">No risk signal</div>
        )}
      </div>

      <dl className="result-meta">
        <div>
          <dt>Method</dt>
          <dd>{METHOD_LABELS[method] ?? method}</dd>
        </div>
        <div>
          <dt>Detection confidence</dt>
          <dd>
            {level && method !== 'manual'
              ? `${CONFIDENCE_TEXT[level]} (${Math.round(confidence * 100)}%)`
              : '— (manual edges)'}
          </dd>
        </div>
        <div>
          <dt>Calibration</dt>
          <dd>{calibrationLabel}</dd>
        </div>
      </dl>

      {!showClinical && (
        <div className="warning-box" role="status">
          <p>{calibrationWarning ?? MESSAGES.noScale}</p>
          {calibrationWarning && (
            <div className="row">
              <button className="btn btn-primary" onClick={onRecalibrate}>
                Recalibrate
              </button>
              <button className="btn btn-ghost" onClick={onConfirmScale}>
                The scale is independent — continue
              </button>
            </div>
          )}
        </div>
      )}

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

      {showClinical && (
        <>
          <p>{RISK_SUMMARIES[risk]}</p>
          <div className="thresholds small muted">
            Thresholds: normal &lt; {ONSD_BORDERLINE_MM.toFixed(1)} mm · borderline{' '}
            {ONSD_BORDERLINE_MM.toFixed(1)}–{ONSD_HIGH_MM.toFixed(1)} mm · high ≥ {ONSD_HIGH_MM.toFixed(1)} mm
          </div>
          <p className="thresholds-note small muted">{SCIENCE_NOTES.thresholds}</p>

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
        </>
      )}

      {co2 && (
        <p className="co2-line small">
          Cabin CO₂ at scan time (simulated): <strong>{co2.value.toFixed(1)} mmHg</strong> — {co2.status.label}
        </p>
      )}

      <button className="btn btn-primary report-btn" onClick={onGenerateReport} disabled={reportBusy}>
        Generate report (PDF)
      </button>

      <p className="small muted">{SCIENCE_NOTES.riskSignal}</p>
      <HowToScan />
    </section>
  );
}
