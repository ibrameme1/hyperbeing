// In-memory request trace store — last MAX_REQUESTS (500) requests, no persistence needed.

const MAX_REQUESTS = 500;

// Map<traceId, RequestTrace>
const store = new Map();
// Insertion-order array for eviction
const order = [];

// SSE listeners for the admin dashboard
const listeners = new Set();

function evictOldest() {
  while (order.length >= MAX_REQUESTS) {
    const oldest = order.shift();
    store.delete(oldest);
  }
}

function push(traceId) {
  const trace = store.get(traceId);
  if (!trace) return;
  for (const fn of listeners) {
    try { fn(trace); } catch {}
  }
}

export const tracer = {
  initRequest(traceId, userId, method, path) {
    if (!traceId) return;
    evictOldest();
    const trace = {
      traceId,
      userId: userId || null,
      method: method || '',
      path: path || '',
      startTime: Date.now(),
      steps: [],
      status: 'in-progress',
      totalDuration: null,
    };
    store.set(traceId, trace);
    order.push(traceId);
    push(traceId);
  },

  patchUserId(traceId, userId) {
    if (!traceId || !userId) return;
    const trace = store.get(traceId);
    if (trace && !trace.userId) {
      trace.userId = userId;
      push(traceId);
    }
  },

  recordStep(traceId, step, status, duration_ms, error = null) {
    if (!traceId) return;
    const trace = store.get(traceId);
    if (!trace) return;

    const existing = trace.steps.find(s => s.step === step);
    if (existing) {
      existing.status = status;
      if (duration_ms > 0) existing.duration_ms = duration_ms;
      if (error) existing.error = error;
    } else {
      trace.steps.push({
        step,
        status,
        startTime: Date.now(),
        duration_ms: duration_ms || 0,
        error: error || null,
      });
    }

    if (status === 'failed') {
      trace.status = 'failed';
      trace.totalDuration = Date.now() - trace.startTime;
    }
    push(traceId);
  },

  completeRequest(traceId) {
    if (!traceId) return;
    const trace = store.get(traceId);
    if (!trace || trace.status === 'failed') return;
    trace.status = 'completed';
    trace.totalDuration = Date.now() - trace.startTime;
    push(traceId);
  },

  failRequest(traceId, step, error) {
    if (!traceId) return;
    const trace = store.get(traceId);
    if (!trace) return;
    if (step) this.recordStep(traceId, step, 'failed', Date.now() - trace.startTime, error);
    trace.status = 'failed';
    trace.totalDuration = Date.now() - trace.startTime;
    push(traceId);
  },

  getRequest(traceId) {
    return store.get(traceId) || null;
  },

  getRequests() {
    return [...store.values()].reverse();
  },

  getNodeStats(windowMs = 300_000) {
    const cutoff = Date.now() - windowMs;
    const stats = {};
    for (const trace of store.values()) {
      if (trace.startTime < cutoff) continue;
      for (const s of trace.steps) {
        if (s.startTime < cutoff) continue;
        if (!stats[s.step]) stats[s.step] = { count: 0, totalMs: 0, errors: 0, lastError: null, lastErrorTime: null };
        const n = stats[s.step];
        n.count++;
        if (s.duration_ms > 0) n.totalMs += s.duration_ms;
        if (s.status === 'failed') {
          n.errors++;
          if (!n.lastErrorTime || s.startTime > n.lastErrorTime) {
            n.lastError = s.error;
            n.lastErrorTime = s.startTime;
          }
        }
      }
    }
    return Object.entries(stats).map(([step, n]) => ({
      step,
      count: n.count,
      avgMs: n.count > 0 ? Math.round(n.totalMs / n.count) : 0,
      errors: n.errors,
      lastError: n.lastError,
    }));
  },

  getRecentErrors(windowMs = 3_600_000) {
    const cutoff = Date.now() - windowMs;
    const grouped = {};
    for (const trace of store.values()) {
      if (trace.status !== 'failed') continue;
      for (const s of trace.steps) {
        if (s.status !== 'failed') continue;
        if (s.startTime < cutoff) continue;
        if (!grouped[s.step]) grouped[s.step] = { step: s.step, count: 0, failures: [] };
        grouped[s.step].count++;
        grouped[s.step].failures.push({
          traceId: trace.traceId,
          userId: trace.userId,
          error: s.error,
          timestamp: s.startTime,
          path: trace.path,
        });
      }
    }
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
