#!/bin/bash
# Quality eval, one deck: runs the REAL layered pipeline in credit-free files
# mode. Claude answers come from $W/claude-<deck>/*.json, images from $W/img/*.png.
# Missing answers are written as requests (see prep.py / README.md).
#   eval/run.sh <deck>        (deck = a file in eval/briefs without .json)
set -e
D=$(cd "$(dirname "$0")" && pwd); W=${EVAL_WORK:-$D/work}; mkdir -p "$W"
cd "$D/.." && CLAUDE_PROVIDER=files CLAUDE_FILES_DIR=$W/claude-$1 LAYER_IMAGE_PROVIDER=files LAYER_IMAGE_FILES_DIR=$W/img \
  node scripts/layered-benchmark.js "$D/briefs/$1.json" "$W/out-$1" 2>&1 | grep -E "^#|pending|FAILED|sliced|cluster split|Error:" | cut -c1-200 || true
