# AeroSANS

**NASA Space Apps Challenge 2026 — "Create Health Monitoring Software for Astronauts on Space Missions"**

> **Research prototype — not a medical device. Not for diagnosis.**

AeroSANS is a web-based health assistant that measures the **optic nerve sheath diameter (ONSD)** on an
ocular ultrasound image (or a synthetic phantom) and turns it into a colour-coded **SANS risk signal**
with an estimated intracranial pressure (ICP) range and clear next actions.

Spaceflight Associated Neuro-ocular Syndrome (SANS) includes optic disc edema, globe flattening and
choroidal folds seen in long-duration astronauts. Its mechanism is not fully understood. AeroSANS tracks
ONSD **trends as a risk signal, not a diagnosis**.

## Team

**Team nurgelf** — NASA Space Apps Challenge 2026, challenge: *"Create Health Monitoring Software for
Astronauts on Space Missions"*

- Computer Engineering (CS) member — software, measurement pipeline and UI
- Biomedical Engineering (BIO) member — scientific content, thresholds and simulated data

## Features (Phase A)

- Upload an ultrasound image or generate a deterministic **synthetic phantom** (ONSD 4.0–7.0 mm).
- Scale calibration from two clicks on the scale bar (phantoms calibrate automatically).
- Semi-automatic ONSD measurement 3 mm behind the globe, perpendicular to the nerve, with a
  **manual fallback** when edge detection is not confident.
- Result card: ONSD, colour-coded risk badge, ICP range (mmH₂O and mmHg), Wang 2017 limitation note,
  "What to do now" action and "How to scan" instructions. Phantoms show ground truth vs measured error.

## How to run

```bash
npm install
npm run dev      # development server
npm test         # Vitest unit tests
npm run build    # production build in dist/
```

## Live demo

_To be added after the first deploy (Phase D)._

## AI Usage Declaration

Portions of the source code were generated with AI assistance (Claude Code, Anthropic) and reviewed by
the team. Every source file carries a header stating this. JSON files (e.g. `package.json`) cannot hold
comments and are covered by this declaration. Scientific thresholds and texts are provided and reviewed
by the team's biomedical engineering member. No AI-generated images are used.

## Data & Assets

- **Synthetic phantom images** are generated at runtime by `src/lib/phantom.js` and carry a visible
  "SYNTHETIC PHANTOM" watermark. They are not patient images.
- **Favicon** (`public/favicon.svg`) is a generic eye icon generated in code with AI assistance.
- **NASA OSDR OSD-397** (Rodent Research-1 mouse retina, RNA-seq and RRBS) — open data used for the
  "Why the eye?" card: https://osdr.nasa.gov/bio/repo/data/studies/OSD-397
- **NASA HRP — 5 Hazards of Human Spaceflight** and **Risks of Human Spaceflight** — public resources
  used for background and framing: https://www.nasa.gov/hrp/hazards/ · https://www.nasa.gov/hrp/risks/
- All crew data shown in the app is **simulated** and labelled as such. Crew names are fictional.
- No NASA logos, insignia or mission patches are used.

## References

- Wang L-J, et al. "Noninvasive and quantitative intracranial pressure estimation using
  ultrasonographic measurement of optic nerve sheath diameter." *Scientific Reports* 2017;7:42063.
  doi:10.1038/srep42063
- NASA OSDR OSD-397 — RNA-seq and RRBS on spaceflight mouse retina (Rodent Research-1):
  https://osdr.nasa.gov/bio/repo/data/studies/OSD-397
- NASA HRP — 5 Hazards of Human Spaceflight: https://www.nasa.gov/hrp/hazards/
- NASA HRP — Risks of Human Spaceflight: https://www.nasa.gov/hrp/risks/

### Libraries

| Library | Version | License |
|---|---|---|
| React / React DOM | 18.3.1 | MIT |
| Vite | 5.4.11 | MIT |
| @vitejs/plugin-react | 4.3.4 | MIT |
| Vitest | 2.1.8 | MIT |

## License

[MIT](LICENSE)
