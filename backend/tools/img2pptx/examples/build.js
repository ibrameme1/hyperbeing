/**
 * build.js — Pakistan Home Care / Knorr Phase 2 strategy deck
 * 13 slides reconstructed from AI-rendered source images into an editable PPTX.
 * Coordinates authored in SOURCE PIXELS (1376x768), converted via px().
 */
const pptxgen = require("pptxgenjs");

// ─────────────────────────── CONFIG ───────────────────────────
const SRC_W = 1376;
const SLIDE_W = 13.3333, SLIDE_H = 7.5;
const FONT = "Arial Black";
const FONT_BODY = "Arial";
const px = (p) => (p * SLIDE_W) / SRC_W;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";

// ─────────────────────── COMPONENT HELPERS ───────────────────────
const bg = (s, color) => { s.background = { color }; };

const text = (s, str, { x, y, w, h, size = 14, color = "FFFFFF", bold = false,
                        italic = false, align = "left", valign = "middle",
                        line = 1.1, spacing = 0, fontFace = FONT_BODY } = {}) =>
  s.addText(str, {
    x: px(x), y: px(y), w: px(w), h: px(h), fontFace, fontSize: size,
    color, bold, italic, align, valign, margin: 0,
    lineSpacingMultiple: line, charSpacing: spacing,
  });

const richText = (s, runs, opts) =>
  text(s, runs.map(r => ({ text: r.t, options: { color: r.c, bold: r.b !== false, italic: r.i,
                                                 fontSize: r.size, breakLine: r.br,
                                                 fontFace: r.f || opts.fontFace || FONT } })), opts);

const rect = (s, { x, y, w, h, fill, line, lineW = 0, radius = null }) =>
  s.addShape(radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
    x: px(x), y: px(y), w: px(w), h: px(h),
    fill: fill ? { color: fill } : { type: "none" }, line: { color: line || fill || "FFFFFF", width: lineW },
    ...(radius ? { rectRadius: radius } : {}),
  });

const circle = (s, { cx, cy, d, fill, line, lineW = 0 }) =>
  s.addShape(pres.ShapeType.ellipse, {
    x: px(cx - d / 2), y: px(cy - d / 2), w: px(d), h: px(d),
    fill: fill ? { color: fill } : { type: "none" }, line: { color: line || fill || "FFFFFF", width: lineW },
  });

const hline = (s, { x, y, w, color, width = 1, dash }) =>
  s.addShape(pres.ShapeType.line, { x: px(x), y: px(y), w: px(w), h: 0,
    line: { color, width, ...(dash ? { dashType: dash } : {}) } });

const vline = (s, { x, y, h, color, width = 1 }) =>
  s.addShape(pres.ShapeType.line, { x: px(x), y: px(y), w: 0, h: px(h),
    line: { color, width } });

const cutout = (s, path, { cx, cy, w, h, rot = 0 }) =>
  s.addImage({ path, x: px(cx - w / 2), y: px(cy - h / 2), w: px(w), h: px(h), rotate: rot });

const img = (s, path, { x, y, w, h, rot = 0 }) =>
  s.addImage({ path, x: px(x), y: px(y), w: px(w), h: px(h), rotate: rot });

const donut = (s, { x, y, w, h, labels, values, colors, hole = 55, borderColor = "022342" }) =>
  s.addChart(pres.ChartType.doughnut, [{ name: "series", labels, values }], {
    x: px(x), y: px(y), w: px(w), h: px(h), holeSize: hole,
    chartColors: colors, dataBorder: { pt: 2, color: borderColor },
    showLegend: false, showTitle: false, showValue: false, showPercent: false,
  });

// 100%-stacked horizontal bar (used for urban/rural mix comparison)
const stackedBarH = (s, { x, y, w, h, categories, series, colors }) =>
  s.addChart(pres.ChartType.bar,
    series.map((ser, i) => ({ name: ser.name, labels: categories, values: ser.values })),
    {
      x: px(x), y: px(y), w: px(w), h: px(h), barDir: "bar", barGrouping: "percentStacked",
      chartColors: colors, showLegend: true, legendPos: "t", legendColor: "FFFFFF",
      showTitle: false, showValue: false, catAxisLabelColor: "FFFFFF", valAxisLabelColor: "FFFFFF",
      catAxisLineColor: "5A7086", valAxisLineColor: "5A7086",
      valGridLine: { color: "1E3554", size: 1 }, catGridLine: { style: "none" },
      dataLabelColor: "FFFFFF",
    });

const stackedColumn = (s, { x, y, w, h, categories, series, colors }) =>
  s.addChart(pres.ChartType.bar,
    series.map((ser) => ({ name: ser.name, labels: categories, values: ser.values })),
    {
      x: px(x), y: px(y), w: px(w), h: px(h), barDir: "col", barGrouping: "stacked",
      chartColors: colors, showLegend: false, showTitle: false,
      catAxisLabelColor: "FFFFFF", valAxisLabelColor: "FFFFFF",
      catAxisLineColor: "5A7086", valAxisLineColor: "5A7086",
      valGridLine: { color: "1E3554", size: 1 }, catGridLine: { style: "none" },
    });

const lineChart = (s, { x, y, w, h, categories, series, colors }) =>
  s.addChart(pres.ChartType.line,
    series.map((ser) => ({ name: ser.name, labels: categories, values: ser.values })),
    {
      x: px(x), y: px(y), w: px(w), h: px(h), chartColors: colors,
      showLegend: false, showTitle: false, lineDataSymbol: "none", lineSize: 3,
      catAxisHidden: true, valAxisHidden: true, catAxisLineShow: false, valAxisLineShow: false,
      showValAxisTitle: false, plotArea: { fill: { type: "none" } }, chartArea: { fill: { type: "none" } },
    });

const S = "cutouts/", SRC = "src/";
const CUTS = { s01: SRC, s02: SRC }; // unused placeholder

