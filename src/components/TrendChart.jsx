import { useMemo } from 'react';
import { Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import mission from '../data/mission_onsd.json';
import { buildWeeklySeries } from '../lib/mission.js';
import { latestPoint, trendChartData } from '../lib/trend.js';
import { RISK_LABELS } from '../config.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

const TEXT = '#93a4c3';
const GRID = 'rgba(147, 164, 195, 0.15)';

/** 180-day simulated ONSD trend for Crew Member A, colored by risk, with threshold lines. */
export default function TrendChart() {
  const series = useMemo(() => buildWeeklySeries(mission.anchors, 1), []);
  const data = useMemo(() => trendChartData(series), [series]);
  const latest = latestPoint(series);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      locale: 'en-US', // English number format regardless of the browser language

      animation: { duration: 600 },
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: 1,
          max: 180,
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
      },
      plugins: {
        legend: { labels: { color: TEXT, usePointStyle: true, boxHeight: 6 } },
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => `Day ${items[0].parsed.x}`,
            label: (item) => {
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
    [series]
  );

  return (
    <section className="card trend-card">
      <div className="trend-header">
        <div>
          <h2>Mission trend</h2>
          <p className="simulated-label">Simulated data — {mission.crewMember}</p>
        </div>
        {latest && (
          <div className="trend-latest">
            <span className="label">Latest (day {latest.day})</span>
            <span className={`risk-badge small-badge risk-badge-${latest.risk}`}>
              {latest.onsd.toFixed(2)} mm · {RISK_LABELS[latest.risk]}
            </span>
          </div>
        )}
      </div>
      <div className="trend-chart" role="img" aria-label="Line chart of simulated ONSD over 180 mission days with threshold lines at 5.0 and 5.7 mm">
        <Line data={data} options={options} />
      </div>
      <p className="small muted">
        Each point is a weekly scan; colors follow the risk signal. The trend over the mission matters more than any single value.
      </p>
    </section>
  );
}
