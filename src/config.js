// Central place for every threshold, constant and science text used by the app.
// Scientific values and texts are provided and reviewed by the biomedical team member.

// --- Measurement geometry ---------------------------------------------------
// ONSD is measured 3 mm behind the globe, as the distance inside the hyperechoic dura mater (Maissan et al., J Neurosurg 2016;124(3):891).
export const MEASURE_DEPTH_MM = 3;
/** Half-width of the intensity profile sampled across the nerve (mm). */
export const PROFILE_HALF_WIDTH_MM = 6;
/** Rows averaged above and below the measurement line (±N rows). */
export const PROFILE_ROW_HALF = 2;
/** Moving-average radius used to smooth the profile (samples). */
export const PROFILE_SMOOTH_RADIUS = 3;
/** Detected widths outside this range are treated as "not confident" (mm). */
export const ONSD_MIN_PLAUSIBLE_MM = 2.0;
export const ONSD_MAX_PLAUSIBLE_MM = 10.0;
/** Minimum band contrast (0–255 grey levels) for automatic edge detection. */
export const EDGE_MIN_CONTRAST = 20;

// --- Axis-based measurement (any nerve direction) ------------------------------
/** The second axis click must be at least this far from the globe point (mm, or px without a scale). */
export const AXIS_MIN_DISTANCE_MM = 4;
export const AXIS_MIN_DISTANCE_PX = 20;
/**
 * The profile is averaged over a strip of ±this distance along the nerve axis (mm): the rows from
 * 2.0 to 4.0 mm behind the globe; the measurement itself stays at 3 mm. 1.0 mm (was 0.5 mm) averages
 * out the speckle of real ultrasound images.
 */
export const PROFILE_STRIP_HALF_MM = 1.0;
/** Gaussian smoothing of the profile (mm). 0.3 mm (was 0.15 mm) is about one speckle grain on real images. */
export const PROFILE_SIGMA_MM = 0.3;
/** A bright peak must be at least this wide at half of its height to count as the sheath wall (mm). */
export const EDGE_PEAK_MIN_WIDTH_MM = 0.3;
/**
 * Edge method. 'fraction': the point where the profile crosses EDGE_THRESHOLD_FRACTION of the way
 * from the band minimum to the wall peak. 'gradient': the steepest dark→bright point between the
 * band minimum and the wall peak (sub-pixel, parabola fit).
 */
export const EDGE_METHOD = 'fraction';
export const EDGE_THRESHOLD_FRACTION = 0.65;

// --- Preprocessing (src/lib/preprocess.js) ----------------------------------------------
/** Coloured annotation: RGB channel spread above this (0–255). */
export const PRE_COLOR_DIFF = 60;
/** Thin white marks (calipers, digits): brighter than this, and this much above the local mean. */
export const PRE_MARK_MIN_VALUE = 245;
export const PRE_MARK_CONTRAST = 80;
/** …and in a connected component smaller than (this many mm)², or this many px² without a scale. */
export const PRE_MARK_AREA_MM = 1.5;
export const PRE_MARK_AREA_PX = 600;
/** Scan-area (sector) mask: block size and the minimum grey-level standard deviation of a textured block. */
export const PRE_SECTOR_BLOCK_PX = 8;
export const PRE_SECTOR_MIN_STD = 5;
/** Textured groups at least this fraction of the largest one belong to the scan area. */
export const PRE_SECTOR_GROUP_FRACTION = 0.15;
/** Median filter window for speckle reduction before globe / nerve detection (mm, at least 3 px). */
export const PRE_MEDIAN_WINDOW_MM = 0.3;

