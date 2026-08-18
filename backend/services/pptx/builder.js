// STEP 3 of the img2pptx workflow: build the deck. This is tools/build_template.js
// with its per-slide block driven by an analyzer spec instead of hand-written.
//
// The one rule survives intact: every coordinate arriving here is in SOURCE-IMAGE
// PIXELS, and px() is the only place inches appear. The same divisor converts x
// and y — the slide layout is defined from the image's own aspect ratio, so
// nothing is stretched.
//
// Z-order is the order things are added, and it is fixed: plate → raster cutouts
// → shapes → charts → text. Text is never buried.
import PptxGenJS from 'pptxgenjs';
import { cleanPlate, cutout, toEmbeddablePng, imageInfo } from './plate.js';
import { eraseRegions } from './spec.js';
import { logger } from '../logger.js';

// AI renders lean on condensed display faces that don't exist on the target
// machine. Pick one available font and commit to it, per the SOP's fidelity
// ceilings — mixing substitutes looks worse than one honest fallback.
const FONT = 'Arial';

// PowerPoint's own maximum slide edge is 56in; ours are far smaller, but keep a
// sane cap so an odd aspect ratio can't produce a degenerate layout.
const MAX_EDGE = 20;

function layoutFor(width, height) {
  const ratio = width / height;
  // Widescreen decks keep the familiar 13.333 x 7.5 canvas; anything else is
  // sized to match the render so the image fills the slide exactly.
  if (Math.abs(ratio - 16 / 9) < 0.02) return { w: 13.3333, h: 7.5 };
  if (ratio >= 1) return { w: Math.min(13.3333, MAX_EDGE), h: Math.min(13.3333 / ratio, MAX_EDGE) };
  return { w: Math.min(7.5 * ratio, MAX_EDGE), h: 7.5 };
}

const CHART_MAP = {
  doughnut: { type: 'doughnut' },
  pie: { type: 'pie' },
  bar: { type: 'bar', barDir: 'bar' },
  column: { type: 'bar', barDir: 'col' },
  line: { type: 'line' },
  area: { type: 'area' },
};

// Renders one measured slide. `plateBuffer` is the cleaned background (the
// original image with every rebuilt region erased); `cutouts` are the raster
// pieces already cut from the pre-erase plate.
function renderMeasuredSlide(pres, slide, spec, plate, cutouts, px) {
  slide.background = { color: spec.background_color || '111111' };

  // 1. the plate (back)
  if (plate) {
    slide.addImage({ data: `image/png;base64,${plate.toString('base64')}`, x: 0, y: 0, w: '100%', h: '100%' });
  }

  // 2. raster cutouts
  for (const piece of cutouts) {
    slide.addImage({
      data: `image/png;base64,${piece.buffer.toString('base64')}`,
      x: px(piece.x), y: px(piece.y), w: px(piece.w), h: px(piece.h),
    });
  }

  // 3. shapes
  for (const el of spec.elements) {
    if (el.kind === 'rect') {
      slide.addShape(el.radius > 0 ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
        x: px(el.x), y: px(el.y), w: px(el.w), h: px(el.h),
        fill: el.fill ? { color: el.fill } : { type: 'none' },
        line: el.line ? { color: el.line, width: el.lineW } : { type: 'none' },
        // rectRadius is a fraction of the shorter side, and only applies to roundRect.
        ...(el.radius > 0 ? { rectRadius: Math.min(0.5, el.radius / Math.max(1, Math.min(el.w, el.h))) } : {}),
      });
    } else if (el.kind === 'ellipse') {
      slide.addShape(pres.ShapeType.ellipse, {
        x: px(el.x), y: px(el.y), w: px(el.w), h: px(el.h),
        fill: el.fill ? { color: el.fill } : { type: 'none' },
        line: el.line ? { color: el.line, width: el.lineW } : { type: 'none' },
      });
    } else if (el.kind === 'line') {
      slide.addShape(pres.ShapeType.line, {
        x: px(el.x), y: px(el.y), w: px(el.w), h: px(el.h),
        line: { color: el.color, width: el.width },
      });
    }
  }

  // 4. charts — native, so double-clicking one in PowerPoint opens the data sheet
  for (const el of spec.elements) {
    if (el.kind !== 'chart') continue;
    const mapped = CHART_MAP[el.chart] || CHART_MAP.column;
    const isPieFamily = el.chart === 'pie' || el.chart === 'doughnut';
    try {
      slide.addChart(
        pres.ChartType[mapped.type],
        [{ name: el.label || 'Series 1', labels: el.labels, values: el.values }],
        {
          x: px(el.x), y: px(el.y), w: px(el.w), h: px(el.h),
          ...(mapped.barDir ? { barDir: mapped.barDir } : {}),
          ...(el.chart === 'doughnut' ? { holeSize: el.hole } : {}),
          ...(el.colors ? { chartColors: el.colors } : {}),
          showLegend: false,
          showTitle: false,
          showValue: !isPieFamily && el.showValue,
          showPercent: false,
          // 'outEnd' corrupts stacked charts; centred labels are always safe.
          dataLabelPosition: isPieFamily ? 'ctr' : 'inEnd',
          catGridLine: { style: 'none' },
          valGridLine: { style: 'none' },
        }
      );
    } catch (err) {
      // A chart that won't serialise would take the whole file down with it.
      logger.warn('pptx: chart skipped', { errorMessage: err.message, chart: el.chart });
    }
  }

  // 5. text (front)
  for (const el of spec.elements) {
    if (el.kind !== 'text') continue;
    const fontSize = Math.max(4, Math.round(px(el.size) * 72 * 10) / 10);
    const body = el.runs
      ? el.runs.map(r => ({
          text: r.t,
          options: { color: r.c || el.color, bold: r.b || el.bold, italic: r.i || el.italic, fontSize },
        }))
      : el.text;
    slide.addText(body, {
      x: px(el.x), y: px(el.y), w: px(el.w), h: px(el.h),
      fontFace: FONT, fontSize,
      color: el.color, bold: el.bold, italic: el.italic,
      align: el.align, valign: el.valign,
      margin: 0, charSpacing: el.spacing, lineSpacingMultiple: el.lineSpacing,
      // AI slides size their type to the art; let a substituted font overflow
      // its measured box rather than silently shrinking the headline.
      shrinkText: false, wrap: true,
    });
  }

  if (spec.notes) slide.addNotes(spec.notes);
}

