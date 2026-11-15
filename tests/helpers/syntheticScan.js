// Test helpers that turn a synthetic phantom into something closer to a real scanner screenshot:
// extra speckle, drawn annotations (white calipers, a yellow line) and a black screen frame with
// a depth ruler. Everything is generated in code; no real images are used.

import { createRng } from '../../src/lib/phantom.js';

/** Grey phantom → { pixels, rgba, width, height } (rgba is grey unless annotations are drawn). */
export function withRgba(image) {
  const { pixels, width, height } = image;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = pixels[i];
    rgba[i * 4 + 3] = 255;
  }
  return { kind: 'upload', pixels: new Uint8ClampedArray(pixels), rgba, width, height };
}

/** Multiplicative speckle (grain of `grainPx` pixels) with a fixed seed. */
export function addSpeckle(image, { seed = 9, strength = 0.45, grainPx = 2 } = {}) {
  const { width, height } = image;
  const rng = createRng(seed);
  const gw = Math.ceil(width / grainPx);
  const gh = Math.ceil(height / grainPx);
  const grain = new Float32Array(gw * gh);
  for (let i = 0; i < grain.length; i++) grain[i] = 1 + strength * (rng() + rng() - 1);
  const out = withRgba(image);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.min(255, Math.max(0, image.pixels[y * width + x] * grain[Math.floor(y / grainPx) * gw + Math.floor(x / grainPx)]));
      setGrey(out, x, y, v);
    }
  }
  return out;
}

function setGrey(img, x, y, v) {
  setRgb(img, x, y, v, v, v);
}

function setRgb(img, x, y, r, g, b) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = y * img.width + x;
  img.rgba[i * 4] = r;
  img.rgba[i * 4 + 1] = g;
  img.rgba[i * 4 + 2] = b;
  img.pixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/** White caliper "+" marks at the given points and a yellow line between the first two. */
export function drawAnnotations(image, points, { arm = 7 } = {}) {
  const out = { ...withRgba(image), rgba: image.rgba ? new Uint8ClampedArray(image.rgba) : withRgba(image).rgba };
  const [a, b] = points;
  if (a && b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let k = 0; k <= steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const y = a.y + ((b.y - a.y) * k) / steps;
      setRgb(out, x, y, 255, 230, 0);
      setRgb(out, x, y + 1, 255, 230, 0);
    }
  }
  for (const p of points) {
    for (let d = -arm; d <= arm; d++) {
      for (const t of [0, 1]) {
        setRgb(out, p.x + d, p.y + t, 255, 255, 255);
        setRgb(out, p.x + t, p.y + d, 255, 255, 255);
      }
    }
  }
  return out;
}

/**
 * Put the scan inside a larger black screen with a white depth ruler on the right and a block of
 * white "text" (small rectangles) on the left. Returns the image and the offset of the scan.
 */
export function addScreenFrame(image, { left = 150, right = 110, top = 40, bottom = 50 } = {}) {
  const src = image.rgba ? image : withRgba(image);
  const width = src.width + left + right;
  const height = src.height + top + bottom;
  const out = { kind: 'upload', pixels: new Uint8ClampedArray(width * height), rgba: new Uint8ClampedArray(width * height * 4), width, height };
  for (let i = 0; i < width * height; i++) out.rgba[i * 4 + 3] = 255;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = y * src.width + x;
      setRgb(out, x + left, y + top, src.rgba[i * 4], src.rgba[i * 4 + 1], src.rgba[i * 4 + 2]);
    }
  }
  // Depth ruler: a vertical white line with ticks, 30 px to the right of the scan.
  const rx = left + src.width + 30;
  for (let y = top; y < top + src.height; y++) {
    setGrey(out, rx, y, 255);
    if ((y - top) % 20 === 0) for (let d = 1; d <= 8; d++) setGrey(out, rx + d, y, 255);
  }
  // Text panel: rows of small white blocks.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 5; dx++) setGrey(out, 14 + col * 9 + dx, top + 20 + row * 16 + dy, 235);
    }
  }
  return { image: out, offset: { x: left, y: top } };
}