// --- Posterior-wall globe detection (src/lib/autodetect.js) ---------------------------------
/** The vitreous is a dark run of at least this length along a scan column (mm). */
export const WALL_MIN_VITREOUS_MM = 8;
/** Accepted globe radius (mm). */
export const WALL_RADIUS_RANGE_MM = [8, 16];
/** The nerve is searched within ±this distance of the posterior pole (mm), this deep behind the wall (mm). */
export const WALL_NERVE_HALF_WIDTH_MM = 6;
export const WALL_NERVE_DEPTH_MM = [2, 10];
/** The band minimum is searched within ±this distance of the axis (mm). */
export const EDGE_CENTER_SEARCH_MM = 2;
/**
 * Bright dura peaks are searched within this distance of the axis (mm).
 * 4.5 mm (instead of 4 mm) keeps the far wall of a 7 mm sheath (wall centre ≈ 3.8 mm) in range.
 */
export const EDGE_PEAK_SEARCH_MM = 4.5;
/** Contrast (grey levels) that counts as fully clear for the confidence score. */
export const EDGE_CONTRAST_REF = 60;
/** Confidence score cut-offs (0–1). Below MEDIUM the app switches to manual mode. */
export const CONFIDENCE_HIGH = 0.7;
export const CONFIDENCE_MEDIUM = 0.45;
/** Globe-point snapping range along the axis (mm). */
export const SNAP_RANGE_MM = 1;
/** Parameters used when no scale is available (everything in pixels). */
export const PIXEL_MODE = {
  halfWidthPx: 200,
  stripHalfPx: 4,
  sigmaPx: 2,
  centerSearchPx: 50,
  peakSearchPx: 180,
  minWidthPx: 20,
  maxWidthPx: 400,
};

// --- Calibration -------------------------------------------------------------------
/** Scale-bar segments shorter than this are rejected (px). */
export const CALIB_MIN_SEGMENT_PX = 30;
/** Calibration endpoints within this fraction of the ONSD length of the sheath edges trigger a warning. */
export const CALIB_OVERLAP_TOLERANCE = 0.1;
export const CALIBRATION_LABELS = {
  scaleBar: 'Scale bar',
  depth: 'Image depth',
  none: 'No scale',
  phantom: 'Scale bar (phantom metadata)',
};

export const MESSAGES = {
  calibTooShort: 'Calibration segment too short — use a longer part of the scale.',
  calibOverlap: 'Calibration should use a known scale, not the structure being measured.',
  noScale: 'No scale — ONSD in mm, risk signal and ICP cannot be computed.',
  clickGlobe:
    'Click the posterior globe boundary where the nerve leaves the globe (bottom of the dark globe, just above the bright optic disc bump).',
  clickAxis: 'Now click a point further down the nerve, in the center of the dark band (at least 4 mm away).',
  clickAxisNoScale: 'Now click a point further down the nerve, in the center of the dark band.',
  axisTooShort: 'That point is too close to the globe — click further down the nerve (at least 4 mm away).',
  clickDepth: 'Click the point 3 mm behind the globe on the nerve (no scale, so the app cannot place it).',
  edgesUnclear: 'Edges are unclear on this image — click the left and right inner edges of the bright sheath.',
  edgesAuto: 'Edges detected automatically. Drag the edge markers along the measurement line to fine-tune.',
  autoDetected: 'Auto-detected globe point and nerve axis. Check the overlay, then Accept or re-pick manually.',
  autoUnreliable: 'Auto-detection is unreliable on this image — please pick the points manually.',
  autoMeasureDone: 'Auto-Measure complete. Check the overlay; drag the edge markers along the measurement line to fine-tune.',
  autoMeasureFailed: 'Auto-Measure could not measure this image reliably — please pick the points manually.',
  autoMeasureUncertain:
    'Auto-detection is uncertain on this image — check the yellow axis and edges, drag to adjust, then confirm.',
  realImageNote: 'Real ultrasound: please verify the edges before using the result.',
};

/** How the measurement method is shown in the result card. */
export const METHOD_LABELS = {
  'auto-measure': 'Auto-Measure',
  'auto-measure (adjusted)': 'Auto-Measure (adjusted)',
  manual: 'Manual',
  auto: 'Manual points, automatic edges',
  'auto (adjusted)': 'Manual points, automatic edges (adjusted)',
};

