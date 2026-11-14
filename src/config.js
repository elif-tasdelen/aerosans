// AeroSANS — NASA Space Apps Challenge 2026
// Portions of this file were generated with AI assistance (Claude Code, Anthropic) and reviewed by the team.

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

// --- Texts (from BIO) -----------------------------------------------------------
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

export const DISCLAIMER_TEXT = 'Research prototype — not a medical device. Not for diagnosis.';
