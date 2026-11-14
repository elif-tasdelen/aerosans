// Synthetic ocular B-scan phantom generator. Pure logic: no React / DOM imports.
//
// Geometry (image coordinates, y grows downward):
//   - dark (anechoic) globe whose posterior wall is a bright retinal rim,
//   - optic nerve leaving the posterior pole of the globe along an axis that can be tilted,
//     drawn as a dark (hypoechoic) band bounded by bright dural sheath walls,
//   - speckled orbital fat around it, and a scale bar of known length.
//
// The ground-truth ONSD is the full width of the dark band measured perpendicular to the
// nerve axis, i.e. the distance between the inner edges of the bright dura (Maissan 2016).
//
// "realistic" mode adds stronger, grainier speckle, blooming (blurred) sheath walls, lower
// contrast, a bright retrobulbar fat region around the nerve and a small optic disc bump.

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

/** Length of the overlap between intervals [a, b] and [lo, hi]. */
function overlap(a, b, lo, hi) {
  return Math.max(0, Math.min(b, hi) - Math.max(a, lo));
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

const LEVELS = {
  clean: { vitreous: 0.04, retina: 0.92, fat: 0.5, fatNear: 0.5, nerve: 0.12, sheath: 0.88, disc: 0.92 },
  realistic: { vitreous: 0.06, retina: 0.85, fat: 0.4, fatNear: 0.62, nerve: 0.3, sheath: 0.7, disc: 0.82 },
};

/**
 * Generate a synthetic optic nerve B-scan.
 * @param {object} options
 * @param {number} [options.tiltDeg=0]  nerve tilt from vertical, −30…+30 (positive = toward image right)
 * @param {'clean'|'realistic'} [options.realism='clean']
 * @returns {{
 *   pixels: Uint8ClampedArray, width: number, height: number, mmPerPx: number,
 *   groundTruthOnsdMm: number,
 *   scaleBar: { x1: number, y1: number, x2: number, y2: number, lengthMm: number },
 *   nerve: { centerX: number, globeBoundaryY: number, globePoint: {x,y}, axisPoint: {x,y},
 *            innerGlobePoint: {x,y}, tiltDeg: number },
 *   tiltDeg: number, realism: string, seed: number
 * }}
 * `pixels` is a greyscale image (one byte per pixel, row-major).
 */
export function generatePhantom({
  width = 640,
  height = 480,
  mmPerPx = 0.05,
  onsdMm = 5.2,
  seed = 1,
  tiltDeg = 0,
  realism = 'clean',
} = {}) {
  const rng = createRng(seed);
  const pxPerMm = 1 / mmPerPx;
  const realistic = realism === 'realistic';
  const L = realistic ? LEVELS.realistic : LEVELS.clean;

  // Globe: centre above the visible area so only its posterior part shows.
  const globeR = 10 * pxPerMm;
  const rimT = 0.4 * pxPerMm;
  const globeC = { x: width / 2 + (rng() - 0.5) * 40, y: height / 3 - globeR };

  // Nerve axis through the globe centre, leaving the posterior pole.
  const theta = (tiltDeg * Math.PI) / 180;
  const u = { x: Math.sin(theta), y: Math.cos(theta) }; // along the nerve
  const n = { x: Math.cos(theta), y: -Math.sin(theta) }; // across the nerve
  const P0 = { x: globeC.x + (globeR + rimT) * u.x, y: globeC.y + (globeR + rimT) * u.y };
  const bandHalf = (onsdMm * pxPerMm) / 2;
  const wallT = 0.6 * pxPerMm;
  const footprint = Math.abs(n.x) + Math.abs(n.y); // pixel width projected on n (for anti-aliasing)
  const fatFalloff = 3 * pxPerMm;
  const disc = { x: P0.x - u.x * (rimT + 0.35 * pxPerMm), y: P0.y - u.y * (rimT + 0.35 * pxPerMm), r: 0.7 * pxPerMm };

  // 1. Noise-free tissue map.
  const tissue = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const r = Math.hypot(px - globeC.x, py - globeC.y);
      const t = (px - P0.x) * u.x + (py - P0.y) * u.y;
      const d = (px - P0.x) * n.x + (py - P0.y) * n.y;

      // Orbital fat, brighter close to the nerve in realistic mode.
      const fromWall = Math.max(0, Math.abs(d) - bandHalf - wallT);
      const fatVal =
        t > -2 * pxPerMm ? L.fat + (L.fatNear - L.fat) * Math.exp(-((fromWall / fatFalloff) ** 2)) : L.fat;

      let v;
      if (r < globeR + rimT + 1) {
        const inside = Math.min(1, Math.max(0, globeR - r + 0.5));
        const outsideRim = Math.min(1, Math.max(0, r - (globeR + rimT) + 0.5));
        const rim = Math.max(0, 1 - inside - outsideRim);
        v = inside * L.vitreous + rim * L.retina + outsideRim * fatVal;
      } else if (t > -1 * pxPerMm) {
        const a = d - footprint / 2;
        const b = d + footprint / 2;
        const band = overlap(a, b, -bandHalf, bandHalf) / footprint;
        const walls =
          (overlap(a, b, -bandHalf - wallT, -bandHalf) + overlap(a, b, bandHalf, bandHalf + wallT)) / footprint;
        const fat = Math.max(0, 1 - band - walls);
        v = band * L.nerve + walls * L.sheath + fat * fatVal;
      } else {
        v = fatVal;
      }

      if (realistic) {
        const dd = Math.hypot(px - disc.x, py - disc.y);
        const cover = Math.min(1, Math.max(0, disc.r - dd + 0.5));
        if (cover > 0) v = v * (1 - cover) + L.disc * cover;
      }
      tissue[y * width + x] = v;
    }
  }

  // 2. Blooming: blur the tissue map so the bright walls spread (realistic only).
  if (realistic) gaussianBlur(tissue, width, height, 0.2 * pxPerMm);

  // 3. Speckle: multiplicative Rayleigh noise with unit mean (grainier in realistic mode).
  const speckle = new Float32Array(width * height);
  for (let i = 0; i < speckle.length; i++) {
    const s = Math.max(1e-9, rng());
    speckle[i] = Math.sqrt(-2 * Math.log(s)) / Math.sqrt(Math.PI / 2);
  }
  if (realistic) gaussianBlur(speckle, width, height, 0.9);
  const [sa, sb] = realistic ? [0.15, 0.85] : [0.55, 0.45];

  const img = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const depthGain = 1 - 0.25 * (y / height); // mild attenuation with depth
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      img[i] = tissue[i] * depthGain * (sa + sb * speckle[i]) + rng() * 0.02;
    }
  }
  gaussianBlur(img, width, height, realistic ? 1.2 : 1.0);

  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < img.length; i++) pixels[i] = Math.round(img[i] * 255);

  // Scale bar (burnt into the image like a scanner overlay), in the corner away from the nerve.
  const barMm = 5;
  const barLen = Math.round(barMm * pxPerMm);
  const barX1 = tiltDeg < 0 ? width - 24 - barLen : 24;
  const barX2 = barX1 + barLen;
  const barY = height - 28;
  for (let x = barX1; x <= barX2; x++) {
    for (let k = -1; k <= 1; k++) pixels[(barY + k) * width + x] = 255;
  }
  for (const xe of [barX1, barX2]) {
    for (let k = -6; k <= 6; k++) {
      pixels[(barY + k) * width + xe] = 255;
      pixels[(barY + k) * width + xe + (xe === barX1 ? 1 : -1)] = 255;
    }
  }

  const axisPoint = { x: P0.x + u.x * 6 * pxPerMm, y: P0.y + u.y * 6 * pxPerMm };
  return {
    pixels,
    width,
    height,
    mmPerPx,
    groundTruthOnsdMm: onsdMm,
    scaleBar: { x1: barX1, y1: barY, x2: barX2, y2: barY, lengthMm: barMm },
    nerve: {
      centerX: P0.x,
      globeBoundaryY: P0.y,
      globePoint: P0,
      axisPoint,
      innerGlobePoint: { x: globeC.x + globeR * u.x, y: globeC.y + globeR * u.y },
      tiltDeg,
    },
    tiltDeg,
    realism: realistic ? 'realistic' : 'clean',
    seed,
  };
}
