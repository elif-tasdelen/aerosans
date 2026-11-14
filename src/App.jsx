import { useState } from 'react';
import Disclaimer from './components/Disclaimer.jsx';
import MeasureScreen from './components/MeasureScreen.jsx';
import Eye3D from './components/Eye3D.jsx';
import { SCIENCE_NOTES } from './config.js';

export default function App() {
  // Latest measurement, shared with later modules (3D eye, trend chart).
  const [result, setResult] = useState(null);

  return (
    <div className="app">
      <Disclaimer />
      <header className="app-header">
        <div>
          <h1>AeroSANS</h1>
          <p className="tagline">Eye-based early warning for spaceflight neuro-ocular risk.</p>
        </div>
        <div className="crew-chip">Crew Member A · Simulated mission</div>
      </header>

      <section className="intro card">
        <p>{SCIENCE_NOTES.sans}</p>
        <p className="muted">{SCIENCE_NOTES.riskSignal}</p>
      </section>

      <main>
        <MeasureScreen onResult={setResult} />
        {/* The eye is linked to a measurement only when it has a real scale (see eyeViewState). */}
        <Eye3D latest={result} />
      </main>

      <footer className="app-footer small muted">
        AeroSANS — NASA Space Apps Challenge 2026 research prototype. Not a medical device. Not for
        diagnosis. All crew data shown is simulated.
      </footer>
    </div>
  );
}
