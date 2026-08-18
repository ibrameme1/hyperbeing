const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5

const S = 13.3333 / 1376;           // uniform px -> inch
const P = p => p * S;

const PINK = "F52D6E", GREEN = "2BE86A", BAR = "0B4626", WHITE = "FFFFFF";
const F = "Arial";

const s = pres.addSlide();
s.background = { color: "000000" };

// ---------- Phone mockups (each an independent, movable, rotatable picture) ----------
// [file, centerX, centerY, w, h, rotation]  — drawn back-to-front
const phones = [
  ["phone2_isb.png",      408.4, 412.1, 267, 449, -11.5],
  ["phone1_dha.png",      166.0, 516.0, 208, 306, 0],
  ["phone3_lhr.png",      687.5, 419.0, 257, 468, 0],
  ["phone4_rickshaw.png", 975.0, 410.5, 236, 428, 13],
  ["phone5_seoul.png",   1224.5, 279.5, 207, 317, 0],
];
phones.forEach(([f, cx, cy, w, h, rot]) => {
  s.addImage({
    path: "/home/claude/" + f,
    x: P(cx - w / 2), y: P(cy - h / 2), w: P(w), h: P(h),
    rotate: rot,
  });
});

// ---------- Title ----------
s.addText(
  [
    { text: "FORMAT 01: ", options: { color: PINK } },
    { text: "POV SKITS,", options: { color: WHITE } },
    { text: " THE NOODLES DERAIL EVERYTHING.", options: { color: PINK } },
  ],
  { x: P(36), y: P(34), w: P(1310), h: P(66), fontFace: F, fontSize: 31, bold: true,
    charSpacing: -0.5, margin: 0, valign: "middle" }
);

// ---------- Subtitle ----------
s.addText("'The flavor is never the prop. It is always the punchline.'", {
  x: P(38), y: P(98), w: P(900), h: P(32),
  fontFace: F, fontSize: 15, italic: true, color: "EDEDED", margin: 0, valign: "middle",
});

// ---------- Hook rule callout ----------
s.addShape(pres.ShapeType.roundRect, {
  x: P(40), y: P(206), w: P(266), h: P(155),
  fill: { color: PINK }, rectRadius: 0.12, line: { color: PINK, width: 0 },
});
s.addText(
  [
    { text: "HOOK RULE:", options: { fontSize: 15, bold: true, breakLine: true } },
    { text: "First 2 seconds must break expectation. ", options: { fontSize: 12.5, bold: true } },
    { text: "No setup. Straight to the bit.", options: { fontSize: 12.5 } },
  ],
  { x: P(52), y: P(212), w: P(242), h: P(143), fontFace: F, color: WHITE,
    margin: 0, valign: "middle", lineSpacingMultiple: 1.1 }
);

// ---------- Production brief callout ----------
s.addShape(pres.ShapeType.roundRect, {
  x: P(1030), y: P(457), w: P(310), h: P(191),
  fill: { color: "000000" }, rectRadius: 0.1, line: { color: GREEN, width: 2 },
});
s.addText(
  [
    { text: "PRODUCTION BRIEF:", options: { fontSize: 14.5, bold: true, color: GREEN, breakLine: true } },
    { text: "\u25B8 Phone camera only. No ring light. One take energy. Captions in Urdu-English mix.",
      options: { fontSize: 11.5, color: WHITE, breakLine: true } },
    { text: "Lo-fi = trustworthy.", options: { fontSize: 12, italic: true, bold: true, color: GREEN } },
  ],
  { x: P(1044), y: P(464), w: P(282), h: P(177), fontFace: F, margin: 0,
    valign: "middle", lineSpacingMultiple: 1.12 }
);

// ---------- Bottom bar ----------
s.addShape(pres.ShapeType.rect, {
  x: 0, y: P(672), w: 13.3333, h: 7.5 - P(672),
  fill: { color: BAR }, line: { color: BAR, width: 0 },
});
s.addText(
  [
    { text: "THE SCENARIO IS ALWAYS RELATABLE. THE NOODLES ARE ALWAYS THE CHAOS AGENT.",
      options: { fontSize: 20, bold: true, color: WHITE, breakLine: true } },
    { text: "15\u201330 seconds. No script. Maximum commitment to the bit.",
      options: { fontSize: 16, italic: true, color: GREEN } },
  ],
  { x: 0, y: P(672), w: 13.3333, h: 7.5 - P(672), fontFace: F, align: "center",
    valign: "middle", margin: 0, lineSpacingMultiple: 1.15 }
);

s.addNotes("Format 01 of the Knorr Global Flavours social content system: POV skits where the noodles are the chaos agent. 15-30s, phone-shot, lo-fi, Urdu-English captions.");

pres.writeFile({ fileName: "/home/claude/knorr-format-01-editable.pptx" }).then(f => console.log("done", f));
