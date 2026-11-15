import { useEffect, useMemo, useState } from 'react';
import { buildCrewMission, CREW, DEFAULT_CREW_ID } from './lib/crew.js';
import { addTimelinePoint, resetTimeline, seriesWithAdded, timelineToast } from './lib/crewScan.js';
import Disclaimer from './components/Disclaimer.jsx';
import MeasureScreen from './components/MeasureScreen.jsx';
import Eye3D from './components/Eye3D.jsx';
import TrendChart from './components/TrendChart.jsx';
import WhyEyeCard from './components/WhyEyeCard.jsx';
import { BrandMark } from './components/Brand.jsx';
import {
  CO2,
  HOW_TO_SCAN,
  MEASURE_DEPTH_MM,
  ONSD_BORDERLINE_MM,
  ONSD_HIGH_MM,
  REFERENCES,
  SCIENCE_NOTES,
} from './config.js';

const NO_POINTS = [];

const TABS = [
  { id: 'trend', label: 'Mission trend' },
  { id: 'science', label: 'Science & data' },
];

const HOW_IT_WORKS = [
  'Load a scan: upload an eye ultrasound image or use the demo phantom.',
  `Measure the optic nerve sheath ${MEASURE_DEPTH_MM} mm behind the globe (Auto-Measure or manually).`,
  `Compare the sheath diameter with the ${ONSD_BORDERLINE_MM.toFixed(1)} / ${ONSD_HIGH_MM.toFixed(1)} mm thresholds to get a risk signal.`,
  'Track it over the mission: the trend matters more than any single value.',
];

function HowItWorks({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="how-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="how-title">How it works</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close" autoFocus>
            ×
          </button>
        </div>
        <ol className="how-steps">
          {HOW_IT_WORKS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="small muted">{SCIENCE_NOTES.riskSignal}</p>
        <details>
          <summary>How to scan (for the crew member holding the probe)</summary>
          <ol className="small">
            {HOW_TO_SCAN.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}

export default function App() {
  // Latest measurement, shared with the 3D eye.
  const [result, setResult] = useState(null);
  // Selected (fictional) crew member; all mission data is simulated.
  const [crewId, setCrewId] = useState(DEFAULT_CREW_ID);
  const { crew, series, co2 } = useMemo(() => buildCrewMission(crewId), [crewId]);
  const [tab, setTab] = useState('trend');
  const [helpOpen, setHelpOpen] = useState(false);
  // Points measured in the app and added to a crew member's timeline (kept for this session).
  const [added, setAdded] = useState({});
  const [toast, setToast] = useState('');
  const crewAdded = added[crewId] ?? NO_POINTS;
  const fullSeries = useMemo(() => seriesWithAdded(series, crewAdded), [series, crewAdded]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const addToTimeline = (onsdMm) => {
    const res = addTimelinePoint(added, crewId, series, onsdMm);
    setAdded(res.added);
    setTab('trend');
    setToast(timelineToast(res.point, crew.name));
    setTimeout(() => document.getElementById('tab-trend')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>AeroSANS</h1>
            <p className="tagline">Optic nerve ultrasound → SANS risk signal for astronauts</p>
          </div>
        </div>
        <div className="header-tools">
          <div className="crew-select">
            <label htmlFor="crew-select" className="label">
              Crew · Simulated mission
            </label>
            <select id="crew-select" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
              {CREW.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button className="help-btn" onClick={() => setHelpOpen(true)} aria-label="How it works" title="How it works">
            ?
          </button>
        </div>
      </header>

      <main>
        {/* The eye is linked to a measurement only when it has a real scale (see eyeViewState). */}
        <MeasureScreen
          onResult={setResult}
          crew={crew}
          series={fullSeries}
          co2={co2}
          side={<Eye3D latest={result} />}
          onAddToTimeline={addToTimeline}
          onSwitchCrew={setCrewId}
        />

        <div className="tabs" role="tablist" aria-label="More information">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* The trend stays mounted while hidden, so the PDF report can always include the chart. */}
        <div
          role="tabpanel"
          id="panel-trend"
          aria-labelledby="tab-trend"
          className={`tab-panel ${tab === 'trend' ? '' : 'tab-panel-hidden'}`}
          aria-hidden={tab !== 'trend'}
        >
          <p className="tab-intro">
            Simulated mission data. Dashed lines: 2.3 mmHg (symptoms possible) and 4.0 mmHg (ISS operational limit).
          </p>
          <TrendChart
            crew={crew}
            series={series}
            co2={co2}
            added={crewAdded}
            onResetAdded={() => setAdded((a) => resetTimeline(a, crewId))}
          />
        </div>

        {tab === 'science' && (
          <div role="tabpanel" id="panel-science" aria-labelledby="tab-science" className="tab-panel">
            <WhyEyeCard />
            <section className="card science-card">
              <details open>
                <summary>What is SANS, and what does AeroSANS measure?</summary>
                <p>{SCIENCE_NOTES.sans}</p>
                <p>{SCIENCE_NOTES.riskSignal}</p>
              </details>
              <details>
                <summary>Where do the thresholds and the ICP estimate come from?</summary>
                <p>{SCIENCE_NOTES.thresholds}</p>
                <p>{SCIENCE_NOTES.wang}</p>
                <p>{SCIENCE_NOTES.measurementError}</p>
              </details>
              <details>
                <summary>Why is cabin CO₂ shown next to the trend?</summary>
                <p>{CO2.context}</p>
                <ul>
                  {CO2.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
              <details open>
                <summary>Limitations</summary>
                <p>{SCIENCE_NOTES.limitations}</p>
              </details>
              <details open>
                <summary>References</summary>
                <ol className="small">
                  {REFERENCES.map((r) => (
                    <li key={r.text}>
                      {r.text}{' '}
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.url}
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          </div>
        )}
      </main>

      <footer className="app-footer small muted">
        <p>
          AeroSANS — NASA Space Apps Challenge 2026 research prototype. All crew data shown is simulated. Limitations
          and references are in the “Science &amp; data” tab.
        </p>
        <p>
          <strong>AI was used in this project:</strong> code written with AI assistance (Claude Code, Anthropic);
          logo and 3D eye texture AI-generated (Google Gemini); sample scans generated by AI-assisted code. See README →
          AI Usage Declaration.
        </p>
      </footer>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <Disclaimer />
      {helpOpen && <HowItWorks onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
