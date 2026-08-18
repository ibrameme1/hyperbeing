# Image → Editable PPTX — Standard Operating Procedure

A repeatable method for turning any flat picture of a slide (AI render, screenshot,
PDF export, photo of a printout) into a PowerPoint file where every element is a real
object: text you can retype, shapes you can recolour, charts whose numbers you can edit.

The method is deliberately **code-first**. Tracing by hand in PowerPoint is slow and
unverifiable; a generator script is fast, diffable, and — crucially — lets a second
script *prove* the output matches the input.

> **v2 changelog.** Added **Step 2.5 — Clean the plate** and `tools/clean_plate.py`.
> Earlier versions produced decks that *looked* correct but ghosted: any overlay you
> rebuilt as a live object was still baked into the raster underneath it, and appeared
> as a torn fragment the moment anything was dragged. Step 2.5 is not optional on any
> deck that has both raster cutouts and rebuilt overlays.

---

## The one rule

**Author every coordinate in source-image pixels.** Measure 296, type 296.
A single `px()` helper converts to inches at the end. The moment you start
hand-converting numbers you lose the ability to check your work against the original,
and you will spend the rest of the job nudging things by eye.

```js
const SRC_W = 1376;                      // width of the source image
const px = p => (p * 13.3333) / SRC_W;   // 13.3333in = LAYOUT_WIDE
```

Use the **same divisor for x and y**. If the source image aspect ratio isn't 16:9,
either crop/pad it to 16:9 first or accept letterboxing — never scale the axes
independently, or every circle becomes an ellipse.

## The second rule

**Nothing may exist twice.** Every pixel of the source belongs to exactly one object in
the output. If you rebuild it live, erase it from the raster. If you keep it as raster,
don't rebuild it. Violating this is invisible in a screenshot and obvious the instant
someone edits the deck — which is the entire point of the deliverable.

---

## The six steps

### 1. Triage — decide what each region *is*

Walk the image once and sort every region into exactly one of four buckets. This
decision drives everything after it.

| Bucket | Examples | Treatment |
|---|---|---|
| **Text** | headlines, labels, captions, footnotes | text box, one per visual block, runs for colour changes |
| **Vector** | cards, bars, rows, circles, Venn, dividers, badges | `addShape` primitives |
| **Data** | pie/donut/column/line charts | **native `addChart`** with the real numbers |
| **Raster** | photographs, 3D product renders, AI imagery, screenshots-inside-mockups | cut out and place as an image |

Two judgement calls worth getting right:

- **A chart is never raster.** If you can read the values off it, rebuild it natively.
  A picture of a donut is not an editable deck. The whole point is that someone can
  change 12% to 14% and have the ring redraw.
- **A photo is never vector.** Don't try to redraw a lipstick render with gradients.
  Crop it cleanly and rebuild only the text sitting on top of it.

Grey area: mockups (a phone frame containing a screenshot). Cut out the *frame plus its
screen* as one raster object per phone, so each one moves independently, and rebuild any
text that sits **outside** the frames. Text baked into the screenshot stays baked — say
so when you hand the file over.

**As you triage, keep a second list: the overlap list.** Every time you assign a region
to Text/Vector/Data *and* it sits on top of a region you assigned to Raster, write down
its box. That list is the input to Step 2.5. Writing it later, from memory, is how
ghosts survive.

### 2. Measure — with `probe.py`, not with your eyes

```bash
T=img2pptx/tools

python $T/probe.py grid    src.png --step 25       # numbered overlay to read coords off
python $T/probe.py palette src.png --n 10          # dominant colours as PPT hex
python $T/probe.py pick    src.png 450 300 900 300 # exact colour at points
python $T/probe.py bands   src.png                 # full-width header/footer strips
python $T/probe.py boxes   src.png                 # cards, rows, panels: x y w h fill
python $T/probe.py runs    src.png --row 333       # segment lengths along a line -> bar values
python $T/probe.py objects src.png --bg dark \
        --exclude 0,0,1376,135 --erode 5           # separated objects + rotation angle
```

Notes from practice:

- `objects` merges things that touch. `--exclude x0,y0,x1,y1` blanks overlays (titles,
  callout cards) *before* segmentation; `--erode N` pulls apart neighbours that kiss.
  Run it, read the result, adjust, run again — three iterations is normal.
- Rotation matters. `objects` reports the angle of each object's minimum-area rectangle.
  Feed that angle to `cutout` **and** to `addImage({rotate})` and the piece lands back
  exactly where it came from.
- For bar charts, `runs --row Y` gives you the pixel length of each bar. Convert to
  values via the labels printed on the chart, then in the builder compute
  `length = (value / max) * barMax` — so the bars are driven by data, not traced.
- **Prefer crop boundaries that fall in the gaps.** Where an overlay clips only the edge
  of a photo, pulling the crop in by 20px is lossless and beats inpainting. Reserve
  Step 2.5 for overlays that land in the middle of something, where there is no crop
  that avoids them.

