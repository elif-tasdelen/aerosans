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

## Features

- **Three-step flow:** ① Load scan → ② Measure → ③ Result, shown as a stepper with one primary action
  per step ("Upload today's scan for Crew Member X", "Auto-Measure", "Generate report (PDF)"). Finished steps can be opened
  again without losing the measurement. The 3D eye and a result summary stay next to the active step.
- **Crew scan → timeline:** "Upload today's scan for Crew Member X" opens the file picker. A file that
  is one of the simulated crew sample scans (recognised by its file name) is labelled "Simulated scan"
  and calibrated automatically (0.04 mm/px, image depth 40 mm); if it belongs to another crew member
  the app asks whether to switch crew or continue. Any other image goes through the normal calibration
  choice. "No scan file? Use Crew Member X's sample scan" loads the sample directly.
  After measuring, "Add to Crew Member X timeline" adds the value to that crew member's mission trend,
  7 days after the last point, as a larger filled marker in the risk color ("Measured in AeroSANS"
  next to the "Simulated baseline"). The app switches to the Mission trend tab and confirms with a short
  message; "Reset added points" removes them. The PDF report includes the added points. Changing the
  crew member returns to step ① with that crew member's scan on offer.
- Alternatively upload an ultrasound image or use the deterministic **synthetic demo phantom**
  (ONSD 4.0–7.0 mm).
- **Three calibration modes:**
  - *Scale bar* — click both ends of a ruler or scale bar and enter its length. Segments shorter than
    30 px are rejected, and a warning appears if the calibration segment sits on the measured sheath itself.
  - *Image depth* — enter the depth shown on the scanner (cm) and click the top and bottom of the image field.
  - *No scale* — the width is shown in pixels only; no mm value, risk signal, ICP or 3D-eye update.
  - Phantoms calibrate automatically from their scale bar.
- **Nerve-axis support:** two clicks (posterior globe boundary, then a point further down the nerve)
  define the axis, so tilted nerves are measured perpendicular to their own direction. The globe click
  snaps to the nearby vitreous–retina boundary.
- **Robust edge detection:** a profile across the nerve 3 mm behind the globe, averaged over a ±1 mm
  strip with bilinear sampling and Gaussian smoothing. Each edge lies between the dark band and the
  bright dura on that side, at 65 % of the way from the band minimum to the wall peak.
- **Detection confidence** (high / medium / low) from contrast, symmetry and a plausible width. Low
  confidence switches to manual mode automatically.
- **Draggable edges:** fine-tune either edge along the measurement line; the result is labelled
  "Auto-Measure", "Auto-Measure (adjusted)" or "Manual".
- **Realistic phantom option:** nerve tilt (−30° to +30°) and a "realistic" mode with grainier speckle,
  blooming sheath walls, lower contrast, bright retrobulbar fat and an optic disc bump.
- **Auto-Measure (one click):** on a calibrated image, a short scan animation runs and the app finds
  the globe, the nerve axis and the sheath edges in one step (classical image processing: annotation
  clean-up, scan-area mask, circle fit, line fit and an edge profile). The animation is skipped with
  `prefers-reduced-motion`.
- **Proposal mode on real images:** when detection is uncertain, no result is shown. The detected globe
  point and nerve axis are drawn as a proposal with "Confirm" and "Measure manually". Uploaded images
  carry the note "Real ultrasound: please verify the edges before using the result."
- **Local validation harness** (`npm run validate`, see `validation/README.md`) to compare automatic
  measurements with expert measurements on openly licensed images that are kept out of the repository.
- Result step: ONSD, colour-coded risk badge, method, confidence, calibration mode, ICP range (mmH₂O and
  mmHg) with the Wang 2017 limitation, and a short "What to do now" list. Risk, ICP and actions appear
  only with a real scale. Phantoms show ground truth vs measured error. Small (i) buttons explain
  ONSD, ICP, SANS and the thresholds.
- 3D eye (Three.js, procedural geometry, no external models): a solid, opaque globe with an eye texture
  (AI-generated, edited; labeled in the view) and a clear cornea, and a layered optic nerve — nerve
  tissue, a thin fluid layer and the dura sheath — in a gentle S shape with small vessels. Only the
  sheath widens with ONSD; it is tinted with the risk color (grey without a scale). A gold ring with a
  dark outline and an ONSD label mark the measurement position 3 mm behind the globe. Parts are
  clickable and explain their function and status.
- **Crew roster (simulated mission):** a dropdown in the header switches between the fictional
  Crew Member A, B and C. Each has its own deterministic simulated ONSD and cabin CO₂ series; the trend
  chart, the cabin environment box and the report follow the selection.
