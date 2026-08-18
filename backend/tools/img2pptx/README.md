# img2pptx — the manual toolkit this feature was automated from

`WAYS_OF_WORKING.md` is the standard operating procedure for turning a flat
picture of a slide into a PowerPoint file where every element is a real object.
It was written for a human (or an agent) driving the steps by hand:

1. **triage** every region into text / vector / data / raster
2. **measure** it with `tools/probe.py`
3. **clean the plate** (`tools/clean_plate.py`) so nothing exists twice
4. **build** with `tools/build_template.js` (pptxgenjs, source-pixel coordinates)
5. **verify** with `tools/verify.py`

The backend runs that same method automatically for every finished deck — see
`backend/services/pptx/`:

| SOP step | Automated by |
|---|---|
| 1–2 triage + measure | `pptx/analyzer.js` — one Claude vision call per slide returns the measurements as JSON |
| 2.5 clean plate + cutouts | `pptx/plate.js` — Node/sharp port of `clean_plate.py` + `probe.py cutout` |
| 3 build | `pptx/builder.js` — the `build_template.js` helpers, driven by the spec instead of hand-written |
| 4 verify | `pptx/spec.js` — schema validation and clamping, plus the full-bleed image fallback |

The Python tools are kept here unchanged: they are the reference implementation,
they are how you debug a slide that came out wrong (`probe.py grid` on the source
image is still the fastest way to see what the analyzer should have measured),
and they need OpenCV, which the deployed backend does not have.