### 2.5. Clean the plate — **erase what you are about to rebuild**

**This is the step whose absence is invisible until someone edits the deck.**

A source slide is flat. A pink callout card drawn over a phone photo is, in the PNG,
just pixels of the phone photo. If you crop that phone as a raster cutout *and* rebuild
the card as a live shape plus text box, the card now exists twice: once live, once baked
into the image beneath it. They register perfectly, so the slide looks right — until
someone drags either object and a half-card fragment slides out from underneath.

The same applies to raster-on-raster: where two cutouts overlap, the lower one is
genuinely missing pixels behind the upper one, and carries a fragment of its neighbour.

So: build a clean plate first, and **cut every raster piece from the clean plate, never
from the flat original.**

```bash
python $T/clean_plate.py src.png --spec clean_regions.json --out clean/src.png --debug
```

`clean_regions.json` is the overlap list from Step 1, in source pixels:

```json
{"regions": [
  {"type": "roundrect", "x": 288, "y": 197, "w": 300, "h": 100, "radius": 13, "grow": 16},
  {"type": "text",      "x": 36,  "y": 24,  "w": 1310, "h": 90},
  {"type": "ellipse",   "cx": 760, "cy": 277, "d": 60},
  {"type": "poly",      "points": [[10,10],[80,12],[78,60],[8,58]]}
]}
```

Then crop from `clean/`:

```bash
python $T/probe.py crop   clean/src.png 288 200 566 662 cutouts/phone2.png
python $T/probe.py cutout clean/src.png 975 410 236 428 13 cutouts/phone4.png --radius 26
#                                        cx  cy   w   h  rot
```

`cutout` de-rotates, crops, and applies a rounded-corner alpha mask so the piece has no
black shoulders when you rotate it back.

**Tuning, in the order you will need it:**

- `grow` (per region, default 3) pads the nominal box before anything else. The geometry
  in your builder is the *card*; the pixels include its drop shadow. Neon-glow cards
  want `grow: 20`.
- **auto-expand** runs automatically: it takes the dominant colour inside each region and
  swallows nearby pixels matching it, which is what actually kills glow and shadow.
  Tune per region with `"expand": N` (px reach) and `"tol": N` (colour distance).
- Text regions default to a tight sweep (`expand 8`, `tol 40`) because bare text needs
  only an anti-aliasing collar. Filled cards get the wide sweep. If you force text
  regions wide, they eat the artwork's glow *around* them and you trade a ghost for a
  smear.
- Expansion is computed **per region against its own colour**, so a bright card cannot
  set the reference for a dim one nearby. This matters more than it sounds: a green
  callout beside a green UI badge will otherwise delete the badge.

**What "clean" means here.** The hidden pixels were never captured and cannot be
recovered; the fill is plausible, not true. That is sufficient. The live object sits
straight back on top of it, so the fill is only ever seen if someone moves that object —
which is precisely the moment the old baked-in ghost would have appeared instead. A soft
blur reads as background. A torn pink card reads as a broken file.

Check the plate by eye before moving on (`--debug` also writes the mask). Two questions:
*is the overlay gone*, and *did the sweep take anything it shouldn't*.

### 3. Build — one script, `build_template.js` as the skeleton

Copy `tools/build_template.js`, set `SRC_W`, and fill in the slide block. It ships with
helpers (`text`, `richText`, `rect`, `circle`, `hline`, `cutout`, `barRow`, `donut`,
`bars`) that all take source-pixel geometry.

**Z-order is the order you add things.** Always:

1. raster cutouts (back)
2. shapes / cards / bars
3. charts
4. text (front)

**Put the data in the script, not in prose.** A row of bars should look like:

```js
const rows = [
  ["SAHIWAL", -57, "Only city nationally worse than Jhelum"],
  ["JHELUM",  -48, "⚠ WORST IN NORTH CLUSTER"],
  // ...
];
```

so that fixing a number fixes the picture. Mirror the same figures into
`slide.addNotes()` — deck recipients get the underlying data, and your text QA has
something to assert against.

**Keep the builder and the clean spec in sync.** If you move a card in the builder, its
region in `clean_regions.json` is now wrong and a sliver of the old one is back. They are
two views of one decision; edit them together.

**pptxgenjs footguns that will silently corrupt or mislocate things:**

- `pres.layout` before the first `addSlide()`. Default canvas is 10in wide, not 13.33in.
- Hex colours: `"FF0000"`. Never `#`, never 8-digit alpha — both break the file.
- Never reuse an options object across two `add*` calls (the library mutates it).
- `rectRadius` only applies to `roundRect`.
- Shadow `offset` must be ≥ 0.
- `charSpacing`, not `letterSpacing`.
- On stacked charts, `dataLabelPosition: "outEnd"` corrupts the file — use `ctr`/`inEnd`.

