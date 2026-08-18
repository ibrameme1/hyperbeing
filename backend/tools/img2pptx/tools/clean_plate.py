#!/usr/bin/env python3
"""
clean_plate.py — STEP 2.5 of the image->pptx workflow: PRODUCE THE CLEAN PLATE.

The problem this solves ("ghosting"):
  A source slide is FLAT. A pink callout card drawn on top of a phone photo is,
  in the PNG, just pixels of the phone photo. If you crop that phone as a raster
  cutout AND rebuild the card as a live shape+textbox, the card now exists TWICE:
  once live, once baked into the image under it. They line up perfectly, so the
  slide looks right — until someone drags either object and a half-card fragment
  slides out from underneath.

The rule:
  ANY region you rebuild as a live object (text, shape, chart) MUST be erased
  from the raster that sits beneath it, BEFORE you crop.

  Likewise, when raster pieces overlap each other, the piece underneath is
  genuinely missing pixels where the top piece covers it. Fill those too, so the
  lower piece is whole when it is moved.

Usage:
  python clean_plate.py IMG --spec regions.json --out clean.png [--debug]
  python clean_plate.py IMG --rect X,Y,W,H [--rect ...] --out clean.png

regions.json:
{
  "regions": [
    {"type": "rect",      "x": 288, "y": 197, "w": 300, "h": 100, "radius": 14},
    {"type": "roundrect", "x": 40,  "y": 206, "w": 266, "h": 155, "radius": 18},
    {"type": "ellipse",   "cx": 760, "cy": 277, "d": 60},
    {"type": "poly",      "points": [[10,10],[80,12],[78,60],[8,58]]},
    {"type": "text",      "x": 36, "y": 24, "w": 1310, "h": 90}
  ]
}
Every type accepts an optional "grow": N to dilate that region by N px (default 3),
which matters because anti-aliased text and glow/shadow bleed past the nominal box.

Method:
  1. Coarse fill at 1/4 scale (fast, gives a smooth plausible colour field even for
     large regions, where full-res Telea would streak).
  2. Full-res Telea pass over a thin dilated collar to blend the seam.
Recovering the true hidden pixels is impossible — they were never captured. The goal
is a plausible fill, which is sufficient: the live object sits back on top of it, and
the fill is only ever seen if someone moves that object, which is exactly the moment
the old baked-in ghost would have appeared instead.
"""
import argparse, json, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw


def build_mask(shape, regions, default_grow=3):
    """Rasterise the regions to remove into a uint8 mask (255 = remove)."""
    h, w = shape[:2]
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for r in regions:
        g = int(r.get("grow", default_grow))
        t = r.get("type", "rect")
        if t in ("rect", "roundrect", "text"):
            x, y = float(r["x"]) - g, float(r["y"]) - g
            x1, y1 = x + float(r["w"]) + 2 * g, y + float(r["h"]) + 2 * g
            rad = int(r.get("radius", 0))
            if rad > 0:
                d.rounded_rectangle([x, y, x1, y1], radius=rad + g, fill=255)
            else:
                d.rectangle([x, y, x1, y1], fill=255)
        elif t == "ellipse":
            if "d" in r:
                cx, cy, rx = float(r["cx"]), float(r["cy"]), float(r["d"]) / 2 + g
                ry = rx
            else:
                cx, cy = float(r["cx"]), float(r["cy"])
                rx, ry = float(r["rx"]) + g, float(r["ry"]) + g
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        elif t == "poly":
            pts = [tuple(p) for p in r["points"]]
            d.polygon(pts, fill=255)
            if g:
                d.line(pts + [pts[0]], fill=255, width=g * 2)
        else:
            raise SystemExit("unknown region type: %s" % t)
    return np.array(m)


