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

- Upload an ultrasound image or generate a deterministic **synthetic phantom** (ONSD 4.0–7.0 mm).
- **Three calibration modes:**
  - *Scale bar* — click both ends of a ruler or scale bar and enter its length. Segments shorter than
    30 px are rejected, and a warning appears if the calibration segment sits on the measured sheath itself.
  - *Image depth* — enter the depth shown on the scanner (cm) and click the top and bottom of the image field.
  - *No scale* — the width is shown in pixels only; no mm value, risk signal, ICP or 3D-eye update.
  - Phantoms calibrate automatically from their scale bar.
- **Nerve-axis support:** two clicks (posterior globe boundary, then a point further down the nerve)
  define the axis, so tilted nerves are measured perpendicular to their own direction. The globe click
  snaps to the nearby vitreous–retina boundary.
- **Robust edge detection:** a profile across the nerve 3 mm behind the globe, averaged over a ±0.5 mm
  strip with bilinear sampling and Gaussian smoothing. Each edge is the 50 % point between the dark band
  and the bright dura on that side (inner edge of the dura).
- **Detection confidence** (high / medium / low) from contrast, symmetry and a plausible width. Low
  confidence switches to manual mode automatically.
- **Draggable edges:** fine-tune either edge along the measurement line; the result is labelled
  "auto", "auto (adjusted)" or "manual".
- **Realistic phantom option:** nerve tilt (−30° to +30°) and a "realistic" mode with grainier speckle,
  blooming sheath walls, lower contrast, bright retrobulbar fat and an optic disc bump.
- **Auto-detect globe & nerve (beta)** for uploaded images, with confidence and manual override: it
  proposes the posterior globe point and the nerve axis (globe circle fit + nerve-band line fit), and
  the user accepts or re-picks them.
- **Local validation harness** (`npm run validate`, see `validation/README.md`) to compare automatic
  measurements with expert measurements on openly licensed images that are kept out of the repository.
- Result card: ONSD, method, confidence, calibration mode, colour-coded risk badge, ICP range (mmH₂O and
  mmHg), Wang 2017 limitation note, "What to do now" action and "How to scan" instructions. Risk, ICP
  and actions appear only with a real scale. Phantoms show ground truth vs measured error.
- Procedural 3D eye (Three.js, no external models): the optic nerve sheath widens and shifts from green
  to yellow to red with ONSD. Parts are clickable and explain their function and status.

## How to run

```bash
npm install
npm run dev      # development server
npm test         # Vitest unit tests
npm run build    # production build in dist/
```

## Live demo

_To be added after deployment._

## Limitations

A meta-analysis of 38 studies (Berhanu et al., 2023) shows that optimal ONSD cut-off values for detecting elevated ICP vary widely, from 4.1 mm to 7.2 mm. Because there is no single universal threshold, AeroSANS uses 5.0 mm and 5.7 mm as commonly used literature reference points, not as diagnostic triggers. The main value of AeroSANS is tracking the relative ONSD trend of each astronaut over a mission, not giving a single-point diagnosis. The ICP estimate (Wang et al., 2017) comes from Earth-based patients and has not been validated in microgravity.

Automatic edge detection was validated on synthetic phantoms (clean and realistic, tilted ±20°). On real ultrasound images, accuracy depends on image quality and on a correct scale; draggable edges and a manual mode are provided, and no mm value, risk or ICP is shown without a scale.

Auto-detection was tuned on synthetic phantoms. Real-image performance is evaluated with a local validation harness on openly licensed images with expert measurements; results are reported only for those images.

## AI Usage Declaration

Portions of the source code were generated with AI assistance (Claude Code, Anthropic) and reviewed by
the team. Scientific thresholds and texts are provided and reviewed by the team's biomedical
engineering member. The phantom ultrasound images and the favicon are rendered by AI-assisted code (no
image-generation models are used). Phantom images carry a visible "SYNTHETIC PHANTOM" watermark.

AI-assisted files: all files in src/ and tests/, index.html, vite.config.js, public/favicon.svg. The disclosure is also recorded in package.json (description and keywords).

## Data & Assets

- **Synthetic phantom images** are generated at runtime by `src/lib/phantom.js` and carry a visible
  "SYNTHETIC PHANTOM" watermark. They are not patient images.
- **Favicon** (`public/favicon.svg`) is a generic eye icon generated in code with AI assistance.
- **NASA OSDR OSD-397** (Rodent Research-1 mouse retina, RNA-seq and RRBS) — open data used for the
  "Why the eye?" card: https://osdr.nasa.gov/bio/repo/data/studies/OSD-397
- **NASA HRP — 5 Hazards of Human Spaceflight** and **Risks of Human Spaceflight** — public resources
  used for background and framing: https://www.nasa.gov/hrp/hazards/ · https://www.nasa.gov/hrp/risks/
- Mission trend data is simulated (fictional Crew Member A) and labeled as such in the app.
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

### Libraries

| Library | Version | License |
|---|---|---|
| React / React DOM | 18.3.1 | MIT |
| three (Three.js) | 0.170.0 | MIT |
| Vite | 5.4.11 | MIT |
| @vitejs/plugin-react | 4.3.4 | MIT |
| Vitest | 2.1.8 | MIT |
| pngjs (validation harness only) | 7.0.0 | MIT |
| jpeg-js (validation harness only) | 0.4.4 | BSD-3-Clause |

## License

[MIT](LICENSE)
