// Image clean-up before detection and measurement. Pure logic: no React / DOM imports.
// Classical image processing only: annotation removal, scan-area (sector) mask, median filter.
//
// Images are { pixels (greyscale 0–255), width, height } with an optional `rgba` array
// (4 bytes per pixel) that is needed to recognise coloured annotations.

import {
  PRE_COLOR_DIFF,
  PRE_MARK_AREA_MM,
  PRE_MARK_AREA_PX,
  PRE_MARK_CONTRAST,
  PRE_MARK_MIN_VALUE,
  PRE_MEDIAN_WINDOW_MM,
  PRE_SECTOR_BLOCK_PX,
  PRE_SECTOR_GROUP_FRACTION,
  PRE_SECTOR_MIN_STD,
} from '../config.js';

/** Greyscale (ITU-R BT.601 luma) from RGBA bytes. */
export function rgbaToGrey(rgba, width, height) {
  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  return pixels;
}

/** Summed-area table (width + 1 by height + 1) of `pixels`. */
function integralImage(pixels, width, height) {
  const w1 = width + 1;
  const sat = new Float64Array(w1 * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += pixels[y * width + x];
      sat[(y + 1) * w1 + x + 1] = sat[y * w1 + x + 1] + row;
    }
  }
  return sat;
}

function boxMean(sat, width, height, x, y, r) {
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(width, x + r + 1);
  const y1 = Math.min(height, y + r + 1);
  const w1 = width + 1;
  const sum = sat[y1 * w1 + x1] - sat[y0 * w1 + x1] - sat[y1 * w1 + x0] + sat[y0 * w1 + x0];
  return sum / ((x1 - x0) * (y1 - y0));
}

/**
 * Mask (1 = annotation) of things drawn on top of the ultrasound image:
 *  - saturated coloured pixels (yellow / cyan / green text and lines): RGB channel spread > PRE_COLOR_DIFF;
 *  - thin pure-white marks (caliper + and ×, digits): brighter than PRE_MARK_MIN_VALUE, more than
 *    PRE_MARK_CONTRAST above the local mean, and in a connected component smaller than (1.5 mm)².
 * The mask is grown by one pixel to cover anti-aliased borders.
 */
export function annotationMask({ pixels, width, height, rgba = null }, { mmPerPx = null } = {}) {
  const n = width * height;
  const mask = new Uint8Array(n);

  if (rgba) {
    for (let i = 0; i < n; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > PRE_COLOR_DIFF) mask[i] = 1;
    }
  }

  // Thin white marks.
  const maxArea = mmPerPx > 0 ? (PRE_MARK_AREA_MM / mmPerPx) ** 2 : PRE_MARK_AREA_PX;
  const radius = Math.max(4, Math.round(Math.sqrt(maxArea) / 2));
  const sat = integralImage(pixels, width, height);
  const white = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (pixels[i] > PRE_MARK_MIN_VALUE && pixels[i] - boxMean(sat, width, height, x, y, radius) > PRE_MARK_CONTRAST) white[i] = 1;
    }
  }
  const seen = new Uint8Array(n);
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!white[start] || seen[start]) continue;
    const comp = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      comp.push(p);
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (white[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (comp.length < maxArea) for (const p of comp) mask[p] = 1;
  }

  // Grow by one pixel.
  const grown = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) grown[ny * width + nx] = 1;
        }
      }
    }
  }
  return grown;
}

/**
 * Replace masked pixels with the median of the unmasked pixels in their 5×5 neighbourhood.
 * Runs in passes from the border of each masked region inwards, so wide marks are filled too.
 */
export function inpaintMasked(pixels, width, height, mask, maxPasses = 40) {
  const out = new Uint8ClampedArray(pixels);
  const todo = new Uint8Array(mask);
  let remaining = 0;
  for (let i = 0; i < todo.length; i++) remaining += todo[i];
  const buf = [];
  for (let pass = 0; pass < maxPasses && remaining > 0; pass++) {
    const filled = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!todo[i]) continue;
        buf.length = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const q = ny * width + nx;
            if (!todo[q]) buf.push(out[q]);
          }
        }
        if (buf.length >= 3) {
          buf.sort((a, b) => a - b);
          filled.push(i, buf[buf.length >> 1]);
        }
      }
    }
    if (!filled.length) break;
    for (let k = 0; k < filled.length; k += 2) {
      out[filled[k]] = filled[k + 1];
      todo[filled[k]] = 0;
    }
    remaining -= filled.length / 2;
  }
  return out;
}

/** Convex hull (Andrew's monotone chain) of [x, y] points, counter-clockwise. */
function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function insideConvex(hull, x, y) {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}

/**
 * Scan-area mask (1 = inside the ultrasound sector or rectangle).
 * Blocks with enough texture (local standard deviation) are grouped; the large connected groups
 * together are the scan area. Dark, texture-free parts inside it (vitreous) are included by filling the
 * convex hull of that group. The black screen border, rulers, logos and text panels stay outside.
 */