/** Color of the 3 mm measurement marker (2D measurement line and the ring in the 3D eye). */
export const MEASURE_MARKER_COLOR = '#FFD700';
/** Auto-Measure scan animation length (ms). Skipped with prefers-reduced-motion. */
export const AUTO_MEASURE_SCAN_MS = 1200;

// --- Risk thresholds --------------------------------------------------------
// Source: Maissan IM et al. J Neurosurg 2015;123(3):743-7. doi:10.3171/2014.10.JNS141197
export const ONSD_BORDERLINE_MM = 5.0;
// Source: Soldatos T et al. Crit Care 2008;12(3):R67. doi:10.1186/cc6897
export const ONSD_HIGH_MM = 5.7;
// Assumed measurement error (not literature-derived); used only to show ICP as a range.
export const ONSD_MEASUREMENT_ERROR_MM = 0.3;

// --- Wang et al. 2017 (Sci Rep 7:42063) ---------------------------------------
// ICP_mmH2O = WANG_INTERCEPT + WANG_SLOPE * ONSD_mm
// Derived from 316 neurology patients on Earth; NOT validated in microgravity.
export const WANG_INTERCEPT = -111.92;
export const WANG_SLOPE = 77.36;
export const MMH2O_PER_MMHG = 13.6;

// --- Phantom defaults ---------------------------------------------------------
export const PHANTOM_ONSD_MIN_MM = 4.0;
export const PHANTOM_ONSD_MAX_MM = 7.0;
export const PHANTOM_ONSD_DEFAULT_MM = 5.2;

// --- 3D eye view ---------------------------------------------------------------
/** Globe radius in scene units represents ~12 mm, so 1 scene unit ≈ 12 mm. */
export const EYE_MM_PER_UNIT = 12;
/** Optic nerve (without sheath) diameter, shown at a fixed size (mm). */
export const EYE_NERVE_DIAMETER_MM = 3;
/** Default ONSD shown before any measurement exists (mm). */
export const EYE_DEFAULT_ONSD_MM = 5.0;

// --- Texts (from BIO) -----------------------------------------------------------
/**
 * Risk colors — the single source for the risk badge (exposed as CSS variables in main.jsx)
 * and the 3D sheath. `neutral` is used when no calibrated measurement is linked.
 */
export const RISK_COLORS = {
  normal: '#22c55e',
  borderline: '#f59e0b',
  high: '#ef4444',
  neutral: '#94a3b8',
};

export const RISK_LABELS = {
  normal: 'Normal',
  borderline: 'Borderline',
  high: 'High',
};

export const RISK_SUMMARIES = {
  normal: 'ONSD is below the borderline threshold. No sign of increased risk in this scan.',
  borderline: 'ONSD is in the borderline range. This is a risk signal worth watching, not a diagnosis.',
  high: 'ONSD is above the high threshold. This result needs attention from the flight surgeon.',
};

export const ACTIONS = {
  normal: 'Continue weekly routine scanning.',
  borderline: 'Scan again in 24 hours. Log any symptoms like visual changes or headaches.',
  high: 'Notify Flight Surgeon immediately.',
};

export const HOW_TO_SCAN = [
  'Prepare: position the crew member in a stable, restrained position and ask them to gently close both eyes.',
  'Gel: apply a thick layer of ultrasound gel over the closed eyelid. Do not press on the eye.',
  'Probe: place a high-frequency linear probe transversely across the eyelid.',
  'Image: adjust the angle until the globe, the optic disc and the dark vertical band of the optic nerve are clearly visible, then freeze the image.',
  'Measure: 3 mm behind the globe, measure across the nerve between the inner edges of the bright (hyperechoic) dura mater. AeroSANS does this step for you after you click the back of the globe.',
];

