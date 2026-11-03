// Aggregations over `ai_costs` (one row per AI call — see services/aiCosts.js).
// Shared by the admin Costs tab (GET /api/admin/costs) and
// scripts/cost-report.js, so both always show the same numbers.

const SLIDE_OPS = ['deck_create', 'retry', 'add_slides', 'unlock'];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

function dist(values) {
  const v = [...values].sort((a, b) => a - b);
  const sum = v.reduce((a, b) => a + b, 0);
  return {
    n: v.length, total: sum, avg: v.length ? sum / v.length : 0,
    min: v[0] || 0, p50: percentile(v, 50), p90: percentile(v, 90), max: v[v.length - 1] || 0,
  };
}

/**
 * @param db   better-sqlite3 handle
 * @param opts { from, to } ISO dates (inclusive from, exclusive to); default last 30 days
 */
export function buildCostReport(db, { from = null, to = null } = {}) {
  const fromTs = from || new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const toTs = to || new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  const where = 'created_at >= ? AND created_at < ?';
  const args = [fromTs, toTs];
  const q = (sql, ...extra) => db.prepare(sql).all(...args, ...extra);

  const totals = db.prepare(`
    SELECT COUNT(*) calls, COALESCE(SUM(cost_usd),0) cost,
      COALESCE(SUM(CASE WHEN provider='anthropic' THEN cost_usd END),0) claude,
      COALESCE(SUM(CASE WHEN provider<>'anthropic' THEN cost_usd END),0) images,
      COALESCE(SUM(CASE WHEN estimated=1 THEN cost_usd END),0) estimated,
      COALESCE(SUM(images),0) image_count,
      COUNT(DISTINCT presentation_id) decks
    FROM ai_costs WHERE ${where}`).get(...args);

  const daily = q(`
    SELECT substr(created_at,1,10) day,
      SUM(CASE WHEN provider='anthropic' THEN cost_usd ELSE 0 END) claude,
      SUM(CASE WHEN provider<>'anthropic' THEN cost_usd ELSE 0 END) images,
      SUM(cost_usd) total, COUNT(*) calls
    FROM ai_costs WHERE ${where} GROUP BY day ORDER BY day`);

  const byOperation = q(`
    SELECT operation, COUNT(*) calls, SUM(cost_usd) cost, COUNT(DISTINCT presentation_id) decks
    FROM ai_costs WHERE ${where} GROUP BY operation ORDER BY cost DESC`);

  // Per call type: what one call of each kind costs and why (token mix).
  const byCall = q(`
    SELECT provider, model, call, COUNT(*) calls, SUM(cost_usd) cost, AVG(cost_usd) avg_cost,
      AVG(input_tokens) avg_input, AVG(cache_write_tokens) avg_cache_write, AVG(cache_read_tokens) avg_cache_read,
      AVG(output_tokens) avg_output, AVG(image_input_tokens) avg_image_input, AVG(duration_ms) avg_ms,
      MAX(estimated) estimated
    FROM ai_costs WHERE ${where} GROUP BY provider, model, call ORDER BY cost DESC`);

  // Per finished slide: everything attributed to one deck slide by the
  // generation flows (layout, review, images). Edits are reported separately.
  const slideRows = q(`
    SELECT presentation_id, slide_index,
      SUM(cost_usd) cost,
      SUM(CASE WHEN provider='anthropic' THEN cost_usd ELSE 0 END) claude,
      SUM(CASE WHEN provider<>'anthropic' THEN cost_usd ELSE 0 END) images,
      SUM(images) image_count,
      SUM(CASE WHEN call='designSlideLayout' THEN output_tokens ELSE 0 END) layout_output
    FROM ai_costs WHERE ${where} AND slide_index IS NOT NULL AND operation IN (${SLIDE_OPS.map(() => '?').join(',')})
    GROUP BY presentation_id, slide_index`, ...SLIDE_OPS);
  const perSlide = {
    total: dist(slideRows.map(r => r.cost)),
    claude: dist(slideRows.map(r => r.claude)),
    images: dist(slideRows.map(r => r.images)),
    imagesPerSlide: dist(slideRows.map(r => r.image_count)),
    layoutOutputTokens: dist(slideRows.map(r => r.layout_output)),
  };
  // Deck-level overhead (outline, deck design, cache warm-up, analysis) per deck.
  const deckOverhead = dist(q(`
    SELECT presentation_id, SUM(cost_usd) cost FROM ai_costs
    WHERE ${where} AND presentation_id IS NOT NULL AND slide_index IS NULL AND operation = 'deck_create'
    GROUP BY presentation_id`).map(r => r.cost));

  const aiEdits = dist(q(`
    SELECT presentation_id, slide_index, created_at, SUM(cost_usd) cost FROM ai_costs
    WHERE ${where} AND operation = 'ai_edit' GROUP BY presentation_id, slide_index, substr(created_at,1,16)`).map(r => r.cost));

  // Prompt cache on the big layout prefix: share of cached tokens read vs written.
  const cache = db.prepare(`
    SELECT COALESCE(SUM(cache_read_tokens),0) read, COALESCE(SUM(cache_write_tokens),0) write,
      COALESCE(SUM(input_tokens),0) uncached, COUNT(*) calls,
      SUM(CASE WHEN cache_read_tokens > 0 THEN 1 ELSE 0 END) hits
    FROM ai_costs WHERE ${where} AND call = 'designSlideLayout'`).get(...args);
  cache.hit_rate = cache.calls ? cache.hits / cache.calls : 0;

  const topDecks = q(`
    SELECT c.presentation_id, p.title, SUM(c.cost_usd) cost, COUNT(DISTINCT c.slide_index) slides,
      MIN(c.created_at) first_at, u.email
    FROM ai_costs c LEFT JOIN presentations p ON p.id = c.presentation_id LEFT JOIN users u ON u.id = c.user_id
    WHERE c.created_at >= ? AND c.created_at < ? AND c.presentation_id IS NOT NULL
    GROUP BY c.presentation_id ORDER BY cost DESC LIMIT 25`);

  const topUsers = q(`
    SELECT c.user_id, u.email, SUM(c.cost_usd) cost, COUNT(DISTINCT c.presentation_id) decks, COUNT(*) calls
    FROM ai_costs c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.created_at >= ? AND c.created_at < ? AND c.user_id IS NOT NULL
    GROUP BY c.user_id ORDER BY cost DESC LIMIT 25`);

  return { range: { from: fromTs, to: toTs }, totals, daily, byOperation, byCall, perSlide, deckOverhead, aiEdits, cache, topDecks, topUsers };
}