def auto_expand(img, mask, reach=34, tol=64):
    """Absorb the halo the nominal box misses.

    A rebuilt card is never just its rectangle: it carries a drop shadow, an outer
    glow, and anti-aliased edges that extend past the geometry in the builder. If
    those survive, inpaint samples THEM as 'background' and paints the card's own
    colour straight back into the hole — a pink smear where the pink card was.

    So: take the dominant colour inside the region, then sweep a band outside it and
    swallow anything close to that colour. Purely local, so it cannot run away across
    the whole slide.
    """
    inner = cv2.erode(mask, np.ones((5, 5), np.uint8), iterations=2)
    src = inner if (inner > 0).sum() > 200 else mask
    if (src > 0).sum() == 0:
        return mask
    dom = np.median(img[src > 0].reshape(-1, 3), axis=0)

    band = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=reach)
    band = cv2.subtract(band, mask)
    diff = np.linalg.norm(img.astype(np.float32) - dom[None, None, :], axis=2)
    halo = ((band > 0) & (diff < tol)).astype(np.uint8) * 255

    out = np.maximum(mask, halo)
    # close pinholes and smooth the resulting outline
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    out = cv2.dilate(out, np.ones((3, 3), np.uint8), iterations=2)
    return out


def coarse_fill(img, mask, scale=4):
    """Inpaint at reduced scale so large regions get a smooth field, not streaks."""
    h, w = img.shape[:2]
    sw, sh = max(1, w // scale), max(1, h // scale)
    small = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
    smask = cv2.resize(mask, (sw, sh), interpolation=cv2.INTER_NEAREST)
    smask = cv2.dilate(smask, np.ones((3, 3), np.uint8), iterations=1)
    filled = cv2.inpaint(small, smask, 6, cv2.INPAINT_TELEA)
    return cv2.resize(filled, (w, h), interpolation=cv2.INTER_LINEAR)


def clean(img, mask):
    out = img.copy()
    # 1. coarse plausible field inside the holes
    coarse = coarse_fill(img, mask)
    idx = mask > 0
    out[idx] = coarse[idx]
    # 2. full-res pass over a thin collar to kill the hard seam
    collar = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2) - \
             cv2.erode(mask, np.ones((5, 5), np.uint8), iterations=1)
    collar = np.clip(collar, 0, 255).astype(np.uint8)
    out = cv2.inpaint(out, collar, 4, cv2.INPAINT_TELEA)
    # 3. gentle blur strictly inside the hole so any residual texture reads as background
    blurred = cv2.GaussianBlur(out, (0, 0), 3)
    inner = cv2.erode(mask, np.ones((5, 5), np.uint8), iterations=2)
    ii = inner > 0
    out[ii] = blurred[ii]
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("img")
    p.add_argument("--spec")
    p.add_argument("--rect", action="append", default=[], metavar="X,Y,W,H")
    p.add_argument("--grow", type=int, default=3)
    p.add_argument("--auto-expand", type=int, default=34,
                   help="px reach to swallow glow/shadow/AA around each region (0=off)")
    p.add_argument("--tol", type=int, default=64,
                   help="colour distance for auto-expand")
    p.add_argument("--out", required=True)
    p.add_argument("--debug", action="store_true", help="also write OUT.mask.png")
    a = p.parse_args()

    img = cv2.imread(a.img, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit("cannot read %s" % a.img)

    regions = []
    if a.spec:
        regions += json.load(open(a.spec))["regions"]
    for r in a.rect:
        x, y, w, h = [float(v) for v in r.split(",")]
        regions.append({"type": "rect", "x": x, "y": y, "w": w, "h": h})
    if not regions:
        raise SystemExit("no regions given")

    # Expand each region against its OWN dominant colour and union afterwards.
    # Done globally, a bright card would set the reference colour for a dim one
    # nearby and swallow legitimate content (a green UI badge next to a green card).
    mask = np.zeros(img.shape[:2], np.uint8)
    for r in regions:
        m = build_mask(img.shape, [r], a.grow)
        # Bare text needs only an anti-aliasing collar. Filled cards carry drop
        # shadows and neon glow and need the wide sweep. Defaulting both to wide
        # makes text regions eat the artwork's own glow around them.
        is_text = r.get("type") == "text"
        reach = int(r.get("expand", min(a.auto_expand, 8) if is_text else a.auto_expand))
        tol = int(r.get("tol", 40 if is_text else a.tol))
        if reach > 0:
            m = auto_expand(img, m, reach, tol)
        mask = np.maximum(mask, m)
    out = clean(img, mask)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    cv2.imwrite(a.out, out)
    if a.debug:
        cv2.imwrite(a.out + ".mask.png", mask)
    print(json.dumps({"file": a.out, "regions": len(regions),
                      "cleaned_px": int((mask > 0).sum())}))


if __name__ == "__main__":
    main()
