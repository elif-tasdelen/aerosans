# Validation harness (local only)

This folder measures how well AeroSANS auto-detection and edge detection work on **real** ocular
ultrasound images that have an expert ONSD measurement.

> **Rule:** images in `validation/images/` are **never committed**, nor are crops, overlays or other
> images derived from them. `validation/images/`, `validation/manifest.json`, `validation/report.md`
> and `validation/out/` are listed in `.gitignore`. Only use openly licensed images (e.g. CC BY) and
> record the source.

## How to use

1. Put PNG or JPEG images in `validation/images/`.
2. Copy `manifest.example.json` to `manifest.json` and add one entry per image:
   - `file` — file name inside `validation/images/`
   - `source` — citation, license and link (for your own records)
   - `mmPerPx` — scale of the image in mm per pixel (from the scale or depth bar)
   - `expertOnsdMm` — the expert's ONSD measurement in mm (optional; `null` for detection-only images)
   - `expertGlobePoint` — optional `{ "x", "y" }` of the posterior globe point on the nerve, in the
     pixels of the full image
   - `crop` — optional `[x, y, width, height]` to use only one panel of the image
   - `size` — optional `[width, height]` of the full image, checked against the file
   - `excludeFromMae` — optional; `true` reports the image separately (not in the mean error)
   - `notes` — optional
3. Run:

   ```bash
   npm run validate
   ```

   or with another manifest: `node validation/run.mjs path/to/manifest.json`.

For each image the harness removes annotations, finds the scan area and then reports:

- **Globe detection:** the method that found the globe (`dark-blob` or `posterior-wall`), its
  confidence and the distance (mm) between the detected globe point and `expertGlobePoint`.
- **ONSD in two modes:** `auto` (auto-detected globe point and axis) and `manual` (axis straight down
  from `expertGlobePoint`, like the two-click flow in the app).
- **Every edge method side by side** in both modes: `fraction 0.50 / 0.65 / 0.75` and `gradient`,
  with the mean absolute error against the expert values.
- **Synthetic phantoms:** the error of every edge method on clean and realistic phantoms
  (`node validation/phantomSweep.mjs` prints only this table).

It writes the same to `validation/report.md` and one annotated image per file to
`validation/out/<file>_overlay.png` (detected globe circle and point, axis, the 3 mm measurement
line, the edges, and the measured and expert values in the top line).

If `manifest.json` is missing, the example manifest is used; if no listed image exists, the harness
prints "No images found" and exits without error.

Results apply only to the images you validated; report them together with their sources.