- **Two tabs below the flow:** "Mission trend" and "Science & data".
- **Mission trend chart** (Chart.js): 180 days of simulated ONSD for the selected crew member, points
  and segments colored by risk, dashed threshold lines at 5.0 and 5.7 mm.
- **Cabin CO₂ context (simulated, with NASA sources):** simulated cabin CO₂ on a second axis of the trend
  chart with reference lines at 2.3 mmHg (crew symptoms reported) and 4.0 mmHg (ISS operational 24-h
  limit), a "Cabin environment" box (latest value, status, weeks above 4.0 mmHg) and a context line in
  the result card. CO₂ is shown as context only; no causal link is modeled.
- **PDF report:** "Generate report (PDF)" in the result card downloads a 1–2 page A4 report (measurement,
  risk signal, ICP range, action, mission trend, cabin environment, annotated image, limitations and
  references). The file is created in the browser; nothing is sent anywhere.
- **"How it works" (?)** in the top bar: the four steps of the idea and the scanning instructions.
- **"Science & data" tab:** "Why the eye?" (SANS background, NASA OSDR OSD-397 mouse-retina genes and the
  volcano plot), threshold and ICP sources, cabin CO₂ notes, limitations and references.
- A thin disclaimer strip stays at the bottom of every page.

## How to run

```bash
npm install
npm run dev      # development server
npm test         # Vitest unit tests
npm run build    # production build in dist/
```

## Live demo

**https://elif-tasdelen.github.io/aerosans/** — deployed automatically to GitHub Pages on every push
to `main` (`.github/workflows/deploy.yml`: `npm ci`, `npm test`, `npm run build`).

## Limitations

A meta-analysis of 38 studies (Berhanu et al., 2023) shows that optimal ONSD cut-off values for detecting elevated ICP vary widely, from 4.1 mm to 7.2 mm. Because there is no single universal threshold, AeroSANS uses 5.0 mm and 5.7 mm as commonly used literature reference points, not as diagnostic triggers. The main value of AeroSANS is tracking the relative ONSD trend of each astronaut over a mission, not giving a single-point diagnosis. The ICP estimate (Wang et al., 2017) comes from Earth-based patients and has not been validated in microgravity.

Automatic edge detection was validated on synthetic phantoms (clean and realistic, tilted ±20°). On real ultrasound images, accuracy depends on image quality and on a correct scale; draggable edges and a manual mode are provided, and no mm value, risk or ICP is shown without a scale.

Auto-detection was tuned on synthetic phantoms. Real-image performance is evaluated with a local validation harness on openly licensed images with expert measurements; results are reported only for those images.

On real ultrasound images, automatic edges may sit inside expert caliper positions on blurred sheath borders, and auto-detection (beta) may fail; draggable edges and manual picking are provided.

Auto-Measure was developed and validated on synthetic phantoms (clean and realistic, tilted ±20°: error at most 0.16 mm with the default edge method). On a small set of 6 public real ultrasound images it placed the posterior globe point within 1.5 mm of the reference point in 3 of 6 images and within 2 mm in 5 of 6. On the 3 images with expert calipers it measured ONSD with a mean absolute error of 0.60 mm (0.71 mm when the globe point was given by hand), mostly because automatic edges sit inside the expert caliper positions. Real images should always be checked and adjusted by the user; when detection is uncertain the app shows a proposal to confirm instead of a result.

Cabin CO₂ values are simulated and shown as context only; no causal relationship with ONSD is modeled in code.

## AI Usage Declaration

Portions of the source code were generated with AI assistance (Claude Code, Anthropic) and reviewed by
the team. Scientific thresholds and texts are provided and reviewed by the team's biomedical
engineering member. The phantom ultrasound images are rendered by AI-assisted code (no
image-generation models are used for them). Phantom images carry a visible "SYNTHETIC PHANTOM" watermark.

The eye texture of the 3D model was generated with Google Gemini, edited by the team, and is labeled as AI-generated in the app.

3D optic nerve, sheath and vessel geometry are procedurally generated in code (no AI-generated images). The team logo was designed by the team with AI assistance.

AI-assisted files: all files in `src/` (including `src/lib/preprocess.js`, `src/lib/autodetect.js`, `src/lib/measure.js`, `src/lib/autoMeasure.js`, `src/lib/eyeModel.js`, `src/components/*` and `src/styles.css`) and `tests/` (including `tests/helpers/`), `index.html`, `vite.config.js`, `.github/workflows/deploy.yml`, `validation/` (`run.mjs`, `phantomSweep.mjs`, `README.md`, `manifest.example.json`), `tools/generate_sample_scans.py`, the sample scans in `public/samples/` (generated by that script) and the logo files in `public/`. The disclosure is also recorded in package.json (description and keywords).