function footer(s, { textLine1, textLine2, bgColor, y = 665, h = 103, accent = "FFFFFF", accent2 = "2BE86A" }) {
  rect(s, { x: 0, y, w: 1376, h, fill: bgColor });
  text(s, textLine1, { x: 0, y: y + 12, w: 1376, h: 34, size: 19, bold: true, color: "FFFFFF", align: "center" });
  text(s, textLine2, { x: 0, y: y + 46, w: 1376, h: 30, size: 15, italic: true, bold: false, color: accent2, align: "center", fontFace: FONT_BODY });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 1 — Rural Pakistan revenue leakage
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const P = { ink: "0B1825", accent: "FA317F", blue: "089BD2", darkblue: "0D2958", green: "11311A", greenBorder: "2BE86A" };
  bg(s, P.ink);

  richText(s, [
    { t: "RURAL PAKISTAN IS 38% OF CATEGORY VALUE BUT ONLY\n19% OF OUR REVENUE — ", c: "FFFFFF" },
    { t: "A CRITICAL LEAKAGE", c: P.accent },
  ], { x: 36, y: 24, w: 1310, h: 90, size: 25, bold: true, spacing: -0.3, line: 1.05 });

  text(s, "\u2018Urban vs. rural revenue mix: us vs. Unilever vs. P&G, 2024 — 140 million consumers we are strategically absent from.\u2019",
    { x: 36, y: 118, w: 1300, h: 30, size: 13.5, italic: true, color: "D7E4EE" });

  // stacked bar chart: Urban / Rural mix per company
  stackedBarH(s, {
    x: 108, y: 195, w: 560, h: 345,
    categories: ["Our Company", "P&G", "Unilever"],
    series: [
      { name: "Urban", values: [81, 67, 59] },
      { name: "Rural", values: [19, 33, 41] },
    ],
    colors: [P.darkblue, P.blue],
  });
  // callouts on bars (approximate, on top of chart)
  text(s, "59%", { x: 210, y: 268, w: 80, h: 30, size: 15, bold: true, color: "FFFFFF" });
  text(s, "41%", { x: 500, y: 268, w: 80, h: 30, size: 15, bold: true, color: "FFFFFF" });
  text(s, "67%", { x: 240, y: 373, w: 80, h: 30, size: 15, bold: true, color: "FFFFFF" });
  text(s, "33%", { x: 528, y: 373, w: 80, h: 30, size: 15, bold: true, color: "FFFFFF" });
  text(s, "19%", { x: 570, y: 480, w: 80, h: 30, size: 15, bold: true, color: "FFFFFF" });
  text(s, "41% rural mix \u00b7 PKR 650K outlet reach", { x: 340, y: 310, w: 300, h: 20, size: 10.5, color: "FFFFFF" });
  text(s, "33% rural mix.", { x: 480, y: 415, w: 200, h: 18, size: 10.5, color: "FFFFFF" });
  text(s, "19% rural mix \u2014 22pts below Unilever.", { x: 145, y: 495, w: 320, h: 22, size: 11, bold: true, color: P.accent });

  rect(s, { x: 35, y: 607, w: 643, h: 48, fill: P.blue, radius: 0.06 });
  text(s, "RURAL PAKISTAN = 63% OF POPULATION \u00b7 140MN CONSUMERS\nPKR 68BN HOME CARE MARKET \u00b7 10% CAGR",
    { x: 45, y: 607, w: 623, h: 48, size: 12, bold: true, color: "FFFFFF", align: "center", line: 1.15 });

  // right panel
  text(s, "THE RURAL GAP EXPLAINED", { x: 700, y: 196, w: 500, h: 26, size: 16, bold: true, color: "FFFFFF" });

  const rows = [
    { label: "DISTRIBUTION\nGAP", stat: "We cover 180K rural outlets.\nUnilever covers 650K.",
      cons: "Unilever's rural footprint is 3.6x\nours — every uncovered outlet\nis a competitor's shelf.",
      consColor: "2BE86A", extra: "\u2191 Closing to 400K outlets by 2027\nis the distribution imperative.", y: 232 },
    { label: "SKU RELEVANCE\nGAP", stat: "68% of rural consumers purchase\nin sachets or \u2264250ml pack sizes\n— our portfolio skews 500ml+.",
      cons: "Pack size mismatch is\ninvisibility on rural shelves.", consColor: "FFFFFF", extra: "", y: 358 },
    { label: "ECONOMICS\nGAP", stat: "Rural home care growing at 10%\nCAGR vs. urban 7% — rural is\naccelerating faster.",
      cons: "We are growing slowest in the\nfastest-growing geography.", consColor: "FA317F", extra: "", y: 458 },
  ];
  rows.forEach(r => {
    circle(s, { cx: 760, cy: r.y + 45, d: 60, fill: "0C2857", line: "2BE86A", lineW: 1 });
    text(s, r.label, { x: 700, y: r.y + 20, w: 122, h: 50, size: 10, bold: true, color: "9AB4C8", align: "center" });
    text(s, "STAT", { x: 830, y: r.y - 4, w: 100, h: 16, size: 9, bold: true, color: "9AB4C8" });
    text(s, r.stat, { x: 830, y: r.y + 12, w: 260, h: 60, size: 12, color: "FFFFFF", line: 1.15 });
    text(s, "CONSEQUENCE", { x: 1100, y: r.y - 4, w: 150, h: 16, size: 9, bold: true, color: "9AB4C8" });
    text(s, r.cons, { x: 1100, y: r.y + 12, w: 235, h: 55, size: 11.5, bold: true, color: r.consColor, line: 1.15 });
    if (r.extra) text(s, r.extra, { x: 1100, y: r.y + 62, w: 235, h: 34, size: 9.5, color: "C9D6E0", line: 1.1 });
  });
  hline(s, { x: 700, y: 344, w: 640, h: 1, color: "223A54" });
  hline(s, { x: 700, y: 447, w: 640, h: 1, color: "223A54" });

  // bottom right cards
  rect(s, { x: 700, y: 562, w: 300, h: 88, fill: "112B18", line: "2BE86A", lineW: 1.5, radius: 0.08 });
  text(s, "\ud83c\udfe0 Rural Action Target:", { x: 716, y: 570, w: 280, h: 22, size: 12.5, bold: true, color: "2BE86A" });
  richText(s, [
    { t: "Grow rural revenue mix from ", c: "FFFFFF", b: false },
    { t: "19% to 35% by 2029", c: "FFFFFF" },
    { t: " —\nadding PKR 9.4Bn in incremental rural revenue.", c: "FFFFFF", b: false },
  ], { x: 716, y: 592, w: 272, h: 55, size: 11.5, fontFace: FONT_BODY, line: 1.15 });

  rect(s, { x: 998, y: 549, w: 327, h: 42, fill: "FA317F", radius: 0.5 });
  text(s, "\u26a1 10% CAGR — Rural is the growth engine,\nnot the afterthought.",
    { x: 1006, y: 549, w: 311, h: 42, size: 9.5, bold: true, color: "FFFFFF", align: "center", line: 1.1 });

  footer(s, {
    textLine1: "140 MILLION RURAL CONSUMERS. WE REACH FEWER THAN 1 IN 3 OUTLETS THAT SERVE THEM.",
    textLine2: "This is not a rural problem. This is a distribution strategy failure.",
    bgColor: "000000", y: 665, h: 103,
  });

  s.addNotes("Rural mix: Our Co 19% (81/19 urban/rural), P&G 33% (67/33), Unilever 41% (59/41). Rural market = 63% of population, 140M consumers, PKR 68Bn, 10% CAGR. Distribution gap: 180K outlets (us) vs 650K (Unilever), 3.6x gap, target 400K by 2027. SKU gap: 68% of rural purchases are sachets/\u2264250ml, our portfolio skews 500ml+. Economics gap: rural home care 10% CAGR vs urban 7%. Target: grow rural mix from 19% to 35% by 2029, +PKR 9.4Bn incremental rural revenue.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 2 — Category growth vs our growth
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const P = { ink: "081320", pink: "EC387E", blue: "0699D6", green: "AEED53", navy: "043966" };
  bg(s, P.ink);

  richText(s, [
    { t: "THE PKR 180BN CATEGORY IS GROWING AT 8% CAGR —\nBUT WE ARE ", c: "FFFFFF" },
    { t: "NOT", c: P.pink },
    { t: " GROWING AS FAST", c: "FFFFFF" },
  ], { x: 36, y: 24, w: 1300, h: 90, size: 25, bold: true, line: 1.05 });

  text(s, "Pakistan home care market sizing & growth decomposition, 2020\u20132030E \u2014 where the category is going\nand where we are being left behind.",
    { x: 36, y: 118, w: 1280, h: 45, size: 13.5, italic: true, color: "D7E4EE", line: 1.2 });

  const years = ["2020","2021","2022","2023","2024","2026E","2028E","2030E"];
  const laundry = [78, 88, 96, 100, 104, 118, 135, 155];
  const surface = [22, 26, 29, 32, 39, 46, 55, 64];
  const dishwash = [15, 17, 18, 22, 28, 32, 36, 40];
  const air = [3, 4, 5, 6, 9, 8, 8, 6];

  stackedColumn(s, {
    x: 60, y: 220, w: 700, h: 400,
    categories: years,
    series: [
      { name: "Laundry", values: laundry }, { name: "Surface Care", values: surface },
      { name: "Dishwash", values: dishwash }, { name: "Air Care", values: air },
    ],
    colors: ["0B3B60", "0699D6", "1470A6", "EC387E"],
  });

  circle(s, { cx: 316, cy: 232, d: 10, fill: "0B3B60" }); text(s, "LAUNDRY", { x: 328, y: 220, w: 90, h: 22, size: 10.5, bold: true, color: "FFFFFF" });
  circle(s, { cx: 428, cy: 232, d: 10, fill: "0699D6" }); text(s, "SURFACE CARE", { x: 440, y: 220, w: 130, h: 22, size: 10.5, bold: true, color: "FFFFFF" });
  circle(s, { cx: 588, cy: 232, d: 10, fill: "1470A6" }); text(s, "DISHWASH", { x: 600, y: 220, w: 100, h: 22, size: 10.5, bold: true, color: "FFFFFF" });
  circle(s, { cx: 716, cy: 232, d: 10, fill: "EC387E" }); text(s, "AIR CARE", { x: 728, y: 220, w: 100, h: 22, size: 10.5, bold: true, color: "FFFFFF" });

  text(s, "180Bn", { x: 430, y: 328, w: 90, h: 26, size: 16, bold: true, color: "FFFFFF" });
  text(s, "265Bn", { x: 690, y: 210, w: 90, h: 26, size: 16, bold: true, color: "FFFFFF" });
  text(s, "Gap opens here \u2014 and\nwidens every year.", { x: 155, y: 288, w: 190, h: 40, size: 11, bold: true, color: P.pink, line: 1.15 });
  text(s, "MARKET \u2014 8% CAGR", { x: 545, y: 260, w: 200, h: 20, size: 10.5, bold: true, color: "FFFFFF", italic: true });
  text(s, "LINE: OUR REVENUE\nGROWTH \u2014 5% CAGR", { x: 545, y: 405, w: 200, h: 34, size: 10.5, bold: true, color: P.green, line: 1.1 });

  // decorative trend lines (annotation, not primary data)
  s.addShape(pres.ShapeType.line, { x: px(148), y: px(300), w: px(600), h: px(-90),
    line: { color: "FFFFFF", width: 2.5 }, rotate: 0 });
  s.addShape(pres.ShapeType.line, { x: px(148), y: px(370), w: px(600), h: px(-100),
    line: { color: P.green, width: 2.5 } });

  // right table
  text(s, "Market Size\n2024\n(PKR Bn)", { x: 1040, y: 208, w: 120, h: 55, size: 10.5, bold: true, color: "FFFFFF", align: "center", line: 1.1 });
  text(s, "CAGR\n2024\u201330", { x: 1165, y: 208, w: 80, h: 55, size: 10.5, bold: true, color: "FFFFFF", align: "center", line: 1.1 });
  text(s, "Our\nShare", { x: 1250, y: 208, w: 90, h: 55, size: 10.5, bold: true, color: "FFFFFF", align: "center", line: 1.1 });
  hline(s, { x: 845, y: 270, w: 490, h: 1.5, color: "5A7086" });

  const tRows = [
    ["LAUNDRY CARE", "86Bn", "6%", "14%", false],
    ["SURFACE CARE", "39Bn", "12%", "8%", true],
    ["DISHWASH", "28Bn", "9%", "11%", false],
    ["AIR CARE", "9Bn", "11%", "5%", false],
  ];
  tRows.forEach((r, i) => {
    const ry = 288 + i * 40;
    if (r[4]) rect(s, { x: 845, y: ry - 4, w: 8, h: 34, fill: P.blue });
    text(s, r[0], { x: 862, y: ry, w: 175, h: 28, size: 13, bold: r[4], color: "FFFFFF" });
    text(s, r[1], { x: 1040, y: ry, w: 120, h: 28, size: 13, bold: r[4], color: "FFFFFF", align: "center" });
    text(s, r[2], { x: 1165, y: ry, w: 80, h: 28, size: 13, bold: r[4], color: "FFFFFF", align: "center" });
    text(s, r[3], { x: 1250, y: ry, w: 90, h: 28, size: 13, bold: r[4], color: "FFFFFF", align: "center" });
  });

  rect(s, { x: 845, y: 490, w: 480, h: 62, fill: P.pink, radius: 0.08 });
  text(s, "\ud83c\udff7\ufe0f Our 5% growth vs. 8% market CAGR = PKR 12Bn\nrevenue we are not capturing annually by 2030.",
    { x: 858, y: 490, w: 456, h: 62, size: 11.5, bold: true, color: "FFFFFF", line: 1.2 });

  rect(s, { x: 845, y: 570, w: 230, h: 60, fill: P.blue, radius: 0.5 });
  text(s, "URBAN", { x: 845, y: 578, w: 230, h: 20, size: 13, bold: true, color: "FFFFFF", align: "center" });
  text(s, "PKR 112Bn", { x: 845, y: 598, w: 230, h: 22, size: 12, bold: true, color: "FFFFFF", align: "center" });

  rect(s, { x: 1095, y: 570, w: 245, h: 60, fill: P.green, radius: 0.5 });
  text(s, "RURAL", { x: 1095, y: 578, w: 245, h: 20, size: 13, bold: true, color: "0B1825", align: "center" });
  text(s, "PKR 68Bn \u2014 Accelerating", { x: 1095, y: 598, w: 245, h: 22, size: 11.5, bold: true, color: "0B1825", align: "center" });

  footer(s, {
    textLine1: "SURFACE CARE AT 12% CAGR IS THE FASTEST SEGMENT — AND WHERE WE ARE WEAKEST.",
    textLine2: "That is not a coincidence. That is a strategy failure to correct.",
    bgColor: "000000", y: 682, h: 86,
  });

  s.addNotes("Market: PKR 180Bn (2024) growing 8% CAGR to PKR 265Bn by 2030E. Our revenue growing only 5% CAGR = PKR 12Bn/yr uncaptured by 2030. Segment breakdown 2024: Laundry 86Bn (6% CAGR, we hold 14% share), Surface Care 39Bn (12% CAGR, fastest, we hold only 8%), Dishwash 28Bn (9% CAGR, 11% share), Air Care 9Bn (11% CAGR, 5% share). Urban market PKR 112Bn vs Rural PKR 68Bn (accelerating).");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 3 — 2015 routes in 2024 (photo collage)
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "WE WERE RUNNING 2015 ROUTES\nIN 2024. ", c: "FFFFFF" },
    { t: "THE MACHINE WAS POINTED WRONG.", c: "F24782" },
  ], { x: 36, y: 24, w: 1310, h: 90, size: 26, bold: true, line: 1.05 });
  text(s, "The honest internal reckoning.", { x: 36, y: 118, w: 700, h: 30, size: 15, italic: true, color: "FFFFFF" });

  const photos = [
    ["s03_p1.png", 198, 370, 336, 225, -4],
    ["s03_p2.png", 526, 368, 336, 245, 2],
    ["s03_p3.png", 883, 354, 382, 217, -2],
    ["s03_p4.png", 263, 563, 261, 146, -3],
    ["s03_p5.png", 493, 563, 211, 146, 3],
    ["s03_p6.png", 759, 570, 323, 159, 0],
  ];
  photos.forEach(([f, cx, cy, w, h, rot]) => cutout(s, S + f, { cx, cy, w, h, rot }));

  rect(s, { x: 950, y: 442, w: 200, h: 193, fill: "F24782", radius: 0.08 });
  text(s, "SAME\nDISTRIBUTORS.", { x: 962, y: 470, w: 176, h: 60, size: 15, bold: true, color: "FFFFFF", align: "center", line: 1.1 });
  text(s, "A decade later \u2014\nsame geographies,\nsame habits.", { x: 962, y: 540, w: 176, h: 80, size: 11.5, italic: true, color: "FFFFFF", align: "center", line: 1.2 });

  rect(s, { x: 1163, y: 442, w: 183, h: 193, fill: "0B3B1D", line: "2BE86A", lineW: 1.5, radius: 0.08 });
  text(s, "ENTIRE\nSECTIONS\nDE-GROWING.", { x: 1173, y: 465, w: 163, h: 70, size: 14, bold: true, color: "FFFFFF", align: "center", line: 1.1 });
  text(s, "And we called\nit normal.", { x: 1173, y: 540, w: 163, h: 55, size: 11.5, italic: true, color: "2BE86A", align: "center", line: 1.2 });

  footer(s, {
    textLine1: "STRONG MACHINE. WRONG DIRECTION.",
    textLine2: "The first step to fixing it was admitting it.",
    bgColor: "0B3B1D", y: 665, h: 103, accent2: "9BE89B",
  });
  s.addNotes("Section volume declined -12% in a representative territory. Same distributors/geographies/habits used for a decade despite market shift. Entire sections were de-growing and treated as normal.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 4 — 40% whitespace
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "30\u201340% OF YOUR MARKET\nHAS NEVER SEEN ", c: "FFFFFF" },
    { t: "YOUR SALESMAN", c: "F02C84" },
  ], { x: 55, y: 40, w: 900, h: 100, size: 30, bold: true, line: 1.05 });
  text(s, "The universal FMCG paradox \u2014 and the #1 cause\nof volume plateaus across South Asia.",
    { x: 55, y: 148, w: 700, h: 55, size: 14, italic: true, color: "FFFFFF", line: 1.2 });

  text(s, "40", { x: 40, y: 235, w: 260, h: 260, size: 130, bold: true, color: "FFFFFF", fontFace: FONT });
  text(s, "%", { x: 300, y: 240, w: 260, h: 260, size: 130, bold: true, color: "F02C84", fontFace: FONT });

  // dot grid: 10 cols x 7 rows
  const cols = 10, rowsN = 7, startX = 748, startY = 233, stepX = 30.5, stepY = 33.5, blueCols = 6, d = 18;
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = startX + c * stepX, cy = startY + r * stepY;
      circle(s, { cx, cy, d, fill: c < blueCols ? "0A9FED" : "3A3A3A" });
    }
  }
  text(s, "mapped & visited.", { x: 748, y: 512, w: 260, h: 22, size: 12, italic: true, color: "8BD98B" });
  text(s, "unmapped. under-served.\nnever found.", { x: 1050, y: 505, w: 260, h: 40, size: 12, italic: true, color: "AAAAAA", align: "right", line: 1.2 });

  rect(s, { x: 288, y: 573, w: 810, h: 95, fill: "F02C84", radius: 0.5 });
  text(s, "These aren\u2019t lost customers.\n\u2014 They were never found.",
    { x: 288, y: 578, w: 810, h: 60, size: 18, bold: true, color: "FFFFFF", align: "center", line: 1.15 });
  text(s, "Nielsen South Asia \u2014 consistent across markets, consistent across decades.",
    { x: 288, y: 638, w: 810, h: 24, size: 10.5, italic: true, color: "F5E37A", align: "center" });

  footer(s, {
    textLine1: "THE WHITESPACE PROBLEM EXISTS IN EVERY HIGH-GROWTH MARKET ON EARTH.",
    textLine2: "Including ours. Especially ours.",
    bgColor: "091B0A", y: 693, h: 75, accent2: "9BE89B",
  });
  s.addNotes("30-40% of the addressable market has never been mapped or visited by sales coverage (Nielsen South Asia). This is the #1 driver of volume plateaus.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 5 — Structural growth (3D stack, mostly raster)
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "141B3E");
  richText(s, [
    { t: "PAKISTAN\u2019S FMCG GROWTH IS\nSTRUCTURAL, ", c: "FFFFFF" },
    { t: "NOT CYCLICAL", c: "E23B3B" },
  ], { x: 55, y: 40, w: 900, h: 100, size: 28, bold: true, line: 1.05 });
  text(s, "Inflation, urbanization, digitization and rural income growth\nare all pointing the same direction at the same time.",
    { x: 55, y: 148, w: 800, h: 55, size: 13.5, italic: true, color: "D7E0F0", line: 1.2 });

  img(s, S + "s05_stack.png", { x: 370, y: 55, w: 855, h: 600 });

  rect(s, { x: 55, y: 268, w: 296, h: 195, fill: "0E2A17", line: "2BE86A", lineW: 1.5, radius: 0.08 });
  text(s, "Quick commerce apps in\nKarachi and Lahore are\nnow processing FMCG\nreorders in under 30\nminutes.\nThe path to purchase is\nbeing rewritten. \ud83d\udcf1",
    { x: 70, y: 280, w: 266, h: 172, size: 12.5, color: "FFFFFF", line: 1.25 });

  rect(s, { x: 1038, y: 440, w: 283, h: 195, fill: "3C1420", line: "C62C4D", lineW: 1.5, radius: 0.08 });
  text(s, "Rural income growth\n= first-time category\nentrant.\nThis is not recovery\ndemand. This is\ncreation demand.",
    { x: 1052, y: 452, w: 256, h: 172, size: 12.5, bold: true, color: "FFFFFF", line: 1.25 });

  footer(s, {
    textLine1: "A $16\u201318B FMCG MARKET BY 2029 IS NOT A FORECAST. IT IS A FLOOR.",
    textLine2: "Every structural driver is reinforcing, not competing. This is a compounding story.",
    bgColor: "062C17", y: 665, h: 103, accent2: "9BE89B",
  });
  s.addNotes("Market: $10B (2024) -> $13-14B projected (2027) -> $16-18B target (2029), driven by modern trade +20% YoY, rural income rising, inflation-driven premiumization, e-commerce emergence, first-time category entrants, mobile money penetration, and FMCG category maturity. Quick commerce reorders now processed in under 30 minutes in Karachi/Lahore.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 6 — Format 01: POV Skits
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "FORMAT 01: ", c: "EE326C" },
    { t: "POV SKITS, ", c: "FFFFFF" },
    { t: "THE NOODLES DERAIL EVERYTHING.", c: "EE326C" },
  ], { x: 36, y: 24, w: 1310, h: 60, size: 24, bold: true });
  text(s, "\u2018The flavor is never the prop. It is always the punchline.\u2019", { x: 36, y: 92, w: 900, h: 30, size: 15, italic: true, color: "FFFFFF" });

  const phones = [
    ["s06_p1.png", 159, 527, 242, 262, -6],
    ["s06_p2.png", 405, 415, 290, 495, -3],
    ["s06_p3.png", 688, 415, 280, 495, 0],
    ["s06_p4.png", 958, 385, 269, 474, 5],
    ["s06_p5.png", 1226, 272, 212, 298, 8],
  ];
  phones.forEach(([f, cx, cy, w, h, rot]) => cutout(s, S + f, { cx, cy, w, h, rot }));

  rect(s, { x: 40, y: 206, w: 266, h: 155, fill: "EE326C", radius: 0.12 });
  text(s, "\u23f0 HOOK RULE:", { x: 56, y: 216, w: 234, h: 24, size: 13, bold: true, color: "FFFFFF" });
  text(s, "First 2 seconds must\nbreak expectation. No\nsetup. Straight to the bit.",
    { x: 56, y: 244, w: 234, h: 100, size: 12.5, bold: true, color: "FFFFFF", line: 1.25 });

  rect(s, { x: 1057, y: 452, w: 285, h: 187, fill: "071607", line: "2BE86A", lineW: 1.5, radius: 0.1 });
  text(s, "\ud83c\udfac PRODUCTION BRIEF:", { x: 1070, y: 462, w: 260, h: 22, size: 12.5, bold: true, color: "2BE86A" });
  text(s, "\u25b6 Phone camera only. No\nring light. One take energy.\nCaptions in Urdu-English mix.",
    { x: 1070, y: 486, w: 260, h: 80, size: 11.5, color: "FFFFFF", line: 1.2 });
  text(s, "Lo-fi = trustworthy.", { x: 1070, y: 566, w: 260, h: 22, size: 11.5, italic: true, color: "2BE86A" });

  footer(s, {
    textLine1: "THE SCENARIO IS ALWAYS RELATABLE. THE NOODLES ARE ALWAYS THE CHAOS AGENT.",
    textLine2: "15\u201330 seconds. No script. Maximum commitment to the bit.",
    bgColor: "0B3B1D", y: 665, h: 103, accent2: "9BE89B",
  });
  s.addNotes("Format 01: POV skits across DHA Karachi, Islamabad, Lahore, Karachi rickshaw, and home-cooking settings, each with the flavor as the punchline of a relatable POV scenario. Hook rule: first 2 seconds must break expectation. Production brief: phone camera only, no ring light, one-take energy, Urdu-English captions.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 7 — Flavor personality wars
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "FLAVOR PERSONALITY ", c: "FFFFFF" },
    { t: "WARS. PICK A SIDE.", c: "EA3468" },
  ], { x: 36, y: 24, w: 1310, h: 60, size: 27, bold: true });
  text(s, "These aren\u2019t flavors. They\u2019re characters. And Gen Z will absolutely argue about them.",
    { x: 36, y: 90, w: 1100, h: 30, size: 14.5, italic: true, color: "FFFFFF" });

  const cols = [
    { x: 45, title: "THE MAIN CHARACTER", pack: "s07_pack1.png", person: "s07_person1.png",
      tag: "MAIN\nCHARACTER\nENERGY", tagColor: "F45AA0", cap: "21-year-old girl , kurta, Gulberg, Lahore caf\u00e9,\ncompletely convinced she is the protagonist.",
      pill: "\ud83e\udd0d Main character stans", pillColor: "F45AA0", desc: "Dramatic. Creamy. Correct." },
    { x: 375, title: "THE CHAOTIC FRIEND", pack: "s07_pack2.png", person: "s07_person2.png",
      tag: "ZERO\nIMPULSE\nCONTROL", tagColor: "C9E85A", cap: "19-year-old boy, SZABIST Karachi classroom,\nonla lecture, one eye on the teacher.",
      pill: "\ud83c\udf36\ufe0f Chaos gremlins", pillColor: "9B59D0", desc: "Will suggest the worst idea. It will work." },
    { x: 706, title: "THE INTENSE ONE", pack: "s07_pack3.png", person: "s07_person3.png",
      tag: "K-DRAMA\nIN A\nPACKET", tagColor: "E8544A", cap: "22-year-old girl, Islamabad bedroom, single\nlamp langle lamp. Far face mirror the drama.",
      pill: "\u26a1 Intense K-drama stans", pillColor: "E8544A", desc: "Either thriving or in crisis. No middle ground." },
    { x: 1037, title: "THE COOL KID", pack: "s07_pack4.png", person: "s07_person4.png",
      tag: "EFFORT-\nLESSLY\nRIGHT", tagColor: "F0B93A", cap: "20-year-old guy, completely abandoned need\nfor external validation.",
      pill: "\ud83d\ude0e Unbothered legends", pillColor: "C9E85A", desc: "Says little. Hits hard. Always right." },
  ];
  cols.forEach(c => {
    text(s, c.title, { x: c.x, y: 188, w: 290, h: 26, size: 15, bold: true, color: "FFFFFF" });
    cutout(s, S + c.pack, { cx: c.x + 65, cy: 282, w: 128, h: 137 });
    text(s, c.tag, { x: c.x + 148, y: 232, w: 180, h: 100, size: 18, bold: true, color: c.tagColor, line: 1.05 });
    cutout(s, S + c.person, { cx: c.x + 145, cy: 447, w: 290, h: 173 });
    text(s, c.cap, { x: c.x, y: 542, w: 290, h: 34, size: 9.5, color: "FFFFFF", line: 1.2 });
    rect(s, { x: c.x + 15, y: 585, w: 260, h: 26, fill: c.pillColor, radius: 0.5 });
    text(s, c.pill, { x: c.x + 15, y: 585, w: 260, h: 26, size: 10.5, bold: true, color: "FFFFFF", align: "center" });
    text(s, c.desc, { x: c.x, y: 617, w: 290, h: 20, size: 10.5, color: "D7D7D7", align: "center" });
  });

  rect(s, { x: 40, y: 645, w: 1296, h: 55, fill: "EA3468", radius: 0.5 });
  text(s, "\ud83d\udcf1 COMMENT BAIT: Every video ends with \u2018Which flavor are you? Drop your personality in the comments \ud83d\udc47\u2019",
    { x: 55, y: 649, w: 1266, h: 24, size: 12.5, bold: true, color: "FFFFFF" });
  text(s, "Generator: millions of comments, zero production cost.", { x: 55, y: 671, w: 1266, h: 20, size: 11, color: "FFE1EC" });

  footer(s, {
    textLine1: "4 FLAVORS. 4 PERSONALITIES. ONE COMMENT SECTION ON FIRE.",
    textLine2: "Identity content is the most shareable content on earth.",
    bgColor: "1C3425", y: 710, h: 58, accent2: "9BE89B",
  });
  s.addNotes("4 flavor personas mapped to Gen Z archetypes: Fettuccine Italiano = Main Character Energy; Habanero Lime = Zero Impulse Control; Hot Gochujang = K-Drama in a Packet; Beef Bulgogi = Effortlessly Right. Comment bait CTA drives millions of comments at zero production cost.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 8 — Flavor arc calendar
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "THE FLAVOR\nARC CALENDAR\n", c: "FFFFFF" },
    { t: "3 WEEKS. NO GAPS.", c: "EA3468" },
  ], { x: 36, y: 24, w: 520, h: 155, size: 26, bold: true, line: 1.05 });
  text(s, "Sequenced to build. Each week teaches\nthe audience what\u2019s coming next.",
    { x: 36, y: 208, w: 460, h: 55, size: 13, italic: true, color: "FFFFFF", line: 1.2 });

  img(s, S + "s08_wk1.png", { x: 95, y: 330, w: 400, h: 262 });
  img(s, S + "s08_wk2.png", { x: 495, y: 190, w: 410, h: 372 });
  img(s, S + "s08_wk3.png", { x: 888, y: 148, w: 404, h: 407 });

  text(s, "\u26a1", { x: 258, y: 300, w: 40, h: 40, size: 22, color: "EA3468" });
  text(s, "ENGAGEMENT", { x: 360, y: 310, w: 100, h: 16, size: 9, bold: true, color: "FFFFFF" });
  rect(s, { x: 360, y: 328, w: 130, h: 14, fill: "3A1420" });
  rect(s, { x: 360, y: 328, w: 97, h: 14, fill: "EA3468" });
  text(s, "75%", { x: 460, y: 322, w: 40, h: 20, size: 9, bold: true, color: "FFFFFF" });
  text(s, "REACTION CONTENT =\nGUARANTEED SHARES", { x: 360, y: 348, w: 160, h: 30, size: 9, color: "FFFFFF", line: 1.15 });

  text(s, "1 OUT OF 10\nWOULD NOT\nRECOMMEND\n(I\u2019m lying I would\nrecommend)\n\ud83d\udd25\u26a1 #gochujang",
    { x: 40, y: 395, w: 150, h: 130, size: 10.5, bold: true, color: "FFFFFF", line: 1.15 });

  text(s, "\ud83d\udd0a", { x: 630, y: 175, w: 30, h: 30, size: 16, color: "9BE85A" });
  text(s, "TRENDING AUDIO\nASSIGNED", { x: 745, y: 178, w: 140, h: 40, size: 9.5, bold: true, color: "9BE85A", line: 1.15, align: "center" });

  text(s, "3,847 comments", { x: 972, y: 55, w: 200, h: 20, size: 10, bold: true, color: "FFFFFF", align: "center" });
  rect(s, { x: 990, y: 78, w: 90, h: 32, fill: "3A1420", radius: 0.15 });
  text(s, "\ud83c\udf5d FETTUCCINE\nCARBONARA", { x: 990, y: 80, w: 90, h: 28, size: 7, bold: true, color: "F45A7A", align: "center", line: 1.05 });
  text(s, "VS", { x: 1082, y: 80, w: 30, h: 32, size: 10, bold: true, color: "FFFFFF", align: "center" });
  rect(s, { x: 1112, y: 78, w: 90, h: 32, fill: "142A18", radius: 0.15 });
  text(s, "\ud83d\ude0e BULGOGI\nNATION", { x: 1112, y: 80, w: 90, h: 28, size: 7.5, bold: true, color: "9BE85A", align: "center", line: 1.05 });

  text(s, "ENGAGEMENT", { x: 1215, y: 170, w: 100, h: 16, size: 9, bold: true, color: "FFFFFF" });
  rect(s, { x: 1215, y: 188, w: 130, h: 14, fill: "3A1420" });
  rect(s, { x: 1215, y: 188, w: 117, h: 14, fill: "9BE85A" });
  text(s, "90%", { x: 1265, y: 182, w: 40, h: 20, size: 9, bold: true, color: "FFFFFF" });
  text(s, "PERSONALITY WAR =\nPEAK COMMENT WARFARE", { x: 1150, y: 208, w: 200, h: 30, size: 9, color: "FFFFFF", line: 1.15, align: "right" });

  text(s, "WEEK 1:\nGOCHUJANG LEADS.\nSPICE REACTIONS.\nSTITCH BAIT.", { x: 470, y: 600, w: 220, h: 90, size: 12.5, bold: true, color: "9BE85A", line: 1.2 });
  text(s, "\u2192 AUDIENCE TAUGHT\n\u2192 AUDIENCE PRIMED", { x: 500, y: 533, w: 200, h: 40, size: 10.5, bold: true, color: "9BE85A", line: 1.2 });

  text(s, "WEEK 2:\nHABANERO CHAOS.\nWRONG SETTING SERIES.\nCULTURAL ABSURDITY.", { x: 720, y: 540, w: 240, h: 90, size: 12.5, bold: true, color: "FFFFFF", line: 1.2 });
  text(s, "\u2192 AUDIENCE\n\u2192 AUDIENCE PRIMED\n\u2192 AUDIENCE ACTIVATED", { x: 928, y: 415, w: 200, h: 60, size: 10.5, bold: true, color: "9BE85A", line: 1.2 });

  text(s, "WEEK 3: DUAL DROP.\nFLAVOR PERSONALITY WAR.\nPICK YOUR SIDE.", { x: 1120, y: 440, w: 220, h: 70, size: 12.5, bold: true, color: "FFFFFF", line: 1.2 });

  rect(s, { x: 903, y: 512, w: 205, h: 108, fill: "3A0F2A", line: "EA3468", lineW: 1.5, radius: 0.1 });
  text(s, "\ud83c\udfb5 SONIC STRATEGY:", { x: 916, y: 520, w: 180, h: 20, size: 11, bold: true, color: "EA3468" });
  text(s, "One trending audio per\nweek assigned to ALL\ncreator content. Creates\nsonic brand recognition\nacross 50+ videos.", { x: 916, y: 542, w: 180, h: 76, size: 9.5, color: "FFFFFF", line: 1.15 });

  rect(s, { x: 1123, y: 512, w: 210, h: 108, fill: "0B1B0B", line: "2BE86A", lineW: 1.5, radius: 0.1 });
  text(s, "\ud83d\udd01 @KNORR_PK\nSTITCHES", { x: 1136, y: 520, w: 185, h: 40, size: 11.5, bold: true, color: "2BE86A", line: 1.1 });
  text(s, "creators every week \u2014\nbrand enters the\nconversation, not above it.", { x: 1136, y: 560, w: 185, h: 55, size: 9.5, color: "FFFFFF", line: 1.15 });

  footer(s, {
    textLine1: "THREE WEEKS. ONE WAVE. THE ALGORITHM DOESN\u2019T KNOW IT\u2019S A CAMPAIGN.",
    textLine2: "By design.",
    bgColor: "0B3B1D", y: 700, h: 68, accent2: "9BE89B",
  });
  s.addNotes("3-week sequenced content arc: Week 1 Gochujang leads (75% engagement, reaction content), Week 2 Habanero Lime chaos / wrong-setting series (audience primed), Week 3 dual drop Fettuccine Carbonara vs Bulgogi Nation flavor-personality war (3,847 comments, 90% engagement). One trending audio assigned per week across 50+ creator videos; @knorr_pk stitches creators weekly.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 9 — Comment section is the campaign
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "THE COMMENT SECTION IS THE ", c: "FFFFFF" },
    { t: "CAMPAIGN.", c: "EF336C" },
  ], { x: 36, y: 24, w: 1310, h: 60, size: 28, bold: true });
  text(s, "How @knorr_pk replies to a comment at 2am matters more than your next paid ad.",
    { x: 36, y: 92, w: 1200, h: 30, size: 15, italic: true, color: "FFFFFF" });

  cutout(s, S + "s09_p1.png", { cx: 166, cy: 420, w: 252, h: 487 });
  cutout(s, S + "s09_p2.png", { cx: 427, cy: 432, w: 278, h: 462 });
  cutout(s, S + "s09_p3.png", { cx: 711, cy: 420, w: 226, h: 487 });
  cutout(s, S + "s09_p4.png", { cx: 958, cy: 430, w: 244, h: 364 });
  cutout(s, S + "s09_p5.png", { cx: 1215, cy: 388, w: 238, h: 327 });

  rect(s, { x: 288, y: 197, w: 300, h: 100, fill: "EF336C", radius: 0.1 });
  text(s, "\ud83d\udeab NEVER: \u2018Thanks for sharing!\u2019\n\u2018So glad you enjoyed!\u2019\n\u2018Tag us for a chance to win!\u2019\nEver. Again.", { x: 300, y: 203, w: 276, h: 90, size: 10.5, bold: true, color: "FFFFFF", line: 1.2 });

  rect(s, { x: 1057, y: 555, w: 285, h: 108, fill: "071607", line: "2BE86A", lineW: 1.5, radius: 0.1 });
  text(s, "\u2705 ALWAYS: Funnier than the\ncomment you\u2019re replying to.\nSelf-aware. Slightly unhinged.\nNever explaining the joke.", { x: 1070, y: 565, w: 260, h: 90, size: 11, bold: true, color: "2BE86A", line: 1.2 });

  footer(s, {
    textLine1: "THE BRAND ACCOUNT IS NOT A BROADCASTING CHANNEL. IT\u2019S A CHARACTER IN THE STORY.",
    textLine2: "And it should act like one.",
    bgColor: "000000", y: 693, h: 75,
  });
  s.addNotes("The @knorr_pk brand account replies in-character: pinned reply humor (habanero lime 'behaving'), timing jokes (posted at 3am, 'we designed it for 3am'), and reposting UGC with commentary ('found in the wild'). Rule: never use generic brand-speak ('thanks for sharing'); always be funnier than the comment being replied to.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 10 — Phase 2 content architecture
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "THE PHASE 2 CONTENT ", c: "FFFFFF" },
    { t: "ARCHITECTURE.", c: "EC346A" },
  ], { x: 36, y: 24, w: 1310, h: 60, size: 28, bold: true });
  text(s, "4 formats built to be shared,\nstolen, and stitched.", { x: 36, y: 90, w: 500, h: 55, size: 15, italic: true, color: "FFFFFF", line: 1.2 });

  img(s, S + "s10_tower.png", { x: 515, y: 125, w: 357, h: 557 });

  rect(s, { x: 90, y: 240, w: 355, h: 110, fill: "EC346A", radius: 0.1 });
  text(s, "\ud83d\udd01 Each format designed\nto INVITE participation,\nnot just receive views.", { x: 104, y: 248, w: 330, h: 95, size: 13.5, bold: true, color: "FFFFFF", line: 1.25 });

  text(s, "FORMAT 02: FLAVOR WARS \u2014", { x: 118, y: 428, w: 380, h: 24, size: 15.5, bold: true, color: "FFFFFF", align: "right" });
  text(s, "4 packs. 4 personalities.\nStan your flavor.", { x: 190, y: 456, w: 308, h: 44, size: 13, color: "FFFFFF", align: "right", line: 1.2 });

  text(s, "FORMAT 01:\nPOV SKITS \u2014", { x: 240, y: 545, w: 258, h: 50, size: 15.5, bold: true, color: "FFFFFF", align: "right", line: 1.15 });
  text(s, "The flavor IS the plot twist.", { x: 175, y: 611, w: 323, h: 24, size: 13, color: "FFFFFF", align: "right" });

  text(s, "FORMAT 04: STITCH BAIT \u2014", { x: 900, y: 218, w: 380, h: 24, size: 15.5, bold: true, color: "FFFFFF" });
  text(s, "Built for creator response.", { x: 900, y: 250, w: 380, h: 24, size: 13, color: "FFFFFF" });

  text(s, "FORMAT 03: WRONG SETTING \u2014", { x: 900, y: 328, w: 380, h: 24, size: 15.5, bold: true, color: "FFFFFF" });
  text(s, "Maximum contextual absurdity.", { x: 900, y: 360, w: 380, h: 24, size: 13, color: "FFFFFF" });

  rect(s, { x: 928, y: 438, w: 356, h: 118, fill: "0B1B0B", line: "2BE86A", lineW: 1.5, radius: 0.1 });
  text(s, "\ud83d\udcf1 TikTok-first.", { x: 944, y: 448, w: 324, h: 24, size: 14, bold: true, color: "FFFFFF" });
  text(s, "Every format has a built-in\nreason to duet or stitch.", { x: 944, y: 478, w: 324, h: 60, size: 13, color: "FFFFFF", line: 1.25 });

  footer(s, {
    textLine1: "FOUR FORMATS. ONE RULE: IF IT DOESN\u2019T MAKE SOMEONE WANT TO RESPOND, SCRAP IT.",
    textLine2: "Participation beats reach. Every time.",
    bgColor: "000000", y: 685, h: 83,
  });
  s.addNotes("4-format content tower (bottom to top): Format 01 POV Skits (flavor is the plot twist); Format 02 Flavor Wars (4 packs, 4 personalities); Format 03 Wrong Setting (maximum contextual absurdity); Format 04 Stitch Bait (built for creator response). All formats are TikTok-first with a built-in duet/stitch mechanic.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 11 — Format 04: Stitch bait
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "000000");
  richText(s, [
    { t: "FORMAT 04: STITCH BAIT\n", c: "FFFFFF" },
    { t: "IN ENGINEERED TO BE STOLEN.", c: "F24782" },
  ], { x: 36, y: 24, w: 1200, h: 130, size: 27, bold: true, line: 1.05 });
  text(s, "The content is never finished. The creator deliberately leaves a gap. The internet fills it.",
    { x: 160, y: 178, w: 1050, h: 30, size: 14.5, italic: true, color: "FFFFFF" });

  img(s, S + "s11_main.png", { x: 160, y: 230, w: 1060, h: 308 });
  cutout(s, S + "s11_a.png", { cx: 175, cy: 605, w: 241, h: 114 });
  cutout(s, S + "s11_b.png", { cx: 440, cy: 605, w: 241, h: 114 });
  cutout(s, S + "s11_c.png", { cx: 705, cy: 605, w: 241, h: 114 });
  text(s, "A", { x: 267, y: 548, w: 24, h: 22, size: 12, bold: true, color: "FFFFFF" });
  text(s, "B", { x: 532, y: 548, w: 24, h: 22, size: 12, bold: true, color: "FFFFFF" });
  text(s, "C", { x: 797, y: 548, w: 24, h: 22, size: 12, bold: true, color: "FFFFFF" });

  rect(s, { x: 855, y: 550, w: 465, h: 100, fill: "071607", line: "2BE86A", lineW: 1.5, radius: 0.1 });
  text(s, "\ud83d\udcc8 EVERY STITCH = FREE MEDIA.", { x: 872, y: 558, w: 430, h: 24, size: 14, bold: true, color: "2BE86A" });
  text(s, "One original video can generate 50+ organic\nresponse videos from creators who never got briefed.",
    { x: 872, y: 588, w: 430, h: 50, size: 12, color: "FFFFFF", line: 1.2 });

  footer(s, {
    textLine1: "THE BEST CONTENT IS CONTENT WITH A MISSING PIECE. THE INTERNET ALWAYS COMES TO FINISH IT.",
    textLine2: "Engineer the gap. Let them run.",
    bgColor: "0B3B1D", y: 693, h: 75, accent2: "9BE89B",
  });
  s.addNotes("Stitch-bait mechanic: original creator video ends on a 'stitch point' (rating a reaction, predicting an outcome), inviting a second creator to complete it. Variant hooks: A) 'I tried not to make a face', B) Habanero vs Gochujang reaction battle, C) Part 1/Part 2 dared-location follow-up. One original video can generate 50+ organic unbriefed response videos.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 12 — Cultural permission (flight moment)
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s, "FCF0EF");
  richText(s, [
    { t: "THE FLIGHT GAVE US\nCULTURAL PERMISSION\n", c: "0B0B0B" },
    { t: "TO BE UNHINGED.", c: "F12860" },
  ], { x: 55, y: 40, w: 700, h: 130, size: 26, bold: true, line: 1.05 });
  text(s, "Phase 2 is about spending that capital before Gen Z moves on.",
    { x: 55, y: 172, w: 850, h: 26, size: 14, italic: true, color: "1A1A1A" });

  img(s, S + "s12_main.png", { x: 55, y: 216, w: 1278, h: 446 });

  rect(s, { x: 975, y: 172, w: 358, h: 68, fill: "F12860", radius: 0.1 });
  text(s, "\u231b PERMISSION WINDOW", { x: 990, y: 178, w: 328, h: 24, size: 13, bold: true, color: "FFFFFF" });
  text(s, "closes faster than you think", { x: 990, y: 202, w: 328, h: 22, size: 11.5, italic: true, color: "FFE1EC" });

  rect(s, { x: 55, y: 592, w: 545, h: 68, fill: "0B2A0F", line: "2BE86A", lineW: 1.5, radius: 0.1 });
  text(s, "\ud83c\udfaf THE PLAY: Convert viewers \u2192 creators", { x: 70, y: 598, w: 515, h: 24, size: 13, bold: true, color: "FFFFFF" });
  text(s, "Before the algorithm forgets us.", { x: 70, y: 624, w: 515, h: 22, size: 11.5, italic: true, color: "9BE89B" });

  footer(s, {
    textLine1: "VIRAL ATTENTION IS RENTED. GEN Z PARTICIPATION IS OWNED.",
    textLine2: "Phase 2 converts the crowd into the campaign.",
    bgColor: "000000", y: 685, h: 83, accent2: "9BE89B",
  });
  s.addNotes("An in-flight stewardess video ('this is the most Pakistani thing to ever happen at 30k feet') went viral and earned cultural permission for the brand to be unhinged. Insight: Gen Z doesn't just watch things go viral, they make things go viral. The play: convert viewers into creators before the algorithm forgets the brand — the permission window closes fast.");
}

