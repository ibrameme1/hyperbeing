const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
const F = "Arial";

// ============ helpers ============
const mk = (base) => (p) => (p * 13.3333) / base; // px -> inch for a given source width
const A = mk(1344); // slides 1 & 2 source width
const B = mk(1376); // slides 3 & 4 source width

// ================================================================
// SLIDE 1 — Lipstick concept
// ================================================================
{
  const s = pres.addSlide();
  s.background = { color: "000000" };
  s.addImage({ path: "/home/claude/lipstick_product.png", x: 0, y: A(152), w: 13.3333, h: A(572) });

  s.addText("THE PRODUCT: A LIPSTICK THAT SURVIVES THE MEAL.", {
    x: A(60), y: A(28), w: A(1224), h: A(66), fontFace: F, fontSize: 32, bold: true,
    color: "FFFFFF", align: "center", margin: 0, valign: "middle", charSpacing: -0.5,
  });
  s.addText("Concept — Knorr Global Flavours x Maybelline Smudge-Proof Lip Collection.", {
    x: A(160), y: A(104), w: A(1024), h: A(34), fontFace: F, fontSize: 15,
    color: "C9A227", align: "center", margin: 0, valign: "middle",
  });
  s.addText("Category-First Innovation — Concept Visualization.", {
    x: A(160), y: A(718), w: A(1024), h: A(28), fontFace: F, fontSize: 11,
    color: "E8E4DA", align: "center", margin: 0, valign: "middle",
  });
  s.addNotes("Concept visualisation slide: Knorr Global Flavours x Maybelline smudge-proof lip collection, Habanero Lime shade 02. Claim: slur-proof, spice-proof, stain-proof up to 10 hours.");
}

