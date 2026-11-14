# Validation harness (local only)

This folder measures how well AeroSANS auto-detection and edge detection work on **real** ocular
ultrasound images that have an expert ONSD measurement.

> **Rule:** images in `validation/images/` are **never committed**, nor are crops or other images
> derived from them. `validation/images/`, `validation/manifest.json` and `validation/report.md` are
> listed in `.gitignore`. Only use openly licensed images (e.g. CC BY) and record the source.

## How to use

1. Put PNG or JPEG images in `validation/images/`.
2. Copy `manifest.example.json` to `manifest.json` and add one entry per image:
   - `file` — file name inside `validation/images/`
   - `source` — citation, license and link (for your own records)
   - `mmPerPx` — scale of the image in mm per pixel (from the scale or depth bar)
   - `expertOnsdMm` — the expert's ONSD measurement in mm
   - `notes` — optional
3. Run:

   ```bash
   npm run validate
   ```

   or with another manifest: `node validation/run.mjs path/to/manifest.json`.

For each image the harness runs auto-detection, measures ONSD 3 mm along the detected nerve axis,
and compares it with `expertOnsdMm`. It prints a table (file, auto-detect confidence, measured mm,
expert mm, difference, edge-detection confidence) and a summary (number of images, mean absolute
error, max error, number of low-confidence cases), and writes the same to `validation/report.md`.

If `manifest.json` is missing, the example manifest is used; if no listed image exists, the harness
prints "No images found" and exits without error.

Results apply only to the images you validated; report them together with their sources.
