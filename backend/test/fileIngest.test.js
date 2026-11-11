import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import {
  ingestDocument, ingestImages, ingestImage, uploadsFromDocument, readZip, sniff, parseCsv, FileRejected, FILE_LIMITS,
} from '../services/fileIngest.js';
import {
  fallbackSource, composeBrief, sourceBriefText, redesignDeckOf, redesignPlanContext, attachRedesignSources,
  slideDatasetsText, tableToDataset, guessRedesignFile, applyIntent, rebaseSource,
} from '../services/sourceAnalysis.js';
import { uploadVisible } from '../services/layoutAgent.js';
import { validateAttachments } from '../middleware/attachments.js';

const dataUrl = (buf, mime = 'application/octet-stream') => `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
const doc = (name, buf, category) => ({ type: 'document', name, data: dataUrl(buf), ...(category ? { category } : {}) });

async function pngBuffer(w = 400, h = 300, color = { r: 200, g: 40, b: 90 }) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

async function makePptx() {
  const pptx = new PptxGenJS();
  const s1 = pptx.addSlide();
  s1.addText('Quarterly Results', { placeholder: undefined, x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 40 });
  s1.addText('Revenue grew 18% to $4.2M', { x: 0.5, y: 2, w: 9, h: 1 });
  s1.addNotes('Open with the headline number.');
  const s2 = pptx.addSlide();
  s2.addText('Regional split', { x: 0.5, y: 0.3, w: 9, h: 0.8 });
  s2.addTable([[{ text: 'Region' }, { text: 'Sales' }], [{ text: 'North' }, { text: '120' }], [{ text: 'South' }, { text: '95' }]], { x: 0.5, y: 1.5, w: 6 });
  s2.addChart(pptx.ChartType.bar, [{ name: 'Sales', labels: ['Q1', 'Q2', 'Q3'], values: [10, 20, 35] }], { x: 5, y: 1, w: 4, h: 3 });
  const png = await pngBuffer();
  s2.addImage({ data: dataUrl(png, 'image/png'), x: 1, y: 3, w: 3, h: 2 });
  return pptx.write({ outputType: 'nodebuffer' });
}

async function makeXlsx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Month</t></si><si><t>Revenue</t></si><si><t>Users</t></si><si><t>Jan</t></si><si><t>Feb</t></si><si><t>Mar &amp; Apr</t></si></sst>');
  zip.file('xl/styles.xml', '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Date</t></is></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1200.5</v></c><c r="C2"><v>30</v></c><c r="D2" s="1"><v>45292</v></c></row>
    <row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3"><v>1500</v></c><c r="C3"><v>42</v></c></row>
    <row r="4"><c r="A4" t="s"><v>5</v></c><c r="B4"><v>1710</v></c><c r="C4"><v>51</v></c></row>
  </sheetData></worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('sniff / validation gates', () => {
  it('identifies types by magic bytes', async () => {
    expect(sniff(await pngBuffer())).toBe('png');
    expect(sniff(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
    expect(sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toBe('ole');
    expect(sniff(Buffer.from('MZ\x90\x00'))).toBe('exe');
  });

  it('shape validation keeps image-only routes image-only', () => {
    expect(validateAttachments([{ type: 'document', name: 'a.pdf', data: 'data:application/pdf;base64,AAAA' }])).toMatch(/Only images/);
    expect(validateAttachments([{ name: 'x.svg', data: 'data:image/svg+xml;base64,AAAA' }])).toMatch(/supported image/);
    expect(validateAttachments([{ name: 'x.png', data: 'data:image/png;base64,AAAA' }])).toBeNull();
    expect(validateAttachments([{ type: 'document', name: 'a.pdf', data: 'data:application/pdf;base64,AAAA' }], 15, 'attachments', { allowDocuments: true })).toBeNull();
  });

  it('refuses dangerous / unsupported extensions with a reason', async () => {
    for (const [name, re] of [['run.exe', /aren't supported/], ['deck.pptm', /Macro-enabled/], ['old.ppt', /Save As/], ['x.svg', /security/], ['a.zip', /ZIP archives/], ['page.html', /aren't supported/]]) {
      await expect(ingestDocument(doc(name, Buffer.from('hello')))).rejects.toThrow(re);
    }
  });

  it('rejects a file whose bytes do not match its extension', async () => {
    await expect(ingestDocument(doc('report.pdf', Buffer.from('not a pdf')))).rejects.toThrow(/valid PDF/);
    await expect(ingestDocument(doc('data.xlsx', Buffer.from('%PDF-1.4 fake')))).rejects.toThrow(/valid \.xlsx/);
    await expect(ingestDocument(doc('notes.txt', Buffer.from('MZ\x90\x00 binary')))).rejects.toThrow(/executable/);
    await expect(ingestDocument(doc('data.csv', Buffer.from([0x61, 0, 0x62])))).rejects.toThrow(/text file/);
  });

  it('rejects password-protected / legacy Office containers and encrypted PDFs', async () => {
    await expect(ingestDocument(doc('deck.pptx', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4])))).rejects.toThrow(/password-protected/);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\ntrailer << /Encrypt 5 0 R >>\n%%EOF');
    await expect(ingestDocument(doc('locked.pdf', pdf))).rejects.toThrow(/password-protected/);
  });

  it('accepts a PDF and keeps it only as a transient payload', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n3 0 obj << /Type /Pages >> endobj\n%%EOF');
    const r = await ingestDocument(doc('brief.pdf', pdf));
    expect(r.doc.kind).toBe('pdf');
    expect(r.doc.meta.pages).toBe(2);
    expect(r.pdf.data).toBe(pdf.toString('base64'));
    expect(r.doc.data).toBeUndefined();
  });

  it('enforces the PDF page limit', async () => {
    const pages = Array.from({ length: FILE_LIMITS.pdfPages + 1 }, (_, i) => `${i} 0 obj << /Type /Page >> endobj`).join('\n');
    await expect(ingestDocument(doc('long.pdf', Buffer.from(`%PDF-1.4\n${pages}`)))).rejects.toThrow(/pages/);
  });
});

describe('zip safety', () => {
  it('rejects path traversal entries', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('../../evil.sh', 'rm -rf /');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    expect(() => readZip(buf, 'x.docx')).toThrow(/unsafe paths/);
  });

  it('rejects compression bombs by ratio', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('word/document.xml', 'A'.repeat(20 * 1024 * 1024)); // compresses ~1000:1
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(() => readZip(buf, 'bomb.docx')).toThrow(/compression bomb/);
  });

  it('rejects macro parts and XML entity declarations', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>');
    zip.file('word/vbaProject.bin', 'macro');
    await expect(ingestDocument(doc('m.docx', await zip.generateAsync({ type: 'nodebuffer' })))).rejects.toThrow(/macros/);

    const xxe = new JSZip();
    xxe.file('[Content_Types].xml', '<Types/>');
    xxe.file('word/document.xml', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><w:document/>');
    await expect(ingestDocument(doc('x.docx', await xxe.generateAsync({ type: 'nodebuffer' })))).rejects.toThrow(/XML declarations/);
  });
});

describe('extraction', () => {
  it('reads a PPTX: titles, text, tables, charts, notes, pictures tied to slides', async () => {
    const r = await ingestDocument(doc('Q3 review.pptx', await makePptx(), 'redesign'));
    expect(r.doc.purpose).toBe('redesign');
    expect(r.doc.meta.slides).toBe(2);
    const [s1, s2] = r.doc.deck.slides;
    expect(s1.content).toMatch(/Quarterly Results/);
    expect(s1.content).toMatch(/\$4\.2M/);
    expect(s1.content).toMatch(/Speaker notes: Open with the headline number/);
    expect(s2.content).toMatch(/\| North \| 120 \|/);
    expect(s2.content).toMatch(/Chart \(column\)[\s\S]*Q1 \| Q2 \| Q3[\s\S]*10 \| 20 \| 35/);
    expect(r.images).toHaveLength(1);
    expect(r.images[0].slides).toEqual([2]);
    expect(r.images[0].data).toMatch(/^data:image\/(jpeg|png);base64,/);
  });

  it('reads an XLSX: shared strings, numbers, dates, entities', async () => {
    const r = await ingestDocument(doc('kpis.xlsx', await makeXlsx()));
    expect(r.doc.digest).toMatch(/Sheet "Summary": 4 row\(s\)/);
    expect(r.doc.digest).toMatch(/Jan \| 1200\.5 \| 30 \| 2024-01-01/);
    expect(r.doc.digest).toMatch(/Mar & Apr \| 1710 \| 51/);
    const ds = tableToDataset(r.doc.tables[0].rows, 'kpis.xlsx', 'd1');
    expect(ds.categories).toEqual(['Jan', 'Feb', 'Mar & Apr']);
    expect(ds.series[0]).toEqual({ name: 'Revenue', values: [1200.5, 1500, 1710] });
  });

  it('reads a DOCX with headings, lists and tables', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('word/document.xml', `<w:document><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Launch plan</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Ship in March</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Budget</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>$50k</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`);
    const r = await ingestDocument(doc('plan.docx', await zip.generateAsync({ type: 'nodebuffer' })));
    expect(r.doc.digest).toBe('# Launch plan\n- Ship in March\n| Budget | $50k |');
  });

  it('parses CSV with quotes and validates JSON', async () => {
    expect(parseCsv('a,b\n"x, y",2\n"say ""hi""",3\n')).toEqual([['a', 'b'], ['x, y', '2'], ['say "hi"', '3']]);
    await expect(ingestDocument(doc('d.json', Buffer.from('{bad')))).rejects.toThrow(/JSON is invalid/);
    const r = await ingestDocument(doc('d.csv', Buffer.from('city;sales\nLahore;10\nKarachi;12\n')));
    expect(r.doc.digest).toMatch(/Lahore \| 10/);
  });
});

// Mirrors routes/presentations.js gatherBriefFiles: user images, then file pictures.
async function brief(images, docs) {
  const userImages = await ingestImages(images);
  const documents = []; const extracted = [];
  for (const d of docs) {
    const r = await ingestDocument(d);
    documents.push(r.doc);
    extracted.push(...uploadsFromDocument(r.doc, r.images, { assetId: `a-${documents.length}`, room: FILE_LIMITS.maxExtractedImages - extracted.length }));
  }
  return { uploads: [...userImages, ...extracted], documents };
}

describe('brief files', () => {
  it('puts user images first, then file pictures tied to their source', async () => {
    const png = await pngBuffer(200, 200);
    const out = await brief(
      [{ type: 'image', name: 'logo.png', data: dataUrl(png, 'image/png'), category: 'branding' }],
      [doc('Q3 review.pptx', await makePptx()), doc('kpis.xlsx', await makeXlsx())],
    );
    expect(out.uploads).toHaveLength(2);
    expect(out.uploads[0].category).toBe('branding');
    expect(out.uploads[1]).toMatchObject({ category: 'document', source_doc: 'Q3 review.pptx', source_asset: 'a-1', slides: [2] });
    expect(out.documents[0].purpose).toBe('auto');
    expect(out.documents[1].tables).toBeTruthy();
  });

  it('caps images and refuses redesign of non-decks', async () => {
    const many = Array.from({ length: FILE_LIMITS.maxImages + 1 }, (_, i) => ({ name: `i${i}.png`, data: 'data:image/png;base64,AAAA' }));
    await expect(ingestImages(many)).rejects.toBeInstanceOf(FileRejected);
    await expect(ingestDocument(doc('x.xlsx', await makeXlsx(), 'redesign'))).rejects.toThrow(/only PowerPoint/);
  });

  it('rejects images that are not really images', async () => {
    await expect(ingestImage({ name: 'a.png', data: dataUrl(Buffer.from('<svg onload=alert(1)>'), 'image/png') })).rejects.toThrow(/supported image/);
  });
});

describe('intent (no toggle): redesign or use as material', () => {
  it('reads the intent from the prompt', async () => {
    const { documents } = await brief([], [doc('board.pptx', await makePptx()), doc('kpis.xlsx', await makeXlsx())]);
    expect(guessRedesignFile('Make this deck better', documents)).toBe('board.pptx');
    expect(guessRedesignFile('Please redesign board and add the KPI numbers', documents)).toBe('board.pptx');
    expect(guessRedesignFile('A sales kickoff deck for 2027 using last year\'s numbers', documents)).toBe('');
    const solo = (await brief([], [doc('board.pptx', await makePptx())])).documents;
    expect(guessRedesignFile('', solo)).toBe('board.pptx');
    const applied = applyIntent(documents, { redesign_file: 'board.pptx' });
    expect(applied.map(d => d.purpose)).toEqual(['redesign', 'content']);
    expect(applyIntent(documents, { redesign_file: '' }).map(d => d.purpose)).toEqual(['content', 'content']);
  });

  it('rebases picture indices when the image count changed', () => {
    expect(rebaseSource({ visuals: [{ upload: 1 }] }, 2).visuals[0].upload).toBe(3);
  });
});

describe('source pack + redesign plumbing', () => {
  it('folds facts, datasets and redesign content into the right places', async () => {
    const out = await brief([], [doc('Q3 review.pptx', await makePptx()), doc('kpis.xlsx', await makeXlsx())]);
    const uploads = out.uploads;
    const source = fallbackSource(out.documents, uploads, 'Make this deck better');
    expect(source.redesign_file).toBe('Q3 review.pptx');
    expect(source.datasets[0].id).toBe('d1');
    const composed = composeBrief('Make this deck better', source);
    expect(composed.startsWith('Make this deck better')).toBe(true);
    expect(composed).toMatch(/SOURCE MATERIAL FROM THE USER'S FILES/);
    expect(composed).toMatch(/quality library/);
    expect(sourceBriefText(source)).toMatch(/1200\.5 \| 1500 \| 1710/);

    const deck = redesignDeckOf(applyIntent(out.documents, source));
    expect(redesignPlanContext(deck).count).toBe(2);
    const slides = attachRedesignSources([{ index: 0, title: 'A', source_slide: 1 }, { index: 1, title: 'B', source_slide: 2, datasets: ['d1'] }], deck, uploads);
    expect(slides[0].source_content).toMatch(/Quarterly Results/);
    expect(slides[1].source_content).toMatch(/Its pictures are UPLOAD 0/);
    expect(slideDatasetsText(slides[1], source)).toMatch(/\[d1\]/);

    // Deck pictures are only shown to the slide they came from.
    expect(uploadVisible(uploads[0], 0, slides[1])).toBe(true);
    expect(uploadVisible(uploads[0], 0, slides[0])).toBe(false);
    expect(uploadVisible(uploads[0], 0, null)).toBe(false);
    expect(uploadVisible({ data: 'x', category: 'branding' }, 3, null)).toBe(true);
    // Web photos and edit references are scoped to the slides they were assigned to.
    expect(uploadVisible({ data: 'x', category: 'web' }, 4, { uploads: [4] })).toBe(true);
    expect(uploadVisible({ data: 'x', category: 'web' }, 4, { uploads: [] })).toBe(false);
    expect(uploadVisible({ data: 'x', scoped: true }, 5, null)).toBe(false);
  });
});