export const SCIENCE_NOTES = {
  sans:
    'Spaceflight Associated Neuro-ocular Syndrome (SANS) includes optic disc edema, globe flattening and choroidal folds seen in long-duration astronauts. Its mechanism is not fully understood.',
  riskSignal:
    'AeroSANS tracks optic nerve sheath diameter (ONSD) trends as a risk signal, not a diagnosis.',
  wang:
    'ICP range estimated with Wang et al. 2017 (ICP = −111.92 + 77.36 × ONSD). The formula comes from 316 neurology patients on Earth and is not validated in microgravity.',
  thresholds:
    'Thresholds of 5.0 mm and 5.7 mm are commonly used in Earth-based studies. A meta-analysis of 38 studies found optimal cut-offs ranging from 4.1 to 7.2 mm, so no single universal threshold exists (Berhanu et al., 2023).',
  measurementError:
    'Assumed measurement error of ±0.3 mm, used to show the ICP estimate as a range.',
  limitations:
    'A meta-analysis of 38 studies (Berhanu et al., 2023) shows that optimal ONSD cut-off values for detecting elevated ICP vary widely, from 4.1 mm to 7.2 mm. Because there is no single universal threshold, AeroSANS uses 5.0 mm and 5.7 mm as commonly used literature reference points, not as diagnostic triggers. The main value of AeroSANS is tracking the relative ONSD trend of each astronaut over a mission, not giving a single-point diagnosis. The ICP estimate (Wang et al., 2017) comes from Earth-based patients and has not been validated in microgravity.',
  whyEye:
    "Spaceflight Associated Neuro-ocular Syndrome (SANS) is one of the health risks NASA's Human Research Program studies for long-duration missions. In microgravity, the loss of the normal head-to-foot pressure gradient shifts body fluids toward the head. SANS findings include optic disc edema, globe flattening and choroidal folds. The underlying mechanism is not fully understood, and changes in intracranial pressure may play a role. AeroSANS tracks the optic nerve sheath diameter (ONSD) as a non-invasive, repeatable signal so that changes can be noticed early and reviewed by the flight surgeon.",
};

// Tooltip texts for the clickable 3D eye parts (to be reviewed by BIO). No diagnostic claims.
export const EYE_PART_INFO = {
  globe: {
    name: 'Globe (eyeball)',
    function:
      'The fluid-filled outer shell of the eye that keeps its shape. Flattening at the back of the globe has been reported in some long-duration astronauts.',
    status: 'Globe shape is not measured by AeroSANS.',
  },
  retina: {
    name: 'Retina',
    function:
      'Light-sensitive tissue lining the back of the eye. The optic disc, where the nerve leaves the eye, can swell (optic disc edema) in some SANS cases.',
    status: 'Inside the globe, so it is not visible in this outside view. Not measured by AeroSANS; the retina is assessed with other imaging methods.',
  },
  opticNerve: {
    name: 'Optic nerve',
    function:
      'Carries visual signals from the retina to the brain. In the orbit it lies slack in a gentle S shape, which leaves room for eye movements.',
    status: 'Shown at a fixed diameter: only the sheath around it changes with ONSD.',
  },
  subarachnoidSpace: {
    name: 'Subarachnoid space',
    function:
      'A thin layer of cerebrospinal fluid between the optic nerve and the dura sheath. It is connected to the fluid space around the brain, so pressure changes there can reach the back of the eye.',
    status: 'Shown as the pale blue layer. It widens together with the dura sheath in this model.',
  },
  duraSheath: {
    name: 'Dura sheath',
    function:
      'The outer covering of the optic nerve. When pressure in the cerebrospinal fluid rises, this sheath widens; that width is the optic nerve sheath diameter (ONSD).',
    status:
      'Measured by AeroSANS 3 mm behind the globe (gold ring). The tint shows the current risk signal, not a diagnosis.',
  },
  centralRetinalArtery: {
    name: 'Central retinal artery',
    function:
      'Carries blood to the inner retina. It enters the optic nerve about 10 mm behind the globe and runs inside it to the optic disc.',
    status: 'Illustrative only. Not measured by AeroSANS.',
  },
  centralRetinalVein: {
    name: 'Central retinal vein',
    function:
      'Drains blood from the retina. It leaves the eye through the optic disc and runs inside the optic nerve next to the artery.',
    status: 'Illustrative only. Not measured by AeroSANS.',
  },
};

