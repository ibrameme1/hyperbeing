#!/usr/bin/env python3
"""
probe.py — measurement toolkit for STEP 2 (measure) of the image->pptx workflow.

Everything reports coordinates in SOURCE PIXELS of the input image, which is the
single coordinate system the builder script also uses.

Usage:
  python probe.py grid      IMG [--step 25]            # numbered grid overlay -> IMG.grid.jpg
  python probe.py palette   IMG [--n 10]               # dominant colors as PPT hex
  python probe.py pick      IMG X Y [X Y ...]          # color at exact points
  python probe.py bands     IMG                        # full-width horizontal bands (headers/footers)
  python probe.py boxes     IMG [--min-area 3000]      # rectangular panels / cards / rows
  python probe.py runs      IMG --row Y  | --col X     # colored segment runs along a line (bar lengths)
  python probe.py objects   IMG [--bg dark|light]      # separated foreground objects + rotation angle
  python probe.py crop      IMG X0 Y0 X1 Y1 OUT.png    # crop a region (photos you cannot rebuild)
  python probe.py cutout    IMG CX CY W H ROT OUT.png  # de-rotate + rounded-corner alpha cutout
"""
import argparse, json, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw


def load(p):
    return cv2.imread(p, cv2.IMREAD_COLOR)


def hexc(bgr):
    b, g, r = [int(v) for v in bgr[:3]]
    return "%02X%02X%02X" % (r, g, b)


def cmd_grid(a):
    im = Image.open(a.img).convert("RGB")
    d = ImageDraw.Draw(im)
    W, H = im.size
    for x in range(0, W, a.step):
        major = x % (a.step * 4) == 0
        d.line([(x, 0), (x, H)], fill=(255, 255, 0) if major else (80, 80, 0))
        if major:
            d.text((x + 2, 2), str(x), fill=(255, 255, 0))
    for y in range(0, H, a.step):
        major = y % (a.step * 4) == 0
        d.line([(0, y), (W, y)], fill=(0, 255, 255) if major else (0, 80, 80))
        if major:
            d.text((2, y + 2), str(y), fill=(0, 255, 255))
    out = a.img + ".grid.jpg"
    im.save(out, quality=92)
    print(out, im.size)