**Fidelity ceilings to accept rather than fight:** PowerPoint has no lens/intersection
shape (approximate a Venn overlap with an ellipse), no gradient fill via pptxgenjs (use a
gradient image), and no exploded slice on a native donut (place the slice flat and note
it). Emoji render as colour glyphs and may not match the source's monochrome icons.
Fonts are the other ceiling — condensed display faces in AI renders usually don't exist
on the target machine; pick one available font and commit to it rather than mixing.

### 4. Verify — `verify.py` is the part people skip and shouldn't

```bash
python $T/verify.py deck.pptx \
  --sources src1.png src2.png src3.png \
  --spec spec.json \
  --outdir qa
```

Note `--sources` are the **originals**, not the clean plates. You are asking whether the
deck looks like the thing you were given.

Three checks, in the order that catches the most bugs per minute:

1. **Structure** — runs the schema/relationship/chart validator. A deck that won't open
   is the only unrecoverable failure.
2. **Text** — dumps the deck via `markitdown`, greps for leftover placeholders, and
   asserts every string listed in `spec.json` is present on the right slide. This is how
   you catch a typo'd figure or a label you forgot to add.
3. **Geometry** — renders each slide, scales the source to match, and reports:
   - `mean_diff` — overall pixel disagreement,
   - **mismatch blobs** — regions that genuinely differ, printed **in source pixels** so
     they map straight back to lines in your builder,
   - **element drift** — tiles whose content matched but landed offset by more than 6px,
     with the dx/dy to correct.

   It writes `overlay-N.png` (source | render | heatmap side by side) for eyeballing.

Exit code is 0 only if everything passes, so it drops into a loop or CI unchanged.

`spec.json`:

```json
{"slides": [
  {"must_contain": ["SAHIWAL", "-57%", "JHELUM", "-48%"]},
  {"must_contain": ["71M", "12.9M", "#1 SPEND"]}
]}
```

**Geometry cannot see ghosting** — a ghost is a perfect pixel match, that being the
problem. Test it the only way that works: open the deck, drag every raster cutout and
every card off its position, and look at what was underneath. Do it once per deck, on
the slides that have overlays. Alternatively inspect `cutouts/*.png` directly, which is
faster and catches the same thing.

### 5. Iterate — fix the generator, never the output

Every failure gets fixed in the `.js` (or in `clean_regions.json`) and rebuilt.
Hand-editing the produced pptx destroys reproducibility and guarantees the next run
reintroduces the bug.

```bash
./make_cutouts.sh && node build.js && python $T/verify.py deck.pptx --sources src.png --spec spec.json
```

Two or three loops is typical. Stop when the only remaining diffs are the known
fidelity ceilings from step 3 — and **say what they are** when you hand the file over.

Expect Step 2.5 to *add* a small amount of geometric diff, not remove it: the cleaned
area is slightly larger than the live object that covers it, so a thin margin of blur
shows around some cards. That trade is correct. A few hundred pixels of soft edge is the
price of a deck that survives being edited.

---

## Reading the verifier's output

| Symptom | Almost always means |
|---|---|
| Wide, thin blobs repeating down the slide | Row pitch is slightly off — recompute the row step from the first and last row positions rather than assuming a round number |
| One blob exactly where a photo sits | Crop bounds are wrong, or the crop caught text from the original that you also rebuilt (a "ghost") |
| Drift with consistent dx across many tiles | A whole column/group is offset — usually a wrong `x` on a container |
| High `mean_diff`, no blobs | Font substitution or colour temperature, not a layout bug. Check the palette, then accept it |
| Text check fails but the slide looks right | The string is in the image but not in a text box — you left something as raster |
| A new blob appears right after adding a clean region | The halo sweep overshot. Lower that region's `expand`/`tol`, or set `grow` and turn `expand` off |
| Everything passes but dragging an object reveals a fragment | A region is missing from `clean_regions.json` — geometry will never catch this |

---

## Handover checklist

- [ ] `validate.py` passes
- [ ] Every number visible on the slide also appears in speaker notes
- [ ] Charts open a data sheet when double-clicked
- [ ] **Every raster cutout was cut from a clean plate, not from the flat source**
- [ ] **Dragged every cutout and every card once; nothing appeared underneath**
- [ ] No text is trapped inside a raster cutout except where declared
- [ ] Known fidelity gaps stated explicitly to the recipient
- [ ] The builder script, the clean spec, and the cutout script are shipped alongside the deck

---

## Files

```
img2pptx/
├── WAYS_OF_WORKING.md      this document
└── tools/
    ├── probe.py            measurement: grid, palette, pick, bands, boxes, runs, objects, crop, cutout
    ├── clean_plate.py      STEP 2.5: erase rebuilt overlays out of the raster before cropping
    ├── build_template.js   generator skeleton with component helpers
    ├── verify.py           structure + text + geometry QA, exits non-zero on failure
    └── run.sh              the loop, end to end
```