export const EYE_STATE_TEXT = {
  noScale: 'Last measurement has no mm scale — the 3D view is not linked to it.',
  unconfirmed: 'Last measurement has an unconfirmed scale — the 3D view is not linked to it.',
  preview: 'Preview only — not a measurement.',
};

export const EYE_VIEW_NOTE =
  'Illustrative model, approximately to scale. Colors are for orientation only. Click a part to learn more.';

export const OSD397_VOLCANO_CAPTION =
  'NASA OSDR OSD-397 volcano plot (Visualization Portal). x-axis: log2 fold change, Ground Control vs Space Flight (positive = lower in spaceflight). Mouse retina, 37-day mission; changes are modest and not directly transferable to humans.';

// --- Cabin CO2 context (simulated values, real sources) --------------------------------
// Crew symptoms have been noted from about 2.3 mmHg (NASA NTRS 20150019624).
export const CO2_SYMPTOM_MMHG = 2.3;
// ISS operational limit for the 24-hour average since 2010 (NASA NTRS 20150019624).
export const CO2_OPS_LIMIT_MMHG = 4.0;

export const CO2 = {
  legend: 'Cabin CO₂ (simulated)',
  symptomLabel: 'Crew symptoms reported from ~2.3 mmHg',
  opsLimitLabel: 'ISS operational 24-h limit (since 2010)',
  status: {
    nominal: 'Nominal',
    elevated: 'Elevated — symptoms possible',
    aboveLimit: 'Above ISS operational limit',
  },
  context:
    'In microgravity there is little natural convection, so exhaled CO₂ can accumulate around the crew member if ventilation is poor. Elevated CO₂ widens brain blood vessels, and together with the headward fluid shift this may contribute to higher intracranial pressure (Evans, 2025). AeroSANS shows CO₂ as context next to the ONSD trend; no causal link is modeled.',
  notes: [
    'NASA OCHMO-TB-004: the most common spaceflight symptoms are headaches and vision changes (SANS), commonly linked to fluid shifts and a potential ICP increase; an association between reported headaches and CO₂ levels has been observed.',
    'ISS operational limit: 24-hour average CO₂ ≤ 4.0 mmHg since 2010; crew symptoms have been noted starting at about 2.3 mmHg (NASA NTRS 20150019624).',
    'Evans, 2025 (commentary): microgravity fluid shifts may amplify CO₂-mediated cerebral vasodilation, contributing to elevated ICP and potentially exacerbating SANS.',
    'Law et al., 2014: the odds of a reported headache roughly doubled per 1 mmHg increase in CO₂.',
  ],
  sources: [
    {
      text: 'NASA OCHMO-TB-004 — NASA-STD-3001 Technical Brief: Carbon Dioxide (CO₂).',
      url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
    },
    {
      text: 'NASA NTRS 20150019624 — ISS carbon dioxide operational limit and crew symptoms.',
      url: 'https://ntrs.nasa.gov/citations/20150019624',
    },
    {
      text: 'Evans LA. Carbon dioxide as a multisystem threat in long duration spaceflight. Aerosp Med Hum Perform. 2025;96(11):1024–1026.',
      url: 'https://doi.org/10.3357/AMHP.6716.2025',
    },
    {
      text: 'Law J, et al. Relationship between carbon dioxide levels and reported headaches on the ISS. J Occup Environ Med. 2014.',
      url: null,
    },
  ],
};

