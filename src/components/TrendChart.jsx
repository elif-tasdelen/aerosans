import { useMemo } from 'react';
import { Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { co2Status, latestCo2, weeksAboveLimit } from '../lib/cabinCo2.js';
import { latestPoint, trendChartData } from '../lib/trend.js';
import { CO2, CO2_OPS_LIMIT_MMHG, RISK_LABELS } from '../config.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

// Same values as --muted and --border in styles.css.
const TEXT = '#9AA7BD';
const GRID = '#24365C';
const CO2_DATASET_INDEX = 3;

/**
 * Simulated mission trend of the selected crew member: ONSD colored by risk with threshold
 * lines, plus cabin CO2 on a second axis as context (no causal link is modeled).
 */
export default function TrendChart({ crew, series, co2, added = [], onResetAdded }) {
  const data = useMemo(() => trendChartData(series, co2, added), [series, co2, added]);
  const latest = latestPoint([...series, ...added]);
  const lastDay = latest ? Math.max(180, latest.day) : 180;
  const co2Latest = latestCo2(co2);
  const status = co2Latest ? co2Status(co2Latest.co2) : null;
  const weeksAbove = weeksAboveLimit(co2);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      locale: 'en-US', // English number format regardless of the browser language

      animation: false, // no tween on updates: adding a point or switching tabs must not stall the UI
      resizeDelay: 150,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: 1,
          max: lastDay,
          title: { display: true, text: 'Mission day', color: TEXT },
          ticks: { color: TEXT, stepSize: 30 },
          grid: { color: GRID },
        },
        y: {
          min: 3.8,
          max: 6.3,
          title: { display: true, text: 'ONSD (mm)', color: TEXT },
          ticks: { color: TEXT },
          grid: { color: GRID },
        },
        co2: {
          position: 'right',
          min: 1,
          max: 6,
          title: { display: true, text: 'Cabin CO₂ (mmHg, simulated)', color: TEXT },
          ticks: { color: TEXT },
          grid: { drawOnChartArea: false },
        },
      },
      plugins: {
        legend: { labels: { color: TEXT, usePointStyle: true, boxHeight: 6, font: { size: 11 } } },
        tooltip: {
          filter: (item) =>
            item.datasetIndex === 0 || item.datasetIndex === CO2_DATASET_INDEX || (item.dataset.measured && item.dataIndex > 0),
          callbacks: {
            title: (items) => `Day ${items[0].parsed.x}`,
            label: (item) => {
              if (item.datasetIndex === CO2_DATASET_INDEX) {
                const c = co2[item.dataIndex];
                return `Cabin CO₂ (simulated) ${c.co2.toFixed(1)} mmHg — ${co2Status(c.co2).label}`;
              }
              if (item.dataset.measured) {
                const m = added[item.dataIndex - 1];
                return `Measured in AeroSANS: ${m.onsd.toFixed(2)} mm — ${RISK_LABELS[m.risk]}`;
              }
              const p = series[item.dataIndex];
              return [
                `ONSD ${p.onsd.toFixed(2)} mm — ${RISK_LABELS[p.risk]}`,
                `Est. ICP ${Math.round(p.icp.mmH2O.low)}–${Math.round(p.icp.mmH2O.high)} mmH₂O`,
              ];
            },
          },
        },
      },
    }),
    [series, co2, added, lastDay]
  );

  return (
    <section className="card trend-card">
      <div className="trend-header">
        <div>
          <h2>Mission trend</h2>
          <p className="simulated-label">Simulated data — {crew.name}</p>
        </div>
        {latest && (
          <div className="trend-latest">
            <span className="label">
              Latest (day {latest.day}){latest.measured ? ' · measured in AeroSANS' : ''}
            </span>
            <span className={`risk-badge small-badge risk-badge-${latest.risk}`}>
              {latest.onsd.toFixed(2)} mm · {RISK_LABELS[latest.risk]}
            </span>
          </div>
        )}
      </div>
      <div
        className="trend-chart"
        role="img"
        aria-label="Line chart of simulated ONSD over 180 mission days with threshold lines at 5.0 and 5.7 mm, and simulated cabin CO2 on a second axis with reference lines at 2.3 and 4.0 mmHg"
      >
        <Line data={data} options={options} updateMode="none" />
      </div>
      <p className="small muted">
        Each point is a weekly scan; colors follow the risk signal. The trend over the mission matters more than any single value.
      </p>
      {added.length > 0 && (
        <p className="small added-note">
          {added.length} point{added.length > 1 ? 's' : ''} measured in AeroSANS added to this simulated baseline.{' '}
          <button className="link-btn" onClick={onResetAdded}>
            Reset added points
          </button>
        </p>
      )}

      {co2Latest && (
        <div className="cabin-box">
          <div className="cabin-head">
            <h3>Cabin environment</h3>
            <span className="simulated-label">Simulated data</span>
          </div>
          <div className="cabin-stats">
            <div>
              <div className="label">Latest CO₂ (day {co2Latest.day})</div>
              <div className="cabin-value">
                {co2Latest.co2.toFixed(1)} <span className="unit">mmHg</span>
                <span className={`co2-chip co2-chip-${status.id}`}>{status.label}</span>
              </div>
            </div>
            <div>
              <div className="label">Weeks above {CO2_OPS_LIMIT_MMHG.toFixed(1)} mmHg</div>
              <div className="cabin-value">{weeksAbove}</div>
            </div>
          </div>
          <p className="small muted">{CO2.context}</p>
        </div>
      )}
    </section>
  );
}