## Data & Assets

- **Synthetic phantom images** are generated at runtime by `src/lib/phantom.js` and carry a visible
  "SYNTHETIC PHANTOM" watermark. They are not patient images.
- Logo (public/aerosans-logo.png, aerosans-mark.png, favicon-64.png): original team design created with AI assistance.
- Crew sample scans (public/samples/) are SIMULATED, code-generated with tools/generate_sample_scans.py (speckle-based model, known ground-truth ONSD 5.4 / 4.6 / 6.2 mm); not real patient data.
- **Eye texture** (`public/textures/eye.png`, 2048×1024 equirectangular): generated with Google Gemini,
  then edited by the team (iris resized, wave artifacts softened). Used as the color map of the 3D globe
  and labeled "Eye texture: AI-generated (Gemini), edited" in the 3D view.
- **NASA OSDR OSD-397** (Rodent Research-1 mouse retina, RNA-seq and RRBS) — open data used for the
  "Why the eye?" card: https://osdr.nasa.gov/bio/repo/data/studies/OSD-397
- **NASA HRP — 5 Hazards of Human Spaceflight** and **Risks of Human Spaceflight** — public resources
  used for background and framing: https://www.nasa.gov/hrp/hazards/ · https://www.nasa.gov/hrp/risks/
- Mission trend data and cabin CO₂ values are simulated (fictional Crew Members A, B and C) and labeled
  as such in the app.
- **OSD-397 volcano plot** (`public/osd397_volcano.png`, added by the biomedical team member): exported
  from the NASA OSDR Visualization Portal for study OSD-397 and shown in the "Why the eye?" card.
- All crew data shown in the app is **simulated** and labelled as such. Crew names are fictional.
- No NASA logos, insignia or mission patches are used.

## References

- Wang L-J, et al. "Noninvasive and quantitative intracranial pressure estimation using
  ultrasonographic measurement of optic nerve sheath diameter." *Scientific Reports* 2017;7:42063.
  doi:10.1038/srep42063
- Maissan IM, et al. Ultrasonographic measured optic nerve sheath diameter as an accurate and quick
  monitor for changes in intracranial pressure. *J Neurosurg.* 2015;123(3):743-7.
  doi:10.3171/2014.10.JNS141197 — https://pubmed.ncbi.nlm.nih.gov/25955869/
- Maissan IM, et al. Response [to: Optic nerve sheath diameter as ICP marker]. *J Neurosurg.*
  2016;124(3):891.
- Soldatos T, et al. Optic nerve sonography in the diagnostic evaluation of adult brain injury.
  *Crit Care.* 2008;12(3):R67. doi:10.1186/cc6897 — https://pubmed.ncbi.nlm.nih.gov/18477382/
- Berhanu D, et al. The role of optic nerve sheath ultrasonography in increased intracranial
  pressure: a systematic review and meta-analysis. *J Neurol Sci.* 2023;454:120853.
  doi:10.1016/j.jns.2023.120853
- NASA OSDR OSD-397 — RNA-seq and RRBS on spaceflight mouse retina (Rodent Research-1):
  https://osdr.nasa.gov/bio/repo/data/studies/OSD-397
- NASA HRP — 5 Hazards of Human Spaceflight: https://www.nasa.gov/hrp/hazards/
- NASA HRP — Risks of Human Spaceflight: https://www.nasa.gov/hrp/risks/
- NASA OCHMO-TB-004 — NASA-STD-3001 Technical Brief: Carbon Dioxide (CO₂):
  https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
- NASA NTRS 20150019624 — ISS carbon dioxide operational limit and crew symptoms:
  https://ntrs.nasa.gov/citations/20150019624
- Evans LA. Carbon dioxide as a multisystem threat in long duration spaceflight. *Aerosp Med Hum
  Perform.* 2025;96(11):1024–1026. doi:10.3357/AMHP.6716.2025
- Law J, et al. Relationship between carbon dioxide levels and reported headaches on the ISS.
  *J Occup Environ Med.* 2014.

### Libraries

| Library | Version | License |
|---|---|---|
| React / React DOM | 18.3.1 | MIT |
| three (Three.js) | 0.170.0 | MIT |
| Chart.js | 4.4.6 | MIT |
| react-chartjs-2 | 5.2.0 | MIT |
| jsPDF | 4.2.1 | MIT |
| Vite | 5.4.11 | MIT |
| @vitejs/plugin-react | 4.3.4 | MIT |
| Vitest | 2.1.8 | MIT |
| pngjs (validation harness only) | 7.0.0 | MIT |
| jpeg-js (validation harness only) | 0.4.4 | BSD-3-Clause |

## License

[MIT](LICENSE)
