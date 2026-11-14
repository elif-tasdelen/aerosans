// Synthetic ocular B-scan phantom generator. Pure logic: no React / DOM imports.
//
// Geometry (image coordinates, y grows downward):
//   - dark (anechoic) globe whose posterior wall is a bright retinal rim,
//   - optic nerve running straight down from the posterior globe,
//     drawn as a dark (hypoechoic) band bounded by bright dural sheath walls,
//   - speckled orbital fat around it, and a scale bar of known length.
//
// The ground-truth ONSD is the full width of the dark band, i.e. the distance
// between its two boundaries with the bright sheath walls. That is exactly what
// `findSheathEdges` in measure.js detects.

/** Deterministic PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Length of the overlap between interval [a, b] and pixel [x, x + 1]. */
function overlap(a, b, x) {
  return Math.max(0, Math.min(b, x + 1) - Math.max(a, x));
}

/** Separable Gaussian blur on a Float32Array image (in place, returns it). */
function gaussianBlur(src, width, height, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const k = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(k);
    sum += k;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[row + xx] * kernel[k + radius];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        acc += tmp[yy * width + x] * kernel[k + radius];
      }
      src[y * width + x] = acc;
    }
  }
  return src;
}

/**
 * Generate a synthetic optic nerve B-scan.
 * @returns {{
 *   pixels: Uint8ClampedArray, width: number, height: number, mmPerPx: number,
 *   groundTruthOnsdMm: number,
 *   scaleBar: { x1: number, y1: number, x2: number, y2: number, lengthMm: number },
 *   nerve: { centerX: number, globeBoundaryY: number },
 *   seed: number
 * }}
 * `pixels` is a greyscale image (one byte per pixel, row-major).
 */
export function generatePhantom({
  width = 640,
  height = 480,
  mmPerPx = 0.05,
  onsdMm = 5.2,
  seed = 1,
} = {}) {
  const rng = createRng(seed);
  const pxPerMm = 1 / mmPerPx;

  // Tissue echo levels (0..1).
  const I_VITREOUS = 0.04;
  const I_RETINA = 0.92;
  const I_FAT = 0.5;
  const I_NERVE = 0.12;
  const I_SHEATH = 0.88;

  // Globe: centre above the visible area so only its posterior part shows.
  const globeR = 10 * pxPerMm;
  const globeCx = width / 2;
  const globeCy = height / 3 - globeR; // posterior wall at one third of the image height
  const rimT = 0.4 * pxPerMm;

  // Nerve: vertical axis with a small seeded offset.
  const nerveCx = width / 2 + (rng() - 0.5) * 40;
  const bandHalf = (onsdMm * pxPerMm) / 2;
  const wallT = 0.6 * pxPerMm;
  const nerveTop = globeCy + globeR + rimT;

  const img = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const depthGain = 1 - 0.25 * (y / height); // mild attenuation with depth
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - globeCx;
      const dy = y + 0.5 - globeCy;
      const r = Math.sqrt(dx * dx + dy * dy);

      let v;
      if (r < globeR + rimT + 1) {
        // Globe interior, retinal rim, with ~1 px anti-aliasing on each boundary.
        const inside = Math.min(1, Math.max(0, globeR - r + 0.5));
        const outsideRim = Math.min(1, Math.max(0, r - (globeR + rimT) + 0.5));
        const rim = Math.max(0, 1 - inside - outsideRim);
        v = inside * I_VITREOUS + rim * I_RETINA + outsideRim * I_FAT;
      } else if (y + 0.5 > nerveTop - 2) {
        // Retro-bulbar region: nerve band, sheath walls, orbital fat (column-wise AA).
        const band = overlap(nerveCx - bandHalf, nerveCx + bandHalf, x);
        const walls =
          overlap(nerveCx - bandHalf - wallT, nerveCx - bandHalf, x) +
          overlap(nerveCx + bandHalf, nerveCx + bandHalf + wallT, x);
        const fat = Math.max(0, 1 - band - walls);
        v = band * I_NERVE + walls * I_SHEATH + fat * I_FAT;
      } else {
        v = I_FAT;
      }

      // Multiplicative Rayleigh speckle with unit mean.
      const u = Math.max(1e-9, rng());
      const speckle = Math.sqrt(-2 * Math.log(u)) / Math.sqrt(Math.PI / 2);
      img[y * width + x] = v * depthGain * (0.55 + 0.45 * speckle) + rng() * 0.02;
    }
  }

  gaussianBlur(img, width, height, 1.0);

  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < img.length; i++) pixels[i] = Math.round(img[i] * 255);

  // Scale bar (burnt into the image like a scanner overlay), bottom-left corner.
  const barMm = 5;
  const barLen = Math.round(barMm * pxPerMm);
  const barX1 = 24;
  const barX2 = barX1 + barLen;
  const barY = height - 28;
  for (let x = barX1; x <= barX2; x++) {
    for (let t = -1; t <= 1; t++) pixels[(barY + t) * width + x] = 255;
  }
  for (const xe of [barX1, barX2]) {
    for (let t = -6; t <= 6; t++) {
      pixels[(barY + t) * width + xe] = 255;
      pixels[(barY + t) * width + xe + (xe === barX1 ? 1 : -1)] = 255;
    }
  }

  return {
    pixels,
    width,
    height,
    mmPerPx,
    groundTruthOnsdMm: onsdMm,
    scaleBar: { x1: barX1, y1: barY, x2: barX2, y2: barY, lengthMm: barMm },
    nerve: { centerX: nerveCx, globeBoundaryY: nerveTop },
    seed,
  };
}
