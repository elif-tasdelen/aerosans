// Simulated crew roster. Pure logic: no React / DOM imports.
// All crew members are fictional and all values are simulated.

import mission from '../data/mission_onsd.json';
import { buildCo2Series } from './cabinCo2.js';
import { buildWeeklySeries } from './mission.js';

export const CREW = [
  // A: the mission data set provided by the biomedical team member (rises into the high range late).
  { id: 'A', name: 'Crew Member A', anchors: mission.anchors, onsdSeed: 1, co2Seed: 11 },
  // B: stays in the normal range for the whole mission.
  {
    id: 'B',
    name: 'Crew Member B',
    anchors: [
      { day: 1, onsd: 4.05 },
      { day: 30, onsd: 4.15 },
      { day: 60, onsd: 4.3 },
      { day: 90, onsd: 4.4 },
      { day: 120, onsd: 4.5 },
      { day: 150, onsd: 4.6 },
      { day: 180, onsd: 4.7 },
    ],
    onsdSeed: 2,
    co2Seed: 22,
  },
  // C: reaches the high range earlier, around day 120.
  {
    id: 'C',
    name: 'Crew Member C',
    anchors: [
      { day: 1, onsd: 4.3 },
      { day: 30, onsd: 4.7 },
      { day: 60, onsd: 5.1 },
      { day: 90, onsd: 5.45 },
      { day: 120, onsd: 5.75 },
      { day: 150, onsd: 5.95 },
      { day: 180, onsd: 6.1 },
    ],
    onsdSeed: 3,
    co2Seed: 33,
  },
];

export const DEFAULT_CREW_ID = 'A';

export function getCrew(id) {
  return CREW.find((c) => c.id === id) ?? CREW[0];
}

/** Simulated mission of one crew member: weekly ONSD series and CO2 values on the same days. */
export function buildCrewMission(id) {
  const crew = getCrew(id);
  const series = buildWeeklySeries(crew.anchors, crew.onsdSeed);
  const co2 = buildCo2Series(
    series.map((p) => p.day),
    crew.co2Seed
  );
  return { crew, series, co2 };
}