// The fallback every failure path lands on: the slide as one full-bleed picture.
// Not editable, but a valid, correctly sized slide — an export that always works.
function renderImageSlide(slide, pngBuffer, backgroundColor) {
  slide.background = { color: backgroundColor || '111111' };
  if (pngBuffer) {
    slide.addImage({ data: `image/png;base64,${pngBuffer.toString('base64')}`, x: 0, y: 0, w: '100%', h: '100%' });
  }
}

function addWatermark(slide, layout) {
  slide.addText('Made with HyperBeing', {
    x: layout.w - 2.6, y: layout.h - 0.42, w: 2.4, h: 0.28,
    fontFace: FONT, fontSize: 9, color: 'FFFFFF', transparency: 45,
    align: 'right', valign: 'middle', margin: 0,
  });
}

/**
 * Builds the .pptx.
 *
 * @param {Array} slides  [{ index, title, buffer, spec|null }] in deck order.
 *                        `buffer` is the slide render; `spec` is its measurement
 *                        (null → that slide falls back to a full-bleed image).
 * @param {{title?:string, author?:string, watermark?:boolean}} opts
 * @returns {Promise<{buffer: Buffer, editableSlides: number, totalSlides: number}>}
 */
export async function buildDeck(slides, opts = {}) {
  const pres = new PptxGenJS();

  // Layout comes off the first readable render, and MUST be set before the
  // first addSlide() — the default canvas is 10in wide, not 13.33.
  let layout = { w: 13.3333, h: 7.5 };
  for (const s of slides) {
    const info = s.info || (s.buffer ? await imageInfo(s.buffer) : null);
    if (info) { layout = layoutFor(info.width, info.height); break; }
  }
  pres.defineLayout({ name: 'HB', width: layout.w, height: layout.h });
  pres.layout = 'HB';
  pres.author = opts.author || 'HyperBeing';
  pres.title = opts.title || 'Presentation';

  let editableSlides = 0;

  for (const item of slides) {
    const slide = pres.addSlide();
    const spec = item.spec;
    const info = item.info || (item.buffer ? await imageInfo(item.buffer) : null);

    if (!item.buffer || !info) {
      renderImageSlide(slide, null, spec?.background_color);
      if (opts.watermark) addWatermark(slide, layout);
      continue;
    }

    const px = (p) => (p * layout.w) / info.width;

    if (!spec || spec.elements.length === 0) {
      renderImageSlide(slide, await toEmbeddablePng(item.buffer), spec?.background_color);
      if (opts.watermark) addWatermark(slide, layout);
      continue;
    }

    try {
      // Cutouts come from a plate where the LIVE overlays are already erased but
      // the raster objects are still whole; the background plate then also has
      // the raster objects erased. Nothing exists twice, in either direction.
      const rasters = spec.elements.filter(e => e.kind === 'raster');
      const liveRegions = eraseRegions({ ...spec, elements: spec.elements.filter(e => e.kind !== 'raster') });
      const cutoutSource = await cleanPlate(item.buffer, liveRegions, info.width, info.height);

      const cutouts = [];
      for (const r of rasters) {
        cutouts.push(await cutout(cutoutSource, r, info.width, info.height));
      }

      const rasterRegions = rasters.map(r => ({ type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, radius: r.radius, grow: 4 }));
      const plate = rasterRegions.length
        ? await cleanPlate(cutoutSource, rasterRegions, info.width, info.height)
        : cutoutSource;

      renderMeasuredSlide(pres, slide, spec, await toEmbeddablePng(plate), cutouts, px);
      editableSlides++;
    } catch (err) {
      logger.warn('pptx: slide fell back to flat image', { slideIndex: item.index, errorMessage: err.message });
      renderImageSlide(slide, await toEmbeddablePng(item.buffer), spec?.background_color);
    }

    if (opts.watermark) addWatermark(slide, layout);
  }

  const buffer = await pres.write({ outputType: 'nodebuffer' });
  return { buffer: Buffer.from(buffer), editableSlides, totalSlides: slides.length };
}
