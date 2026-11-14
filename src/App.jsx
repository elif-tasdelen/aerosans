import { useMemo, useState } from 'react';
import { buildCrewMission, CREW, DEFAULT_CREW_ID } from './lib/crew.js';
import Disclaimer from './components/Disclaimer.jsx';
import MeasureScreen from './components/MeasureScreen.jsx';
import Eye3D from './components/Eye3D.jsx';
import TrendChart from './components/TrendChart.jsx';
import WhyEyeCard from './components/WhyEyeCard.jsx';
import { REFERENCES, SCIENCE_NOTES } from './config.js';

export default function App() {
  // Latest measurement, shared with the 3D eye.
  const [result, setResult] = useState(null);
  // Selected (fictional) crew member; all mission data is simulated.
  const [crewId, setCrewId] = useState(DEFAULT_CREW_ID);
  const { crew, series, co2 } = useMemo(() => buildCrewMission(crewId), [crewId]);

  return (
    <div className="app">
      <Disclaimer />
      <header className="app-header">
        <div>
          <h1>AeroSANS</h1>
          <p className="tagline">Eye-based early warning for spaceflight neuro-ocular risk.</p>
        </div>
        <div className="crew-select">
          <label htmlFor="crew-select" className="label">
            Crew roster · Simulated mission
          </label>
          <select id="crew-select" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            {CREW.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="intro card">
        <p>{SCIENCE_NOTES.sans}</p>
        <p className="muted">{SCIENCE_NOTES.riskSignal}</p>
      </section>

      <main>
        <MeasureScreen onResult={setResult} crew={crew} series={series} co2={co2} />
        {/* The eye is linked to a measurement only when it has a real scale (see eyeViewState). */}
        <Eye3D latest={result} />
        <TrendChart crew={crew} series={series} co2={co2} />
        <WhyEyeCard />
      </main>

      <footer className="app-footer small muted">
        <section className="footer-limitations">
          <h3>Limitations</h3>
          <p>{SCIENCE_NOTES.limitations}</p>
        </section>
        <section className="footer-references">
          <h3>References</h3>
          <ol>
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
        </section>
        <p>
          AeroSANS — NASA Space Apps Challenge 2026 research prototype. Not a medical device. Not for diagnosis.
          All crew data shown is simulated.
        </p>
      </footer>
    </div>
  );
}
