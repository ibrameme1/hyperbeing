/**
 * build_template.js — starting point for STEP 3 (build) of the image->pptx workflow.
 *
 *   node build_template.js
 *
 * The one rule that makes this whole approach work: you author every coordinate in
 * SOURCE-IMAGE PIXELS, exactly the numbers probe.py printed. px() converts to inches.
 * Never hand-convert. If you measured 296, you type 296.
 *
 * Everything below the CONFIG block is generic; the per-slide code is the part you edit.
 */
const pptxgen = require("pptxgenjs");

// ─────────────────────────── CONFIG ───────────────────────────
const SRC_W = 1376;                 // pixel width of the source image
const SLIDE_W = 13.3333, SLIDE_H = 7.5;   // LAYOUT_WIDE inches
const FONT = "Arial";               // condensed-bold headlines in AI images usually
                                    // map to Arial/Helvetica Neue; pick one and commit
const px = (p) => (p * SLIDE_W) / SRC_W;  // px -> inches (uniform on both axes)

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";        // MUST be set before any addSlide()

// ─────────────────────── COMPONENT HELPERS ───────────────────────
// Each takes source-pixel geometry so it reads like the measurements.

const bg = (s, color) => { s.background = { color }; };

const text = (s, str, { x, y, w, h, size = 14, color = "FFFFFF", bold = false,
                        italic = false, align = "left", valign = "middle",
                        line = 1.1, spacing = 0 } = {}) =>
  s.addText(str, {
    x: px(x), y: px(y), w: px(w), h: px(h), fontFace: FONT, fontSize: size,
    color, bold, italic, align, valign, margin: 0,
    lineSpacingMultiple: line, charSpacing: spacing,
  });

// multi-colour headline: runs = [{t:"FORMAT 01: ", c:"F52D6E"}, {t:"POV SKITS", c:"FFFFFF"}]
const richText = (s, runs, opts) =>
  text(s, runs.map(r => ({ text: r.t, options: { color: r.c, bold: r.b, italic: r.i,
                                                 fontSize: r.size, breakLine: r.br } })), opts);

const rect = (s, { x, y, w, h, fill, line, lineW = 0, radius = null }) =>
  s.addShape(radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
    x: px(x), y: px(y), w: px(w), h: px(h),
    fill: { color: fill }, line: { color: line || fill, width: lineW },
    ...(radius ? { rectRadius: radius } : {}),
  });

const circle = (s, { cx, cy, d, fill, line, lineW = 0 }) =>
  s.addShape(pres.ShapeType.ellipse, {
    x: px(cx - d / 2), y: px(cy - d / 2), w: px(d), h: px(d),
    fill: { color: fill }, line: { color: line || fill, width: lineW },
  });

const hline = (s, { x, y, w, color, width = 1 }) =>
  s.addShape(pres.ShapeType.line, { x: px(x), y: px(y), w: px(w), h: 0,
    line: { color, width } });

// photo/cutout produced by `probe.py cutout` — pass the SAME cx,cy,w,h,rot
const cutout = (s, path, { cx, cy, w, h, rot = 0 }) =>
  s.addImage({ path, x: px(cx - w / 2), y: px(cy - h / 2), w: px(w), h: px(h), rotate: rot });

// A data-driven horizontal bar row. Bar length is COMPUTED from the value, so the
// chart stays truthful when someone edits the numbers.
const barRow = (s, { x, y, w, h, label, value, max, note, track, bar, valueColor,
                     labelW = 240, barX, barMax, highlight = null }) => {
  rect(s, { x, y, w, h, fill: track, line: highlight || track, lineW: highlight ? 2 : 1, radius: 0.04 });
  text(s, label, { x: x + 14, y, w: labelW, h, size: 14, bold: true, color: "0B1B33" });
  const len = (Math.abs(value) / max) * barMax;
  rect(s, { x: barX, y: y + 5, w: len, h: h - 10, fill: bar });
  text(s, `${value}%`, { x: barX + len - 90, y: y + 5, w: 80, h: h - 10, size: 13.5,
                         bold: true, color: valueColor, align: "right" });
  if (note) text(s, note, { x: barX + len + 8, y, w: x + w - 10 - (barX + len + 8), h,
                            size: 10.5, color: "0B1B33" });
};

// Native, editable chart. ALWAYS prefer this over a picture of a chart:
// double-clicking it in PowerPoint opens the real data sheet.
const donut = (s, { x, y, w, h, labels, values, colors, hole = 58, borderColor = "FFFFFF" }) =>
  s.addChart(pres.ChartType.doughnut, [{ name: "series", labels, values }], {
    x: px(x), y: px(y), w: px(w), h: px(h), holeSize: hole,
    chartColors: colors, dataBorder: { pt: 2, color: borderColor },
    showLegend: false, showTitle: false, showValue: false, showPercent: false,
  });

const bars = (s, { x, y, w, h, labels, values, color, valAxisColor = "9AA5B1" }) =>
  s.addChart(pres.ChartType.bar, [{ name: "series", labels, values }], {
    x: px(x), y: px(y), w: px(w), h: px(h), barDir: "bar",
    chartColors: [color], showValue: true, dataLabelPosition: "outEnd",
    showLegend: false, showTitle: false,
    catAxisLabelColor: valAxisColor, valAxisLabelColor: valAxisColor,
    valGridLine: { color: "E4E8EC", size: 1 }, catGridLine: { style: "none" },
  });

// ─────────────────────────── SLIDE ───────────────────────────
{
  const s = pres.addSlide();
  const PALETTE = { ink: "000000", accent: "F52D6E", ok: "2BE86A", panel: "E4F0FE" };
  bg(s, PALETTE.ink);

  // 1. photographic / non-reconstructable regions first (they sit at the back)
  // cutout(s, "cutouts/phone1.png", { cx: 166, cy: 516, w: 208, h: 306, rot: 0 });

  // 2. shapes
  // rect(s, { x: 40, y: 206, w: 266, h: 155, fill: PALETTE.accent, radius: 0.12 });

  // 3. charts (native, data-driven)
  // donut(s, { x: 150, y: 190, w: 500, h: 470,
  //            labels: ["Unilever", "P&G", "Us", "Local"], values: [38, 21, 12, 29],
  //            colors: ["009CD9", "055A93", "FC3A91", "1E3D5C"], borderColor: "022342" });

  // 4. text last (always on top)
  richText(s, [
    { t: "HEADLINE PART ONE ", c: PALETTE.accent },
    { t: "PART TWO.", c: "FFFFFF" },
  ], { x: 36, y: 34, w: 1310, h: 66, size: 31, bold: true, spacing: -0.5 });

  // 5. speaker notes = the data behind the slide, so the numbers survive the deck
  s.addNotes("Source figures: ...");
}

pres.writeFile({ fileName: "out.pptx" }).then(f => console.log("wrote", f));