export function sectorMask(pixels, width, height, { block = PRE_SECTOR_BLOCK_PX, minStd = PRE_SECTOR_MIN_STD, erode = 2 } = {}) {
  const bw = Math.ceil(width / block);
  const bh = Math.ceil(height / block);
  const textured = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      let s2 = 0;
      let cnt = 0;
      for (let y = by * block; y < Math.min(height, (by + 1) * block); y++) {
        for (let x = bx * block; x < Math.min(width, (bx + 1) * block); x++) {
          const v = pixels[y * width + x];
          s += v;
          s2 += v * v;
          cnt++;
        }
      }
      const mean = s / cnt;
      if (Math.sqrt(Math.max(0, s2 / cnt - mean * mean)) > minStd) textured[by * bw + bx] = 1;
    }
  }

  // 8-connected groups of textured blocks. The scan area is the largest group together with every
  // other group of at least PRE_SECTOR_GROUP_FRACTION of its size: the eyelid above the globe and
  // the tissue behind it are often separate groups. Small groups (text, ruler ticks) are left out.
  const label = new Int32Array(bw * bh).fill(-1);
  const groups = [];
  const stack = [];
  for (let start = 0; start < bw * bh; start++) {
    if (!textured[start] || label[start] !== -1) continue;
    const comp = [];
    stack.push(start);
    label[start] = start;
    while (stack.length) {
      const p = stack.pop();
      comp.push(p);
      const x = p % bw;
      const y = (p - x) / bw;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const q = ny * bw + nx;
          if (textured[q] && label[q] === -1) {
            label[q] = start;
            stack.push(q);
          }
        }
      }
    }
    groups.push(comp);
  }
  groups.sort((p, q) => q.length - p.length);
  const best = groups.length
    ? groups.filter((g) => g.length >= PRE_SECTOR_GROUP_FRACTION * groups[0].length).flat()
    : null;

  const mask = new Uint8Array(width * height);
  if (!best || best.length < 4) {
    mask.fill(1); // no texture at all: do not restrict anything
    return { mask, bounds: { x0: 0, y0: 0, x1: width, y1: height }, coverage: 1 };
  }

  // Fill the convex hull of the group (in block-corner coordinates), so a dark globe that touches
  // the edge of the scan area stays inside the mask.
  const corners = [];
  for (const p of best) {
    const x = p % bw;
    const y = (p - x) / bw;
    corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
  }
  const hull = convexHull(corners);
  let filled = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (insideConvex(hull, x + 0.5, y + 0.5)) filled[y * bw + x] = 1;
    }
  }
  // Shrink by `erode` blocks so the mask ends inside the scan area: blocks on its border also
  // contain black screen. The image border itself does not shrink the mask.
  for (let pass = 0; pass < erode; pass++) {
    const next = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (!filled[y * bw + x]) continue;
        let keep = 1;
        for (let dy = -1; dy <= 1 && keep; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
            if (!filled[ny * bw + nx]) {
              keep = 0;
              break;
            }
          }
        }
        next[y * bw + x] = keep;
      }
    }
    filled = next;
  }

  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const by = Math.floor(y / block);
    for (let x = 0; x < width; x++) {
      if (!filled[by * bw + Math.floor(x / block)]) continue;
      mask[y * width + x] = 1;
      count++;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y >= y1) y1 = y + 1;
    }
  }
  return { mask, bounds: { x0, y0, x1, y1 }, coverage: count / (width * height) };
}

/** Median filter with a square window of (2·radius + 1) pixels. */
export function medianFilter(pixels, width, height, radius) {
  const r = Math.max(1, Math.round(radius));
  const out = new Uint8ClampedArray(pixels.length);
  const hist = new Uint16Array(256);
  for (let y = 0; y < height; y++) {
    hist.fill(0);
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    const rows = y1 - y0 + 1;
    // Sliding histogram along the row.
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, r); x++) {
      for (let yy = y0; yy <= y1; yy++) hist[pixels[yy * width + x]]++;
      count += rows;
    }
    for (let x = 0; x < width; x++) {
      if (x > 0) {
        const add = x + r;
        if (add < width) {
          for (let yy = y0; yy <= y1; yy++) hist[pixels[yy * width + add]]++;
          count += rows;
        }
        const drop = x - r - 1;
        if (drop >= 0) {
          for (let yy = y0; yy <= y1; yy++) hist[pixels[yy * width + drop]]--;
          count -= rows;
        }
      }
      const half = count >> 1;
      let acc = 0;
      let v = 0;
      while (v < 255 && acc + hist[v] <= half) acc += hist[v++];
      out[y * width + x] = v;
    }
  }
  return out;
}

/**
 * Full clean-up.
 * @returns {{
 *   cleaned: {pixels,width,height},      annotations removed — used for the edge profile
 *   despeckled: {pixels,width,height},   cleaned + median filter — used for globe / nerve detection
 *   sector: Uint8Array, sectorBounds: object, annotationFraction: number }}
 */
export function preprocess(image, { mmPerPx = null } = {}) {
  const { width, height } = image;
  const pixels = image.pixels ?? rgbaToGrey(image.rgba, width, height);
  const marks = annotationMask({ pixels, width, height, rgba: image.rgba ?? null }, { mmPerPx });
  let marked = 0;
  for (let i = 0; i < marks.length; i++) marked += marks[i];
  const cleanedPixels = marked ? inpaintMasked(pixels, width, height, marks) : pixels;
  const { mask, bounds } = sectorMask(cleanedPixels, width, height);
  const window = mmPerPx > 0 ? Math.max(3, Math.round(PRE_MEDIAN_WINDOW_MM / mmPerPx)) : 3;
  const despeckledPixels = medianFilter(cleanedPixels, width, height, Math.floor(window / 2));
  return {
    cleaned: { pixels: cleanedPixels, width, height },
    despeckled: { pixels: despeckledPixels, width, height },
    sector: mask,
    sectorBounds: bounds,
    annotationFraction: marked / marks.length,
  };
}