def cmd_palette(a):
    im = load(a.img).reshape(-1, 3).astype(np.float32)
    im = im[::max(1, len(im) // 60000)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, lbl, cen = cv2.kmeans(im, a.n, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(lbl.ravel(), minlength=a.n)
    for i in np.argsort(-counts):
        print("%-8s %5.1f%%" % (hexc(cen[i]), 100 * counts[i] / counts.sum()))


def cmd_pick(a):
    im = load(a.img)
    pts = [int(v) for v in a.coords]
    for x, y in zip(pts[0::2], pts[1::2]):
        print("(%d,%d) %s" % (x, y, hexc(im[y, x])))


def cmd_bands(a):
    """Rows of the image that are a near-uniform full-width color = header/footer strips."""
    im = load(a.img)
    rows = im.reshape(im.shape[0], -1, 3)
    med = np.median(rows, axis=1)
    std = rows.std(axis=1).mean(axis=1)
    uni = std < 18
    y = 0
    while y < len(uni):
        if uni[y]:
            s = y
            while y < len(uni) and uni[y] and np.abs(med[y] - med[s]).max() < 12:
                y += 1
            if y - s > 12:
                print("band y=%d..%d  h=%d  color=%s" % (s, y, y - s, hexc(med[s])))
        else:
            y += 1


def cmd_boxes(a):
    """Card / row / panel rectangles, found from edges. Prints x y w h in source px."""
    im = load(a.img)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    e = cv2.Canny(g, 40, 130)
    e = cv2.dilate(e, np.ones((3, 3), np.uint8), iterations=1)
    cnts, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if w * h < a.min_area or w < 25 or h < 15:
            continue
        peri = cv2.arcLength(c, True)
        ap = cv2.approxPolyDP(c, 0.02 * peri, True)
        rectish = len(ap) in (4, 5, 6, 7, 8) and (w * h) and cv2.contourArea(c) / (w * h) > 0.55
        if rectish:
            out.append((x, y, w, h, hexc(im[y + h // 2, x + w // 2])))
    out.sort(key=lambda r: (r[1], r[0]))
    seen = []
    for x, y, w, h, col in out:
        if any(abs(x - X) < 8 and abs(y - Y) < 8 and abs(w - W) < 12 for X, Y, W, _, _ in seen):
            continue
        seen.append((x, y, w, h, col))
        print("box x=%-5d y=%-5d w=%-5d h=%-4d fill=%s" % (x, y, w, h, col))


def cmd_runs(a):
    """Contiguous same-color segments along a row/column. Use for bar-chart lengths."""
    im = load(a.img)
    line = im[a.row] if a.row is not None else im[:, a.col]
    segs, s = [], 0
    for i in range(1, len(line)):
        if np.abs(line[i].astype(int) - line[s].astype(int)).max() > 26:
            if i - s >= a.min_len:
                segs.append((s, i, hexc(line[(s + i) // 2])))
            s = i
    if len(line) - s >= a.min_len:
        segs.append((s, len(line), hexc(line[(s + len(line)) // 2])))
    for s, e, c in segs:
        print("%d..%d  len=%d  %s" % (s, e, e - s, c))


def cmd_objects(a):
    """Foreground objects (phone mockups, product shots) + their rotation angle."""
    im = load(a.img)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    m = (g > 16).astype(np.uint8) if a.bg == "dark" else (g < 238).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    for box in (a.exclude or []):
        x0, y0, x1, y1 = [int(v) for v in box.split(",")]
        m[y0:y1, x0:x1] = 0                                  # blank overlays/callouts first
    if a.erode:
        m = cv2.erode(m, np.ones((a.erode, a.erode), np.uint8))   # split touching objects
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    for i in (np.argsort(-st[1:, 4]) + 1)[: a.top]:
        if st[i, 4] < a.min_area:
            continue
        pts = cv2.findNonZero((lab == i).astype(np.uint8))
        (cx, cy), (w, h), ang = cv2.minAreaRect(pts)
        if w > h:
            w, h, ang = h, w, ang + 90
        while ang > 45:
            ang -= 90
            w, h = h, w
        while ang < -45:
            ang += 90
            w, h = h, w
        print("obj area=%-7d center=(%.0f,%.0f) w=%.0f h=%.0f rot=%.1f"
              % (st[i, 4], cx, cy, w, h, ang))


def cmd_crop(a):
    Image.open(a.img).convert("RGB").crop((a.x0, a.y0, a.x1, a.y1)).save(a.out)
    print(a.out)


def cmd_cutout(a):
    """De-rotate around (cx,cy) by rot, crop w x h, apply rounded-corner alpha.
    Feed the SAME cx,cy,w,h,rot into the builder's addImage + rotate."""
    im = load(a.img)
    M = cv2.getRotationMatrix2D((a.cx, a.cy), a.rot, 1.0)
    rot = cv2.warpAffine(im, M, (im.shape[1], im.shape[0]), flags=cv2.INTER_CUBIC)
    x0, y0 = int(round(a.cx - a.w / 2)), int(round(a.cy - a.h / 2))
    crop = rot[y0:y0 + int(a.h), x0:x0 + int(a.w)]
    pil = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)).convert("RGBA")
    mask = Image.new("L", pil.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pil.size[0] - 1, pil.size[1] - 1],
                                          radius=a.radius, fill=255)
    pil.putalpha(mask)
    pil.save(a.out)
    print(json.dumps({"file": a.out, "cx": a.cx, "cy": a.cy, "w": a.w, "h": a.h, "rot": a.rot}))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("grid"); g.add_argument("img"); g.add_argument("--step", type=int, default=25); g.set_defaults(f=cmd_grid)
    q = sub.add_parser("palette"); q.add_argument("img"); q.add_argument("--n", type=int, default=10); q.set_defaults(f=cmd_palette)
    k = sub.add_parser("pick"); k.add_argument("img"); k.add_argument("coords", nargs="+"); k.set_defaults(f=cmd_pick)
    b = sub.add_parser("bands"); b.add_argument("img"); b.set_defaults(f=cmd_bands)
    x = sub.add_parser("boxes"); x.add_argument("img"); x.add_argument("--min-area", type=int, default=3000); x.set_defaults(f=cmd_boxes)
    r = sub.add_parser("runs"); r.add_argument("img"); r.add_argument("--row", type=int); r.add_argument("--col", type=int); r.add_argument("--min-len", type=int, default=8); r.set_defaults(f=cmd_runs)
    o = sub.add_parser("objects"); o.add_argument("img"); o.add_argument("--bg", default="dark", choices=["dark", "light"]); o.add_argument("--top", type=int, default=10); o.add_argument("--min-area", type=int, default=4000)
    o.add_argument("--exclude", action="append", metavar="x0,y0,x1,y1")
    o.add_argument("--erode", type=int, default=0)
    o.set_defaults(f=cmd_objects)
    c = sub.add_parser("crop"); c.add_argument("img"); [c.add_argument(v, type=int) for v in ("x0", "y0", "x1", "y1")]; c.add_argument("out"); c.set_defaults(f=cmd_crop)
    u = sub.add_parser("cutout"); u.add_argument("img"); [u.add_argument(v, type=float) for v in ("cx", "cy", "w", "h", "rot")]; u.add_argument("out"); u.add_argument("--radius", type=int, default=26); u.set_defaults(f=cmd_cutout)

    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