// ================================================================
// SLIDE 2 — Venn: Food vs Beauty  (rebuilt natively)
// ================================================================
{
  const s = pres.addSlide();
  s.background = { color: "FCFCFD" };
  const GREEN = "1B7A4C", PINK = "F0919E", GOLD = "C08A18", INK = "111111";

  s.addText("PAKISTAN'S BIGGEST INTEREST COHORT\nISN'T BEAUTY. IT'S FOOD.", {
    x: A(120), y: A(28), w: A(1104), h: A(160), fontFace: F, fontSize: 34, bold: true,
    color: INK, align: "center", margin: 0, valign: "middle", lineSpacingMultiple: 1.05,
  });

  // Venn circles — green (Food), pink (Beauty), white lens (white space)
  s.addShape(pres.ShapeType.ellipse, {
    x: A(337), y: A(218), w: A(444), h: A(444),
    fill: { color: GREEN }, line: { color: GREEN, width: 0 },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: A(588), y: A(255), w: A(376), h: A(376),
    fill: { color: PINK }, line: { color: PINK, width: 0 },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: A(588), y: A(268), w: A(193), h: A(344),
    fill: { color: "FFFFFF" }, line: { color: GOLD, width: 1 },
  });

  s.addText("FOOD", { x: A(360), y: A(400), w: A(200), h: A(70), fontFace: F, fontSize: 30,
    bold: true, color: "FFFFFF", align: "center", margin: 0, valign: "middle" });
  s.addText("BEAUTY", { x: A(800), y: A(400), w: A(180), h: A(70), fontFace: F, fontSize: 26,
    bold: true, color: "FFFFFF", align: "center", margin: 0, valign: "middle" });
  s.addText("THE\nWHITE\nSPACE", { x: A(618), y: A(370), w: A(134), h: A(150), fontFace: F,
    fontSize: 17, bold: true, color: GOLD, align: "center", margin: 0, valign: "middle",
    lineSpacingMultiple: 1.05 });

  // ---- left stats ----
  s.addShape(pres.ShapeType.ellipse, { x: A(62), y: A(302), w: A(62), h: A(62),
    fill: { color: GREEN }, line: { color: GREEN, width: 0 } });
  s.addText("👥", { x: A(62), y: A(302), w: A(62), h: A(62), fontFace: F, fontSize: 18,
    color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText("71M", { x: A(142), y: A(298), w: A(180), h: A(46), fontFace: F, fontSize: 27,
    bold: true, color: GREEN, margin: 0, valign: "middle" });
  s.addText("Gen Z in Pakistan\n(~30% of population)", { x: A(142), y: A(345), w: A(220), h: A(52),
    fontFace: F, fontSize: 12, color: "2B2B2B", margin: 0, lineSpacingMultiple: 1.05 });
  s.addShape(pres.ShapeType.line, { x: A(60), y: A(437), w: A(250), h: 0,
    line: { color: "D6D6D6", width: 1 } });

  s.addShape(pres.ShapeType.ellipse, { x: A(62), y: A(478), w: A(62), h: A(62),
    fill: { color: GREEN }, line: { color: GREEN, width: 0 } });
  s.addText("🛒", { x: A(62), y: A(478), w: A(62), h: A(62), fontFace: F, fontSize: 18,
    color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText([
    { text: "Food & lifestyle\nare Gen Z's\n", options: { fontSize: 12.5, color: "2B2B2B" } },
    { text: "#1 SPEND\nCATEGORY", options: { fontSize: 17, bold: true, color: GREEN } },
  ], { x: A(142), y: A(474), w: A(220), h: A(126), fontFace: F, margin: 0, lineSpacingMultiple: 1.08 });

  // ---- right stats ----
  s.addShape(pres.ShapeType.ellipse, { x: A(1002), y: A(292), w: A(62), h: A(62),
    fill: { color: "E8899A" }, line: { color: "E8899A", width: 0 } });
  s.addText("👁", { x: A(1002), y: A(292), w: A(62), h: A(62), fontFace: F, fontSize: 18,
    color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText("12.9M", { x: A(1086), y: A(288), w: A(220), h: A(46), fontFace: F, fontSize: 27,
    bold: true, color: "E8697E", margin: 0, valign: "middle" });
  s.addText("organic views on\nKnorr Global Flavours\ncontent alone", { x: A(1086), y: A(334), w: A(230),
    h: A(74), fontFace: F, fontSize: 12, color: "2B2B2B", margin: 0, lineSpacingMultiple: 1.05 });
  s.addShape(pres.ShapeType.line, { x: A(1000), y: A(452), w: A(290), h: 0,
    line: { color: "D6D6D6", width: 1 } });

  s.addShape(pres.ShapeType.ellipse, { x: A(1002), y: A(490), w: A(62), h: A(62),
    fill: { color: "E8899A" }, line: { color: "E8899A", width: 0 } });
  s.addText("🔗", { x: A(1002), y: A(490), w: A(62), h: A(62), fontFace: F, fontSize: 18,
    color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText("8.43M", { x: A(1086), y: A(486), w: A(220), h: A(46), fontFace: F, fontSize: 27,
    bold: true, color: "E8697E", margin: 0, valign: "middle" });
  s.addText("views from Knorr's\nown creator network.", { x: A(1086), y: A(532), w: A(230), h: A(52),
    fontFace: F, fontSize: 12, color: "2B2B2B", margin: 0, lineSpacingMultiple: 1.05 });

  s.addShape(pres.ShapeType.line, { x: A(20), y: A(694), w: A(1304), h: 0, line: { color: "E2E2E2", width: 1 } });
  s.addText("Directional estimate from category and social-listening data  —  Knorr Global Flavours performance, May–June 2026.", {
    x: A(120), y: A(706), w: A(1104), h: A(30), fontFace: F, fontSize: 10.5, color: "555555",
    align: "center", margin: 0, valign: "middle" });
  s.addNotes("Gen Z = 71M (~30% of Pakistan's population); food & lifestyle is their #1 spend category. Knorr Global Flavours: 12.9M organic views, 8.43M from the owned creator network. The white space is food x beauty.");
}

// ================================================================
// SLIDE 3 — Jhelum / Rin decline (rebuilt bar rows)
// ================================================================
{
  const s = pres.addSlide();
  s.background = { color: "000000" };
  const RED = "E8163B", NAVY = "193864", AMBER = "C79B38", ROW = "E4F0FE", STRIP = "0D2611";

  s.addText("TOP / HEADER", { x: B(48), y: B(14), w: B(300), h: B(20), fontFace: F, fontSize: 9,
    color: "8A8A8A", margin: 0, charSpacing: 1 });
  s.addText("RIN IS JHELUM'S DEEPEST WOUND", { x: B(48), y: B(36), w: B(1000), h: B(48),
    fontFace: F, fontSize: 27, bold: true, color: "FFFFFF", margin: 0, valign: "middle" });
  s.addText("WORSE THAN EVERY PEER CITY IN NORTH.", { x: B(48), y: B(88), w: B(1000), h: B(48),
    fontFace: F, fontSize: 27, bold: true, color: RED, margin: 0, valign: "middle" });
  s.addText("Jhelum -48% YoY. No North city performs worse except Sahiwal. This is not a trend - it is a local emergency.", {
    x: B(48), y: B(140), w: B(1250), h: B(30), fontFace: F, fontSize: 14, italic: true,
    color: "F0F0F0", margin: 0, valign: "middle" });

  s.addText("MAIN BODY", { x: B(48), y: B(180), w: B(300), h: B(18), fontFace: F, fontSize: 9,
    color: "8A8A8A", margin: 0, charSpacing: 1 });
  s.addText("NO NORTH CITY SHOWS POSITIVE RIN GROWTH - CATEGORY IS IN STRUCTURAL DECLINE.", {
    x: B(48), y: B(198), w: B(1140), h: B(30), fontFace: F, fontSize: 16, bold: true,
    color: "FFFFFF", margin: 0, valign: "middle" });

  // rows: [label, value, note, highlight]
  const rows = [
    ["SAHIWAL", -57, "Only city nationally worse than Jhelum", false],
    ["JHELUM", -48, "⚠ WORST IN NORTH CLUSTER", true],
    ["ISLAMABAD", -42, "National peer", false],
    ["NATIONAL", -42, "Systemic decline - Jhelum accelerates it", false],
    ["NORTH AGGREGATE", -40, "Jhelum drags region below this", false],
    ["MULTAN", -40, "", false],
    ["FAISALABAD", -36, "", false],
    ["LAHORE", -30, "🟡 Best managed in North - still deeply negative", false],
  ];
  const X0 = 52, W = 1136, TOP = 234, RH = 39.6, BARX = 296, BARMAX = 644;
  rows.forEach(([label, val, note, hi], i) => {
    const y = TOP + i * RH;
    const isLahore = label === "LAHORE";
    s.addShape(pres.ShapeType.roundRect, {
      x: B(X0), y: B(y), w: B(W), h: B(33), rectRadius: 0.04,
      fill: { color: hi ? "F6DEE2" : ROW },
      line: { color: hi ? RED : "C7D8EC", width: hi ? 2 : 1 },
    });
    s.addText(label, { x: B(X0 + 14), y: B(y), w: B(230), h: B(33), fontFace: F, fontSize: 14,
      bold: true, color: "0B1B33", margin: 0, valign: "middle" });
    const len = (Math.abs(val) / 57) * BARMAX;
    s.addShape(pres.ShapeType.rect, {
      x: B(BARX), y: B(y + 5), w: B(len), h: B(23),
      fill: { color: isLahore ? AMBER : NAVY }, line: { color: isLahore ? AMBER : NAVY, width: 0 },
    });
    s.addText(`${val}%`, { x: B(BARX + len - 90), y: B(y + 5), w: B(80), h: B(23), fontFace: F,
      fontSize: 13.5, bold: true, color: isLahore ? "FFFFFF" : (hi ? "FF5C77" : "E8B44A"),
      align: "right", margin: 0, valign: "middle" });
    if (note) {
      const nw = X0 + W - 10 - (BARX + len + 8);
      s.addText(note, { x: B(BARX + len + 8), y: B(y), w: B(nw), h: B(33), fontFace: F,
        fontSize: hi ? 12 : 10.5, bold: hi, color: "0B1B33", margin: 0, valign: "middle" });
    }
  });

  s.addText("Liquid cannibalisation: Surf Liquids +64% likely pulling from Rin volume.", {
    x: B(1222), y: B(255), w: B(140), h: B(90), fontFace: F, fontSize: 10.5, color: "E6E6E6",
    margin: 0, valign: "middle", lineSpacingMultiple: 1.05 });
  s.addShape(pres.ShapeType.line, { x: B(1196), y: B(292), w: B(24), h: 0,
    line: { color: "FFFFFF", width: 1, endArrowType: "triangle" } });

  s.addText("CALLOUT CARDS", { x: B(48), y: B(556), w: B(300), h: B(18), fontFace: F, fontSize: 9,
    color: "8A8A8A", margin: 0, charSpacing: 1 });
  const cards = [
    [48, 452, "1A0A0D", RED, "🔴 ", "Likely cause: ", "Surf Liquids +64% cannibalising Rin consumers in Jhelum - format shift is accelerating."],
    [510, 400, "07160C", "2BE86A", "🔍 ", "Action: ", "Immediate SKU audit + trade incentive review on Rin in Jhelum."],
    [922, 268, "5E4718", "C79B38", "", "Category: ", "Structural decline - not a Jhelum-only issue."],
  ];
  cards.forEach(([x, w, fill, line, icon, lead, body]) => {
    s.addShape(pres.ShapeType.roundRect, { x: B(x), y: B(576), w: B(w), h: B(76), rectRadius: 0.05,
      fill: { color: fill }, line: { color: line, width: 2 } });
    s.addText([
      { text: icon + lead, options: { bold: true } },
      { text: body, options: {} },
    ], { x: B(x + 12), y: B(580), w: B(w - 24), h: B(68), fontFace: F, fontSize: 11.5,
      color: "FFFFFF", margin: 0, valign: "middle", lineSpacingMultiple: 1.1 });
  });
  s.addShape(pres.ShapeType.roundRect, { x: B(1112), y: B(568), w: B(66), h: B(22), rectRadius: 0.08,
    fill: { color: "C79B38" }, line: { color: "C79B38", width: 0 } });
  s.addText("amber", { x: B(1112), y: B(568), w: B(66), h: B(22), fontFace: F, fontSize: 9.5,
    color: "1A1206", align: "center", valign: "middle", margin: 0 });

  s.addShape(pres.ShapeType.rect, { x: 0, y: B(672), w: 13.3333, h: 7.5 - B(672),
    fill: { color: STRIP }, line: { color: STRIP, width: 0 } });
  s.addText("STRIP", { x: B(20), y: B(710), w: B(80), h: B(20), fontFace: F, fontSize: 9,
    color: "7F8F82", margin: 0 });
  s.addText([
    { text: "RIN IS NOT JUST DECLINING - JHELUM IS MAKING IT WORSE FOR THE ENTIRE REGION.",
      options: { fontSize: 18, bold: true, color: "FFFFFF", breakLine: true } },
    { text: "Lahore at -30% proves this is manageable. Jhelum at -48% proves it is not being managed.",
      options: { fontSize: 15, italic: true, color: "5CE08A" } },
  ], { x: B(100), y: B(676), w: B(1180), h: B(88), fontFace: F, align: "center", valign: "middle",
    margin: 0, lineSpacingMultiple: 1.15 });
  s.addNotes("Rin YoY decline by city: Sahiwal -57%, Jhelum -48%, Islamabad -42%, National -42%, North aggregate -40%, Multan -40%, Faisalabad -36%, Lahore -30%. Likely cause: Surf Liquids +64% cannibalising Rin.");
}

// ================================================================
// SLIDE 4 — Home care market share (native donut chart)
// ================================================================
{
  const s = pres.addSlide();
  s.background = { color: "022342" };
  const BLUE = "009CD9", MIDBLUE = "055A93", HOTPINK = "FC3A91", SLATE = "1E3D5C";

  s.addText([
    { text: "WE HOLD ~12% MARKET SHARE WHILE UNILEVER\nCOMMANDS 38% — A 26-POINT GAP TO CLOSE ", options: { color: "FFFFFF" } },
    { text: "[in HOT PINK]", options: { color: HOTPINK } },
  ], { x: B(38), y: B(30), w: B(1300), h: B(92), fontFace: F, fontSize: 19, bold: true,
    margin: 0, valign: "middle", lineSpacingMultiple: 1.08 });
  s.addText("Competitive market share benchmarking — Pakistan home care, 2024 — who owns what and where the windows are opening.", {
    x: B(38), y: B(128), w: B(1300), h: B(28), fontFace: F, fontSize: 12.5, italic: true,
    color: "CFE3F5", margin: 0, valign: "middle" });

  // --- native doughnut chart (editable data) ---
  s.addChart(pres.ChartType.doughnut,
    [{ name: "2024 share", labels: ["Unilever Pakistan", "P&G Pakistan", "Our Company", "Local & others"],
       values: [38, 21, 12, 29] }],
    { x: B(150), y: B(190), w: B(500), h: B(470), holeSize: 58,
      chartColors: [BLUE, MIDBLUE, HOTPINK, SLATE],
      dataBorder: { pt: 2, color: "022342" },
      showLegend: false, showTitle: false, showValue: false, showPercent: false,
      firstSliceAng: 0 });
  s.addText([
    { text: "12%\n", options: { fontSize: 34, bold: true, color: "FFFFFF" } },
    { text: "Our share · 2024", options: { fontSize: 11.5, color: "AFC7DC" } },
  ], { x: B(300), y: B(378), w: B(200), h: B(80), fontFace: F, align: "center", valign: "middle",
    margin: 0, lineSpacingMultiple: 1.0 });

  const dLabels = [
    [40, 222, "29%\nLOCAL & OTHERS", 200],
    [530, 218, "UNILEVER PAKISTAN — 38%", 190],
    [40, 578, "12%\nOUR COMPANY", 200],
    [500, 600, "21%\nP&G PAKISTAN", 200],
  ];
  dLabels.forEach(([x, y, t, w]) => {
    s.addText(t, { x: B(x), y: B(y), w: B(w), h: B(60), fontFace: F, fontSize: 14, bold: true,
      color: "FFFFFF", margin: 0, valign: "middle", lineSpacingMultiple: 1.05 });
  });

  // --- competitor table ---
  s.addShape(pres.ShapeType.line, { x: B(690), y: B(190), w: 0, h: B(470), line: { color: "1E4A70", width: 1 } });
  const TX = 718;
  const cols = [0, 175, 250, 480];
  const head = ["PLAYER", "SHARE", "CORE STRENGTH", "OUR GAP TO THEM"];
  head.forEach((h, i) => s.addText(h, { x: B(TX + (i === 3 ? 432 : cols[i])), y: B(214), w: B(i === 3 ? 200 : (i === 2 ? 230 : 160)), h: B(24),
    fontFace: F, fontSize: 10.5, bold: true, color: "9FBBD4", charSpacing: 1, margin: 0,
    align: i === 3 ? "right" : "left", valign: "middle" }));
  s.addShape(pres.ShapeType.line, { x: B(TX), y: B(240), w: B(608), h: 0, line: { color: "204A70", width: 1 } });

  const trows = [
    ["UNILEVER", "38%", "Laundry & Dishwash dominance", "−26pts", "FFFFFF", "FFFFFF", "FF6FAE"],
    ["P&G", "21%", "Fabric care & Air fresheners", "−9pts", "FFFFFF", "FFFFFF", "B6F04A"],
    ["OUR CO", "12%", "Fragmented across 3 segments", "baseline", "FF6FAE", "FF6FAE", "FFFFFF"],
    ["LOCAL PLAYERS", "29%", "Price-led, no brand equity", "Opportunity to absorb", "FFFFFF", "FFFFFF", "FFFFFF"],
  ];
  const ry = [258, 318, 380, 432];
  trows.forEach((r, i) => {
    if (i === 1) return; // P&G drawn in the highlight block below
    const y = ry[i];
    s.addText(r[0], { x: B(TX), y: B(y), w: B(170), h: B(30), fontFace: F, fontSize: 12.5, bold: true, color: r[4], margin: 0, valign: "middle" });
    s.addText(r[1], { x: B(TX + 175), y: B(y), w: B(60), h: B(30), fontFace: F, fontSize: 12.5, bold: true, color: r[5], margin: 0, valign: "middle" });
    s.addText(r[2], { x: B(TX + 250), y: B(y), w: B(220), h: B(30), fontFace: F, fontSize: 11, color: "DCE9F5", margin: 0, valign: "middle" });
    s.addText(r[3], { x: B(TX + 480), y: B(y), w: B(152), h: B(30), fontFace: F, fontSize: 11, bold: true, color: r[6], align: "right", margin: 0, valign: "middle" });
    if (i < 3) s.addShape(pres.ShapeType.line, { x: B(TX), y: B(y + 44), w: B(608), h: 0, line: { color: "153755", width: 1 } });
  });
  // P&G highlight box + banner
  s.addShape(pres.ShapeType.roundRect, { x: B(700), y: B(302), w: B(644), h: B(64), rectRadius: 0.05,
    fill: { color: "0A3220" }, line: { color: "B6F04A", width: 2 } });
  s.addText("P&G", { x: B(TX), y: B(306), w: B(170), h: B(26), fontFace: F, fontSize: 12.5, bold: true, color: "FFFFFF", margin: 0, valign: "middle" });
  s.addText("21%", { x: B(TX + 175), y: B(306), w: B(60), h: B(26), fontFace: F, fontSize: 12.5, bold: true, color: "FFFFFF", margin: 0, valign: "middle" });
  s.addText("Fabric care & Air fresheners", { x: B(TX + 250), y: B(306), w: B(220), h: B(26), fontFace: F, fontSize: 11, color: "DCE9F5", margin: 0, valign: "middle" });
  s.addText("−9pts", { x: B(TX + 450), y: B(306), w: B(160), h: B(26), fontFace: F, fontSize: 11, bold: true, color: "B6F04A", align: "right", margin: 0, valign: "middle" });
  s.addShape(pres.ShapeType.rect, { x: B(708), y: B(336), w: B(600), h: B(26), fill: { color: "000000" }, line: { color: "000000", width: 0 } });
  s.addText("⚡ Nearest Competitor — 9-Point Gap Is Closeable in 3 Years.", {
    x: B(716), y: B(336), w: B(590), h: B(26), fontFace: F, fontSize: 11, bold: true, color: "B6F04A", margin: 0, valign: "middle" });

  s.addText("The 29% held by local players is structurally vulnerable — private label and rural distribution unlocks that share.", {
    x: B(706), y: B(482), w: B(636), h: B(60), fontFace: F, fontSize: 13, italic: true, bold: true,
    color: "4FB8E8", align: "center", margin: 0, valign: "middle", lineSpacingMultiple: 1.1 });

  const cards4 = [
    [706, 200, "0E2A16", "9BD84A", "🏆 Unilever: ", "Entrenched in laundry — do not chase."],
    [918, 200, "2A1030", "E86FBF", "🎯 P&G: ", "9pts gap — the real competitive battleground."],
    [1130, 208, "0A2438", "4FB8E8", "🏛 Local players: ", "29% share, no brand moat ripe for displacement."],
  ];
  cards4.forEach(([x, w, fill, line, lead, body]) => {
    s.addShape(pres.ShapeType.roundRect, { x: B(x), y: B(586), w: B(w), h: B(72), rectRadius: 0.05,
      fill: { color: fill }, line: { color: line, width: 1.5 } });
    s.addText([
      { text: lead, options: { bold: true, color: line } },
      { text: body, options: { color: "FFFFFF" } },
    ], { x: B(x + 10), y: B(590), w: B(w - 20), h: B(64), fontFace: F, fontSize: 10.5, margin: 0,
      valign: "middle", lineSpacingMultiple: 1.1 });
  });

  s.addShape(pres.ShapeType.rect, { x: 0, y: B(676), w: 13.3333, h: 7.5 - B(676),
    fill: { color: "000000" }, line: { color: "000000", width: 0 } });
  s.addText([
    { text: "THE 9-POINT GAP TO P&G IS THE MISSION. THE 26-POINT GAP TO UNILEVER IS THE CONTEXT.",
      options: { fontSize: 16, bold: true, color: "FFFFFF", breakLine: true } },
    { text: "Win the battle you can win first.", options: { fontSize: 13.5, italic: true, color: "5CE08A" } },
  ], { x: B(60), y: B(680), w: B(1256), h: B(84), fontFace: F, align: "center", valign: "middle",
    margin: 0, lineSpacingMultiple: 1.15 });
  s.addNotes("Pakistan home care 2024 share: Unilever 38%, Local & others 29%, P&G 21%, Our company 12%. Gap to P&G is 9pts (the mission); gap to Unilever is 26pts (the context).");
}

pres.writeFile({ fileName: "/home/claude/editable-slides.pptx" }).then(f => console.log("done", f));