const CSV_COLS = ['id', 'created_at', 'user_id', 'presentation_id', 'slide_index', 'operation', 'provider', 'model', 'call',
  'input_tokens', 'cache_write_tokens', 'cache_read_tokens', 'output_tokens', 'image_input_tokens', 'web_searches', 'images',
  'cost_usd', 'estimated', 'duration_ms', 'meta'];

export function costRowsCsv(db, { from, to, presentationId = null } = {}) {
  const fromTs = from || new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const toTs = to || new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  const rows = presentationId
    ? db.prepare('SELECT * FROM ai_costs WHERE presentation_id = ? ORDER BY id').all(presentationId)
    : db.prepare('SELECT * FROM ai_costs WHERE created_at >= ? AND created_at < ? ORDER BY id').all(fromTs, toTs);
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [CSV_COLS.join(','), ...rows.map(r => CSV_COLS.map(c => esc(r[c])).join(','))].join('\n');
}

/** Every call for one deck, slide by slide (drill-down). */
export function deckCostDetail(db, presentationId) {
  const rows = db.prepare('SELECT * FROM ai_costs WHERE presentation_id = ? ORDER BY id').all(presentationId);
  const bySlide = new Map();
  for (const r of rows) {
    const k = r.slide_index === null ? 'deck' : String(r.slide_index);
    if (!bySlide.has(k)) bySlide.set(k, { slide: r.slide_index, cost: 0, calls: [] });
    const e = bySlide.get(k);
    e.cost += r.cost_usd;
    e.calls.push(r);
  }
  return { presentationId, total: rows.reduce((s, r) => s + r.cost_usd, 0), groups: [...bySlide.values()] };
}
