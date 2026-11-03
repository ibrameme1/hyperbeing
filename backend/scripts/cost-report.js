// Actual AI spend from the ai_costs table (one row per Claude / image call).
//
// Usage (from backend/):
//   node scripts/cost-report.js                              # last 30 days
//   node scripts/cost-report.js --from 2026-11-01 --to 2026-12-01
//   node scripts/cost-report.js --deck <presentationId>      # every call of one deck
//   node scripts/cost-report.js --csv > costs.csv            # raw rows for a spreadsheet
import 'dotenv/config';
import { initDatabase, getDb } from '../database.js';
import { buildCostReport, costRowsCsv, deckCostDetail } from '../services/costReport.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
};
initDatabase();
const db = getDb();
const usd = (v, d = 4) => '$' + (v || 0).toFixed(d);
const num = (v) => Math.round(v || 0).toLocaleString('en-US');

if (process.argv.includes('--csv')) {
  process.stdout.write(costRowsCsv(db, { from: arg('from'), to: arg('to'), presentationId: arg('deck') }) + '\n');
  process.exit(0);
}

if (arg('deck')) {
  const d = deckCostDetail(db, arg('deck'));
  const calls = d.groups.reduce((s, g) => s + g.calls.length, 0);
  console.log(`Deck ${d.presentationId}: ${usd(d.total)} in ${calls} calls\n`);
  for (const g of d.groups) {
    console.log(`${g.slide === null ? 'Deck-level' : 'Slide ' + g.slide}: ${usd(g.cost)}`);
    for (const c of g.calls) {
      const tokens = `in ${num(c.input_tokens)} · cache w ${num(c.cache_write_tokens)} r ${num(c.cache_read_tokens)} · out ${num(c.output_tokens)}`;
      console.log(`  ${c.created_at.slice(11, 19)}  ${c.operation.padEnd(12)} ${c.call.padEnd(22)} ${usd(c.cost_usd)}  ${tokens}${c.images ? ' · image' : ''}${c.estimated ? ' (est.)' : ''}`);
    }
  }
  process.exit(0);
}

const r = buildCostReport(db, { from: arg('from'), to: arg('to') });
const t = r.totals;
console.log(`AI spend ${r.range.from} → ${r.range.to}`);
console.log(`  total ${usd(t.cost, 2)}  (Claude ${usd(t.claude, 2)} · images ${usd(t.images, 2)})  ${num(t.calls)} calls · ${num(t.image_count)} images · ${num(t.decks)} decks`);
if (t.estimated) console.log(`  ${usd(t.estimated, 2)} of it uses estimated prices (image models without a published price)`);

const s = r.perSlide;
console.log(`\nPer generated slide (n=${s.total.n}):`);
for (const [key, label] of [['total', 'total'], ['claude', 'Claude'], ['images', 'images']]) {
  const d = s[key];
  console.log(`  ${label.padEnd(7)} avg ${usd(d.avg)} · p50 ${usd(d.p50)} · p90 ${usd(d.p90)} · min ${usd(d.min)} · max ${usd(d.max)}`);
}
console.log(`  images per slide avg ${s.imagesPerSlide.avg.toFixed(1)} (max ${s.imagesPerSlide.max}) · layout output tokens p50 ${num(s.layoutOutputTokens.p50)}`);
console.log(`Deck overhead (outline, design, cache warm-up) per deck: avg ${usd(r.deckOverhead.avg)} (n=${r.deckOverhead.n})`);
console.log(`AI edits: avg ${usd(r.aiEdits.avg)} per edit (n=${r.aiEdits.n})`);
console.log(`Layout prompt cache: ${(r.cache.hit_rate * 100).toFixed(0)}% of layout calls read it · ${num(r.cache.read)} tokens read vs ${num(r.cache.write)} written`);

console.log('\nBy call:');
for (const c of r.byCall) {
  console.log(`  ${(c.provider + ' ' + c.call).padEnd(34)} ${String(c.calls).padStart(5)}× avg ${usd(c.avg_cost)} = ${usd(c.cost, 2)}${c.estimated ? ' (est.)' : ''}`);
}
console.log('\nBy operation:');
for (const o of r.byOperation) console.log(`  ${o.operation.padEnd(18)} ${String(o.calls).padStart(5)} calls  ${usd(o.cost, 2)}`);
process.exit(0);
