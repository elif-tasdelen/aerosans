// AeroSANS — NASA Space Apps Challenge 2026
// Portions of this file were generated with AI assistance (Claude Code, Anthropic) and reviewed by the team.

// Central place for every threshold, constant and science text used by the app.
// Values marked TODO(BIO) must be confirmed by the biomedical team member.

// --- Measurement geometry ---------------------------------------------------
/** ONSD is measured this far behind the posterior globe boundary (mm). */
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
export const ONSD_BORDERLINE_MM = 5.0; // TODO(BIO)
export const ONSD_HIGH_MM = 5.7; // TODO(BIO)
/** Assumed operator measurement error (± mm), used for the ICP range. */
export const ONSD_MEASUREMENT_ERROR_MM = 0.3; // TODO(BIO)

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

// TODO(BIO): placeholder scanning steps — replace with the reviewed protocol.
export const HOW_TO_SCAN = [
  'Sit or lie in a stable position and close the eye being scanned.',
  'Apply a generous layer of ultrasound gel on the closed upper eyelid.',
  'Place the linear probe gently on the eyelid in a transverse plane. Do not press on the eye.',
  'Tilt the probe slowly until the optic nerve appears as a dark vertical band behind the globe.',
  'Freeze the image when both sheath borders look sharp, save it and upload it here.',
];

export const SCIENCE_NOTES = {
  sans:
    'Spaceflight Associated Neuro-ocular Syndrome (SANS) includes optic disc edema, globe flattening and choroidal folds seen in long-duration astronauts. Its mechanism is not fully understood.',
  riskSignal:
    'AeroSANS tracks optic nerve sheath diameter (ONSD) trends as a risk signal, not a diagnosis.',
  wang:
    'ICP range estimated with Wang et al. 2017 (ICP = −111.92 + 77.36 × ONSD). The formula comes from 316 neurology patients on Earth and is not validated in microgravity.',
};

export const DISCLAIMER_TEXT = 'Research prototype — not a medical device. Not for diagnosis.';