// ════════════════════════════════════════════════════════════════
// SLIDE 13 — Market share benchmarking
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  const P = { ink: "022542", blue: "0DA3DB", blueDark: "175B84", pink: "E8418F" };
  bg(s, P.ink);
  richText(s, [
    { t: "WE HOLD ~12% MARKET SHARE WHILE UNILEVER\nCOMMANDS 38% \u2014 A 26-POINT GAP TO CLOSE ", c: "FFFFFF" },
    { t: "[in HOT PINK]", c: P.pink },
  ], { x: 36, y: 24, w: 1310, h: 90, size: 22, bold: true, line: 1.05 });
  text(s, "Competitive market share benchmarking \u2014 Pakistan home care, 2024 \u2014 who owns what and where the windows are opening.",
    { x: 36, y: 118, w: 1300, h: 26, size: 12.5, italic: true, color: "D7E4EE" });

  donut(s, {
    x: 60, y: 195, w: 470, h: 440,
    labels: ["Unilever Pakistan", "P&G Pakistan", "Our Company", "Local & Others"],
    values: [38, 21, 12, 29],
    colors: [P.blue, P.blueDark, P.pink, "132C42"],
  });
  text(s, "12%", { x: 210, y: 375, w: 170, h: 50, size: 30, bold: true, color: "FFFFFF", align: "center" });
  text(s, "Our share \u00b7 2024", { x: 210, y: 420, w: 170, h: 24, size: 11, color: "C9D6E0", align: "center" });

  text(s, "29%", { x: 40, y: 225, w: 100, h: 30, size: 17, bold: true, color: "FFFFFF" });
  text(s, "LOCAL &\nOTHERS \u2014", { x: 40, y: 255, w: 130, h: 44, size: 12, bold: true, color: "C9D6E0", line: 1.1 });
  text(s, "UNILEVER\nPAKISTAN\n\u2014 38%", { x: 550, y: 220, w: 160, h: 70, size: 15, bold: true, color: "FFFFFF", line: 1.1 });
  text(s, "21%", { x: 555, y: 578, w: 90, h: 26, size: 17, bold: true, color: "FFFFFF" });
  text(s, "P&G PAKISTAN", { x: 480, y: 604, w: 200, h: 26, size: 13.5, bold: true, color: "FFFFFF" });
  text(s, "12%", { x: 40, y: 566, w: 90, h: 26, size: 17, bold: true, color: "FFFFFF" });
  text(s, "OUR COMPANY", { x: 40, y: 592, w: 170, h: 26, size: 13.5, bold: true, color: "FFFFFF" });

  // table
  const headers = ["PLAYER", "SHARE", "CORE STRENGTH", "OUR GAP TO THEM"];
  const hx = [723, 878, 945, 1200];
  headers.forEach((h, i) => text(s, h, { x: hx[i], y: 205, w: 150, h: 22, size: 10, bold: true, color: "9AB4C8" }));
  hline(s, { x: 700, y: 245, w: 645, h: 1.5, color: "3A5A78" });

  rect(s, { x: 710, y: 297, w: 630, h: 84, fill: "1A3A37", radius: 0.08 });
  const trows = [
    { y: 260, player: "UNILEVER", share: "38%", strength: "Laundry & Dishwash dominance", gap: "\u221226pts", gapColor: P.pink, border: false },
    { y: 305, player: "P&G", share: "21%", strength: "Fabric care & Air fresheners", gap: "\u22129pts", gapColor: "9BE89B", border: true },
    { y: 378, player: "OUR CO", share: "12%", strength: "Fragmented across 3 segments", gap: "baseline", gapColor: "FFFFFF", border: false },
    { y: 435, player: "LOCAL PLAYERS", share: "29%", strength: "Price-led, no brand equity", gap: "Opportunity\nto absorb", gapColor: "FFFFFF", border: false },
  ];
  trows.forEach(r => {
    text(s, r.player, { x: 723, y: r.y, w: 150, h: 26, size: 13, bold: true, color: r.player === "OUR CO" ? P.pink : "FFFFFF" });
    text(s, r.share, { x: 878, y: r.y, w: 60, h: 26, size: 13, bold: true, color: "FFFFFF" });
    text(s, r.strength, { x: 945, y: r.y, w: 250, h: 26, size: 12.5, color: "FFFFFF" });
    text(s, r.gap, { x: 1200, y: r.y, w: 145, h: 30, size: 12.5, bold: true, color: r.gapColor, line: 1.1 });
  });
  rect(s, { x: 710, y: 297, w: 630, h: 44, fill: "133838", line: "9BE85A", lineW: 1.2, radius: 0.06 });
  text(s, "\u26a1 Nearest Competitor \u2014 9-Point Gap Is Closeable in 3 Years.", { x: 723, y: 328, w: 600, h: 22, size: 11, bold: true, color: "9BE85A" });

  text(s, "The 29% held by local players is structurally vulnerable \u2014\nprivate label and rural distribution unlocks that share.",
    { x: 725, y: 500, w: 615, h: 44, size: 12.5, italic: true, bold: true, color: "6FCBEF", line: 1.2 });

  const bcards = [
    { x: 711, fill: "0B2A17", border: "2BE86A", title: "\ud83c\udfc6 Unilever:", body: "Entrenched in laundry\n\u2014 do not chase." },
    { x: 922, fill: "3A1420", border: "F12860", title: "\ud83c\udfaf P&G:", body: "9pts gap \u2014\nthe real competitive\nbattleground." },
    { x: 1134, fill: "0B2438", border: "0DA3DB", title: "\ud83c\udfe0 Local players:", body: "29% share, no brand moat\n\u2014 ripe for displacement." },
  ];
  bcards.forEach(c => {
    rect(s, { x: c.x, y: 573, w: 202, h: 92, fill: c.fill, line: c.border, lineW: 1.5, radius: 0.08 });
    text(s, c.title, { x: c.x + 14, y: 580, w: 175, h: 22, size: 12, bold: true, color: "FFFFFF" });
    text(s, c.body, { x: c.x + 14, y: 604, w: 175, h: 55, size: 11, color: "FFFFFF", line: 1.2 });
  });

  footer(s, {
    textLine1: "THE 9-POINT GAP TO P&G IS THE MISSION. THE 26-POINT GAP TO UNILEVER IS THE CONTEXT.",
    textLine2: "Win the battle you can win first.",
    bgColor: "000000", y: 687, h: 81, accent2: "9BE89B",
  });
  s.addNotes("Market share 2024: Unilever Pakistan 38% (laundry & dishwash dominance, -26pts gap), P&G Pakistan 21% (fabric care & air fresheners, -9pts gap, nearest competitor, closeable in 3 years), Our Company 12% (fragmented across 3 segments, baseline), Local & Others 29% (price-led, no brand equity, opportunity to absorb).");
}

pres.writeFile({ fileName: "deck.pptx" }).then(f => console.log("wrote", f));
