#!/usr/bin/env bash
# run.sh — the whole loop. Edit the three variables, then run repeatedly until it exits 0.
#
#   ./run.sh measure     # step 2: dump measurements for the source image(s)
#   ./run.sh             # steps 3-4: build, then verify; re-run after every edit
set -uo pipefail
T="$(cd "$(dirname "$0")" && pwd)"

SOURCES=(src/slide1.png src/slide2.png)   # in slide order; use "-" to skip a slide
CLEANER=make_cutouts.sh                     # step 2.5 + crop (regenerates cutouts/)
BUILDER=build.js                          # your copy of build_template.js
DECK=out.pptx
SPEC=spec.json                            # optional; delete the --spec line below if unused

if [ "${1:-}" = "measure" ]; then
  for s in "${SOURCES[@]}"; do
    [ "$s" = "-" ] && continue
    echo "=============== $s"
    python "$T/probe.py" grid    "$s" --step 25
    echo "--- palette";  python "$T/probe.py" palette "$s" --n 10
    echo "--- bands";    python "$T/probe.py" bands   "$s"
    echo "--- boxes";    python "$T/probe.py" boxes   "$s" | head -40
    echo "--- objects";  python "$T/probe.py" objects "$s" --bg dark --top 8
  done
  echo
  echo "Open the .grid.jpg files, then write coordinates into $BUILDER in SOURCE PIXELS."
  exit 0
fi

# STEP 2.5 — rebuild clean plates + cutouts before every build, so the raster can
# never drift out of sync with the overlays the builder draws on top of it.
[ -x "$CLEANER" ] && "$CLEANER"
node "$BUILDER" || exit 1
python "$T/verify.py" "$DECK" \
  --sources "${SOURCES[@]}" \
  --spec "$SPEC" \
  --outdir qa
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo
  echo "Fix the flagged coordinates in $BUILDER (they are printed in source pixels)"
  echo "If a blob appeared right after adding a clean region, lower its expand/tol"
  echo "in clean_regions.json. Geometry cannot see ghosts — drag the cutouts to check."
  echo "and run ./run.sh again. Never hand-edit $DECK."
fi
exit $STATUS
