#!/usr/bin/env bash
# make_cutouts.sh — STEP 2.5 + crop. Produces clean plates, then cuts every raster
# piece FROM THE CLEAN PLATE (never from the flat original), so no rebuilt live
# object is also baked into the image beneath it.
set -euo pipefail
cd "$(dirname "$0")"
T=tools
P=/home/claude/img2pptx_extracted/tools/probe.py

mkdir -p clean cutouts

# ── 1. clean plates: erase every region listed in clean_regions.json ────────────
python3 - <<'PY'
import json, subprocess, os
spec = json.load(open("clean_regions.json"))
os.makedirs("clean", exist_ok=True)
for name, body in spec.items():
    if name.startswith("_"):
        continue
    tmp = "clean/%s.regions.json" % name
    json.dump({"regions": body["regions"]}, open(tmp, "w"))
    subprocess.check_call(["python3", "tools/clean_plate.py",
                           "src/%s.png" % name, "--spec", tmp,
                           "--out", "clean/%s.png" % name, "--debug"])
PY

# slides with raster but nothing overlapping them still need a plate to cut from
for f in s07_flavor_wars s11_stitch_bait; do
  cp "src/$f.png" "clean/$f.png"
done

# ── 2. cut every raster piece FROM clean/, not from src/ ───────────────────────
C=clean

# slide 3 — photo collage
python3 $P crop $C/s03_2015_routes.png   30 258  366 483 cutouts/s03_p1.png
python3 $P crop $C/s03_2015_routes.png  358 246  694 491 cutouts/s03_p2.png
python3 $P crop $C/s03_2015_routes.png  692 246 1074 463 cutouts/s03_p3.png
python3 $P crop $C/s03_2015_routes.png  133 490  394 636 cutouts/s03_p4.png
python3 $P crop $C/s03_2015_routes.png  388 490  599 636 cutouts/s03_p5.png
python3 $P crop $C/s03_2015_routes.png  598 490  921 649 cutouts/s03_p6.png

# slide 5 — 3D platform stack
python3 $P crop $C/s05_structural_growth.png 370 55 1225 655 cutouts/s05_stack.png

# slide 6 — phone mockups
python3 $P crop $C/s06_pov_skits.png   38 396  280 662 cutouts/s06_p1.png
python3 $P crop $C/s06_pov_skits.png  260 165  550 662 cutouts/s06_p2.png
python3 $P crop $C/s06_pov_skits.png  548 166  828 662 cutouts/s06_p3.png
python3 $P crop $C/s06_pov_skits.png  823 148 1092 622 cutouts/s06_p4.png
python3 $P crop $C/s06_pov_skits.png 1120 123 1332 422 cutouts/s06_p5.png

# slide 7 — packs + people (no live overlays; plate == source)
python3 $P crop $C/s07_flavor_wars.png   55 213  183 350 cutouts/s07_pack1.png
python3 $P crop $C/s07_flavor_wars.png  380 213  528 350 cutouts/s07_pack2.png
python3 $P crop $C/s07_flavor_wars.png  705 213  848 350 cutouts/s07_pack3.png
python3 $P crop $C/s07_flavor_wars.png 1030 213 1180 350 cutouts/s07_pack4.png
python3 $P crop $C/s07_flavor_wars.png   45 360  335 533 cutouts/s07_person1.png
python3 $P crop $C/s07_flavor_wars.png  375 360  668 533 cutouts/s07_person2.png
python3 $P crop $C/s07_flavor_wars.png  706 360 1000 533 cutouts/s07_person3.png
python3 $P crop $C/s07_flavor_wars.png 1042 360 1332 533 cutouts/s07_person4.png

# slide 8 — 3D week platforms
python3 $P crop $C/s08_flavor_arc.png  95 330  495 592 cutouts/s08_wk1.png
python3 $P crop $C/s08_flavor_arc.png 495 190  905 562 cutouts/s08_wk2.png
python3 $P crop $C/s08_flavor_arc.png 888 148 1292 555 cutouts/s08_wk3.png

# slide 9 — comment-section phones
python3 $P crop $C/s09_comment_section.png   40 175  292 662 cutouts/s09_p1.png
python3 $P crop $C/s09_comment_section.png  288 200  566 662 cutouts/s09_p2.png
python3 $P crop $C/s09_comment_section.png  598 175  824 662 cutouts/s09_p3.png
python3 $P crop $C/s09_comment_section.png  836 248 1080 612 cutouts/s09_p4.png
python3 $P crop $C/s09_comment_section.png 1096 223 1334 550 cutouts/s09_p5.png

# slide 10 — content tower
python3 $P crop $C/s10_content_architecture.png 515 125 872 682 cutouts/s10_tower.png

# slide 11 — stitch bait
python3 $P crop $C/s11_stitch_bait.png  160 230 1220 538 cutouts/s11_main.png
python3 $P crop $C/s11_stitch_bait.png   55 548  296 662 cutouts/s11_a.png
python3 $P crop $C/s11_stitch_bait.png  320 548  561 662 cutouts/s11_b.png
python3 $P crop $C/s11_stitch_bait.png  585 548  826 662 cutouts/s11_c.png

# slide 12 — cafe / flight moment
python3 $P crop $C/s12_cultural_permission.png 55 216 1333 662 cutouts/s12_main.png

echo "clean plates + cutouts regenerated"