/** Short reference list shown in the footer (same sources as README → References). */
export const REFERENCES = [
  {
    text: 'Maissan WA, Dirven PJ, Haitsma IK, Hoeks SE, Gommers D, Stolker RJ. Ultrasonographic measured optic nerve sheath diameter as an accurate and quick monitor for changes in intracranial pressure. J Neurosurg. 2015;123(3):743–747.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/25955869/',
  },
  {
    text: 'Maissan WA, Dirven PJ, Haitsma IK, Hoeks SE, Gommers D, Stolker RJ. Response [to: Optic nerve sheath diameter as ICP marker]. J Neurosurg. 2016;124(3):891.',
    url: 'https://doi.org/10.3171/2015.9.JNS152178',
  },
  {
    text: 'Soldatos T, Chatzimichail K, Papathanasiou M, Gouliamos A. Optic nerve sonography in the diagnostic evaluation of adult brain injury. Crit Care. 2008;12(3):R67.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/18477382/',
  },
  {
    text: 'Wang L-J, Yao Y, Feng L-S, Wang Y-Z, Zheng N-N, Feng J-C, Xing Y-Q. Noninvasive and quantitative intracranial pressure estimation using ultrasonographic measurement of optic nerve sheath diameter. Sci Rep. 2017;7:42063.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5294647/',
  },
  {
    text: 'Kim DH, Jun JS, Kim R. Ultrasonographic measurement of the optic nerve sheath diameter and its association with eyeball transverse diameter in 585 healthy volunteers. Sci Rep. 2017;7(1):15906.',
    url: 'https://doi.org/10.1038/s41598-017-16173-z',
  },
  {
    text: 'Berhanu D, et al. The role of optic nerve sheath ultrasonography in increased intracranial pressure: a systematic review and meta-analysis. J Neurol Sci. 2023;454:120853.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37925899/',
  },
  {
    text: 'Baumgartner P, Zahn M, Handelsmann HL, et al. Optic nerve sheath diameter for prediction of intracranial hypertension after ischemic stroke — the ONSITE study. Eur Stroke J. 2026;11(1):23969873251379985.',
    url: 'https://doi.org/10.1093/esj/23969873251379985',
  },
  {
    text: 'Bozdoğan Z, Şenel E, Özmuk Ö, Karataş H, Kurşun O. Comparison of optic nerve sheath diameters measured by optic ultrasonography before and after lumbar puncture in idiopathic intracranial hypertension patients. Arch Neuropsychiatry. 2023;60(2):117–123.',
    url: 'https://doi.org/10.29399/npa.28074',
  },
  {
    text: 'Trollip L, Alberto K, Makgotloe A. Optic nerve sheath diameter: a cross-sectional study of ultrasonographic measurement in healthy Black South African adults. Life (Basel). 2023;13(10):1979.',
    url: 'https://doi.org/10.3390/life13101979',
  },
  {
    text: 'Alperin N, Bagci AM. Spaceflight-induced visual impairment and globe deformations in astronauts are linked to orbital cerebrospinal fluid volume increase. Acta Neurochir Suppl. 2018;126:215–219.',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7585261/',
  },
  {
    text: 'Evans LA. Carbon dioxide as a multisystem threat in long duration spaceflight. Aerosp Med Hum Perform. 2025;96(11):1024–1026.',
    url: 'https://doi.org/10.3357/AMHP.6716.2025',
  },
  {
    text: 'NASA Open Science Data Repository. OSD-397: Illumina NGS RNA-seq and RRBS sequencing on spaceflight mouse retina [data set]. 2023.',
    url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-397',
  },
  {
    text: 'NASA Office of the Chief Health and Medical Officer. Carbon dioxide (CO₂). NASA-STD-3001 Technical Brief OCHMO-TB-004 Rev C. 2023.',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
  },
  {
    text: 'NASA Human Research Program. Risk of spaceflight associated neuro-ocular syndrome (SANS). 2023.',
    url: 'https://humanresearchroadmap.nasa.gov/risks/risk.aspx?i=105',
  },
  // Additional CO₂ sources cited in the cabin-environment notes (not duplicated above).
  ...CO2.sources.filter((s) => !/OCHMO|Evans/.test(s.text)),
];

// --- PDF report --------------------------------------------------------------------
export const REPORT = {
  title: 'AeroSANS — ONSD Risk Report',
  footer: 'Simulated data where labeled. Not for clinical use. AI was used in this project (see README: AI Usage Declaration).',
  noScale: 'No scale — ONSD in pixels only; risk and ICP not computed',
  generating: 'Generating report…',
  ready: 'Report ready',
  generatingMs: 1500,
  readyMs: 500,
};

export const DISCLAIMER_TEXT = 'Research prototype — not a medical device. Not for diagnosis.';
