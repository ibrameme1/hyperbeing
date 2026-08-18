#!/usr/bin/env python3
"""
verify.py — automated QA for an image->pptx conversion.

It answers three questions, in order of how often they catch a real bug:
  1. STRUCTURE  — does the file open? (schema, rels, content-types, charts)
  2. TEXT       — is every string from my spec actually in the deck, spelled right?
  3. GEOMETRY   — does each slide render to roughly the same picture as its source?

Usage:
  python verify.py deck.pptx --sources src1.png src2.png ...      [--spec spec.json]
                             [--outdir qa] [--fail-diff 26] [--fail-blob 4000]

--sources are matched to slides in order; pass "-" to skip a slide.
--spec is optional JSON: {"slides":[{"must_contain":["71M","Gen Z"]}, ...]}

Outputs to --outdir:
  render-N.png     what LibreOffice drew
  overlay-N.png    source | render | heatmap, side by side
  report.json      machine-readable results
and prints a PASS/FAIL summary with the coordinates of every mismatch region,
expressed in SOURCE PIXELS so they map straight back to the builder script.

Exit code 0 = all checks passed, 1 = something failed.
"""
import argparse, json, os, re, shutil, subprocess, sys
import numpy as np
import cv2

SKILL = "/mnt/skills/public/pptx/scripts/office"


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)


# ---------- 1. structure ----------
def check_structure(deck, original=None):
    cmd = f'python {SKILL}/validate.py "{deck}"'
    if original:
        cmd += f' --original "{original}"'
    r = sh(cmd)
    ok = "PASSED" in r.stdout and r.returncode == 0
    return ok, (r.stdout + r.stderr).strip()


# ---------- 2. text ----------
def deck_text(deck):
    r = sh(f'markitdown "{deck}"')
    return r.stdout


def check_text(deck, spec):
    txt = deck_text(deck)
    flat = re.sub(r"\s+", " ", txt).lower()
    problems = []
    # placeholder / leftover junk
    for pat in [r"\bx{3,}\b", r"lorem", r"ipsum", r"\btodo\b", r"\[insert"]:
        if re.search(pat, flat):
            problems.append(f"placeholder text matching /{pat}/ still in deck")
    # per-slide required strings
    if spec:
        blocks = re.split(r"<!--\s*Slide number:\s*\d+\s*-->", txt)[1:]
        for i, sl in enumerate(spec.get("slides", [])):
            hay = re.sub(r"\s+", " ", blocks[i] if i < len(blocks) else "").lower()
            for need in sl.get("must_contain", []):
                if re.sub(r"\s+", " ", need).lower() not in hay:
                    problems.append(f"slide {i+1}: missing text {need!r}")
    return (len(problems) == 0), problems, txt


# ---------- 3. geometry ----------
def render(deck, outdir, dpi=130):
    os.makedirs(outdir, exist_ok=True)
    sh(f'python {SKILL}/soffice.py --headless --convert-to pdf --outdir "{outdir}" "{deck}"')
    pdf = os.path.join(outdir, os.path.splitext(os.path.basename(deck))[0] + ".pdf")
    for f in os.listdir(outdir):
        if f.startswith("render-"):
            os.remove(os.path.join(outdir, f))
    sh(f'pdftoppm -png -r {dpi} "{pdf}" "{os.path.join(outdir, "render")}"')
    files = sorted(f for f in os.listdir(outdir) if f.startswith("render-") and f.endswith(".png"))
    return [os.path.join(outdir, f) for f in files]


