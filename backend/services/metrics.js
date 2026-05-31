// ─── In-memory metrics store ─────────────────────────────────────────────────
// All data is ephemeral (reset on restart). For durable metrics, query the DB.

const startedAt = Date.now();

// Counters: { key: number }
const counters = {};

// Route latency: { 'GET /api/foo': { count, totalMs, errors, samples[] } }
const routes = {};

// AI call stats
const ai = {
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalLatencyMs: 0,
  errors: 0,
  byFunction: {},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Replace UUID-like segments and numeric IDs in paths for metric grouping. */
function normalizePath(p) {
  return p
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n');
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const metrics = {
  /** Increment a named counter (with optional tag suffix). */
  increment(key) {
    counters[key] = (counters[key] || 0) + 1;
  },

  /** Record an HTTP request after it completes. */
  recordRequest(method, rawPath, statusCode, durationMs) {
    const key = `${method} ${normalizePath(rawPath)}`;
    if (!routes[key]) routes[key] = { count: 0, totalMs: 0, errors: 0, samples: [] };
    const r = routes[key];
    r.count++;
    r.totalMs += durationMs;
    if (statusCode >= 500) r.errors++;
    r.samples.push(durationMs);
    if (r.samples.length > 200) r.samples.shift(); // rolling window
  },

  /** Record a Claude API call. */
  recordAICall({ fn, inputTokens = 0, outputTokens = 0, durationMs = 0, error = false }) {
    ai.totalCalls++;
    ai.totalInputTokens += inputTokens;
    ai.totalOutputTokens += outputTokens;
    ai.totalLatencyMs += durationMs;
    if (error) ai.errors++;

    if (!ai.byFunction[fn]) ai.byFunction[fn] = { calls: 0, errors: 0, totalMs: 0, tokens: 0 };
    const f = ai.byFunction[fn];
    f.calls++;
    f.totalMs += durationMs;
    f.tokens += inputTokens + outputTokens;
    if (error) f.errors++;
  },

  /** Return a point-in-time snapshot for the metrics endpoint. */
  snapshot() {
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const routeSummary = Object.entries(routes)
      .map(([route, r]) => ({
        route,
        requests: r.count,
        errorsHttp5xx: r.errors,
        errorRatePct: r.count ? +((r.errors / r.count) * 100).toFixed(1) : 0,
        avgMs: r.count ? Math.round(r.totalMs / r.count) : 0,
        p95Ms: percentile(r.samples, 95),
        p99Ms: percentile(r.samples, 99),
      }))
      .sort((a, b) => b.requests - a.requests);

    const aiFunctions = Object.entries(ai.byFunction).map(([fn, f]) => ({
      fn,
      calls: f.calls,
      errors: f.errors,
      avgMs: f.calls ? Math.round(f.totalMs / f.calls) : 0,
      avgTokens: f.calls ? Math.round(f.tokens / f.calls) : 0,
    }));

    return {
      uptimeSec,
      uptimeHuman: formatUptime(uptimeSec),
      startedAt: new Date(startedAt).toISOString(),
      counters,
      http: {
        totalRequests: Object.values(routes).reduce((s, r) => s + r.count, 0),
        totalErrors: Object.values(routes).reduce((s, r) => s + r.errors, 0),
        routes: routeSummary,
      },
      ai: {
        totalCalls: ai.totalCalls,
        totalErrors: ai.errors,
        totalInputTokens: ai.totalInputTokens,
        totalOutputTokens: ai.totalOutputTokens,
        avgLatencyMs: ai.totalCalls ? Math.round(ai.totalLatencyMs / ai.totalCalls) : 0,
        byFunction: aiFunctions,
      },
    };
  },
};

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}
