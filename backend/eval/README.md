# Layered-slide quality eval

The goal: an editable layered slide must look at least as good as the same
slide rendered as ONE image from an art-directed prompt (the quality library
in `prompts/layered_quality_examples.md` + `services/minimalisticExamples.js`),
and adapt its look to the brief (consulting, campaign, minimal, keynote…).

This folder runs the **real pipeline** (deck design → layout → images →
split/slice → guards → preview → PPTX) with **no API spend**: Claude answers and
images are supplied as files (`CLAUDE_PROVIDER=files`, `LAYER_IMAGE_PROVIDER=files`).

## The loop

```bash
cd backend
eval/run.sh consulting        # 1. run → writes pending requests into eval/work/
python3 eval/prep.py          # 2. turns them into prompts + eval/work/image_batch.json
#  3. answer each Claude request: system prompt = eval/work/sys_<kind>.md, user =
#     claude-<deck>/requests/<kind>_<key>.user.md, tool schema = ….schema.json;
#     write ONLY the tool input JSON to claude-<deck>/<kind>_<key>.json.
#     Layout calls also need the reference images in prompts/reference_slides/.
#     A Sonnet subagent per request works well (cheap, parallel).
#  4. generate each image in image_batch.json (Higgsfield gpt_image_2_6_flare,
#     medium, 2k = closest to prod gpt-image-2.5-flare) → save as img/<key>.png
eval/run.sh consulting        # 5. repeat until no "pending"; slides land in eval/work/out-<deck>/
```

Each deck run needs ~2-3 passes (deck design → layouts → images). Outputs per
slide: `slide_N.png` (flattened), `slide_N.layout.json`, `slide_N.breakdown.png`
(which layer is generated vs native). For the A/B, also generate the original
library prompt as one flat image and put the two side by side.

`briefs/`: `consulting` (HBR line exhibit + tombstone timeline), `minimal`
(2:47 AM office, chessboard), `knorr` (cabin collage), `pso` (rider insight),
`bank` (plain brief, no art direction: tests that the register is chosen from
the brief; outline rows were produced by the real outline prompt). A brief's
slide is either a full library prompt (`brief`) or an outline row
(`title/key_points/visual` + deck-level `brief`).

## What the last round showed (2026-11-13)

Comparison PDF + editable PPTX were sent to the owner. Verdict per slide,
flat image vs layered:

| slide | result |
|---|---|
| bank deck (plain brief) | **On par with real consulting work.** Register chosen correctly, action titles, waterfall, target line, sources. No image generations. |
| HBR line exhibit | **Close.** Native annotated chart is now readable; flat version still has bolder chart furniture. |
| cabin collage | **Close.** Photos as strong as the flat one; flat version's overlapping, varied-size collage is livelier than the layered tidy grid. |
| office / chessboard (cinematic) | **Close.** Same scene quality; layered type is bigger and cleaner. Weakness: background prompts that reserve "empty space for type" push the subject smaller; the flat version integrates type into the scene (stencil on the wall). |
| PSO rider | **Slightly behind.** Card text too small for the column; flat version has more presence. |
| tombstones | **Behind.** Lettering is native and placed by Claude on the requested boxes; the cluster image never puts objects exactly where asked, so text and stones misalign. |

## Round 2 (2026-11-13, after the fixes)

- Tombstones: FIXED in code (`anchorToObjects` in `layeredSlide.js`): text on a
  generated object follows the object to where it was drawn. Tested.
- Scene backgrounds (`briefs/scenes.json`, 3 cinematic slides): subjects stay
  large and close, type sits in the reserved zone; the airplane slide matches
  the flat version. Found: labels meant for objects drawn INSIDE a background
  (the map's pin flags) miss them, because the app can't locate them. Prompt
  now says labelled objects must be element/cluster layers over a setting-only
  background; NOT yet re-verified on the map slide.
- Owner's call: collages and card text sizes are fine as they are.

## Open problems, in priority order

1. Re-run `scenes` slide 3 (map with three labelled pins) to confirm the new
   "labelled objects are their own layers" rule.
2. The owner runs the real-keys check (Sonnet 5.5 + gpt-image-2.5-flare).
   Compare against the files-mode results in this folder.

## Where things live

- Layout prompt + art direction: `services/layoutAgent.js` (`ART_DIRECTION`, `LAYOUT_SYSTEM_PROMPT`; concept-first; registers)
- Outline (register + per-slide `visual`): `services/claudeAgent.js` `COMPACT_PLAN_PROMPT`
- Charts (one geometry, server + web): `services/chartGeometry.js` = `frontend/src/components/layered/chartGeometry.js` (a test keeps them identical)
- Cluster split / photo sheets: `services/layerImaging.js`, `services/layeredSlide.js`
- Guards: `services/slideLayout.js` (`resolveImageOverlaps`, `resolveCollisions`, `fitLayout`), `services/textContrast.js`