def compare(src_path, ren_path, overlay_path, fail_blob):
    src = cv2.imread(src_path)
    ren = cv2.imread(ren_path)
    k = ren.shape[1] / src.shape[1]                      # render px per source px
    H = int(round(src.shape[0] * k))
    src_r = cv2.resize(src, (ren.shape[1], H))
    ren_r = ren[:H] if ren.shape[0] >= H else cv2.resize(ren, (ren.shape[1], H))

    gs = cv2.cvtColor(src_r, cv2.COLOR_BGR2GRAY)
    gr = cv2.cvtColor(ren_r, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(gs, gr)
    mean_diff = float(diff.mean())

    # blobs of real disagreement (ignores antialiasing / font hinting noise)
    m = cv2.morphologyEx((diff > 90).astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    blobs = []
    for i in (np.argsort(-st[1:, 4]) + 1)[:12]:
        if st[i, 4] < fail_blob:
            break
        x, y, w, h, area = st[i]
        blobs.append({"area": int(area), "x": int(x / k), "y": int(y / k),
                      "w": int(w / k), "h": int(h / k)})

    # per-element drift: match 6x4 tiles of the source inside the render
    drift = []
    th, tw = H // 4, ren.shape[1] // 6
    pad = int(30 * k)
    for r_ in range(4):
        for c_ in range(6):
            y0, x0 = r_ * th, c_ * tw
            tmpl = gs[y0:y0 + th, x0:x0 + tw]
            if tmpl.std() < 8:
                continue                                     # flat area, nothing to match
            sy0, sx0 = max(0, y0 - pad), max(0, x0 - pad)
            sub = gr[sy0:y0 + th + pad, sx0:x0 + tw + pad]
            if sub.shape[0] <= tmpl.shape[0] or sub.shape[1] <= tmpl.shape[1]:
                continue
            res = cv2.matchTemplate(sub, tmpl, cv2.TM_CCOEFF_NORMED)
            _, score, _, loc = cv2.minMaxLoc(res)
            dx = (loc[0] + sx0 - x0) / k
            dy = (loc[1] + sy0 - y0) / k
            at_edge = abs(abs(dx) - pad / k) < 1.5 or abs(abs(dy) - pad / k) < 1.5
            if score > 0.75 and not at_edge and (abs(dx) > 6 or abs(dy) > 6):
                drift.append({"tile": [c_, r_], "dx": round(dx, 1), "dy": round(dy, 1),
                              "score": round(float(score), 2)})

    heat = cv2.applyColorMap(diff, cv2.COLORMAP_INFERNO)
    cv2.imwrite(overlay_path, np.hstack([src_r, ren_r, heat]))
    return {"mean_diff": round(mean_diff, 2), "blobs": blobs, "drift": drift}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("deck")
    ap.add_argument("--sources", nargs="*", default=[])
    ap.add_argument("--spec")
    ap.add_argument("--original", help="template the deck was built from, if any")
    ap.add_argument("--outdir", default="qa")
    ap.add_argument("--fail-diff", type=float, default=26.0)
    ap.add_argument("--fail-blob", type=int, default=4000)
    a = ap.parse_args()

    spec = json.load(open(a.spec)) if a.spec else None
    report = {"deck": a.deck, "checks": {}}
    failed = False

    ok, log = check_structure(a.deck, a.original)
    report["checks"]["structure"] = {"pass": ok, "log": log}
    print(f"[{'PASS' if ok else 'FAIL'}] structure")
    if not ok:
        failed = True
        print("      " + log.replace("\n", "\n      "))

    ok, problems, txt = check_text(a.deck, spec)
    report["checks"]["text"] = {"pass": ok, "problems": problems}
    print(f"[{'PASS' if ok else 'FAIL'}] text")
    for p in problems:
        failed = True
        print("      " + p)

    renders = render(a.deck, a.outdir)
    report["checks"]["geometry"] = []
    for i, ren in enumerate(renders):
        src = a.sources[i] if i < len(a.sources) else "-"
        if src == "-" or not os.path.exists(src):
            print(f"[skip] slide {i+1} geometry (no source)")
            continue
        ov = os.path.join(a.outdir, f"overlay-{i+1}.png")
        res = compare(src, ren, ov, a.fail_blob)
        res["slide"] = i + 1
        res["overlay"] = ov
        bad = res["mean_diff"] > a.fail_diff or res["blobs"] or res["drift"]
        res["pass"] = not bad
        report["checks"]["geometry"].append(res)
        print(f"[{'PASS' if not bad else 'FAIL'}] slide {i+1} geometry  "
              f"mean_diff={res['mean_diff']} blobs={len(res['blobs'])} drift={len(res['drift'])}")
        for b in res["blobs"]:
            print(f"      mismatch region at source px x={b['x']} y={b['y']} "
                  f"w={b['w']} h={b['h']} (area {b['area']})")
        for d in res["drift"]:
            print(f"      element offset in tile {d['tile']}: dx={d['dx']} dy={d['dy']}")
        if bad:
            failed = True
        print(f"      overlay: {ov}")

    os.makedirs(a.outdir, exist_ok=True)
    json.dump(report, open(os.path.join(a.outdir, "report.json"), "w"), indent=2)
    print("\nreport:", os.path.join(a.outdir, "report.json"))
    print("RESULT:", "FAIL — fix the generator and re-run" if failed else "PASS")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
