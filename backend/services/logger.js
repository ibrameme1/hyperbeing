import { AsyncLocalStorage } from 'async_hooks';
import { getDb } from '../database.js';

// ─── Request context (propagated automatically through async call chains) ───
export const requestContext = new AsyncLocalStorage();

// ─── Level filtering ─────────────────────────────────────────────────────────
const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_RANK = LEVEL_RANK[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVEL_RANK.info;

// ─── Rolling DB log retention ────────────────────────────────────────────────
const MAX_DB_LOGS = 10_000;
let writesSinceClean = 0;

function persistLog(level, message, context) {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO app_logs (level, message, context) VALUES (?, ?, ?)'
    ).run(level, message, JSON.stringify(context));

    if (++writesSinceClean >= 200) {
      writesSinceClean = 0;
      db.prepare(
        `DELETE FROM app_logs WHERE id NOT IN (
           SELECT id FROM app_logs ORDER BY id DESC LIMIT ?
         )`
      ).run(MAX_DB_LOGS);
    }
  } catch {
    // Never let logging crash the app
  }
}

// ─── Core write function ─────────────────────────────────────────────────────
function write(level, message, meta = {}) {
  if (LEVEL_RANK[level] < MIN_RANK) return;

  const ctx = requestContext.getStore() || {};
  const entry = {
    level,
    ts: new Date().toISOString(),
    message,
    ...ctx,
    ...meta,
  };

  // Strip undefined values for cleaner output
  const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));

  const output = JSON.stringify(clean);
  if (level === 'error') process.stderr.write(output + '\n');
  else process.stdout.write(output + '\n');

  // Persist info/warn/error to DB (skip debug — too noisy)
  if (LEVEL_RANK[level] >= LEVEL_RANK.info) {
    const { level: _l, ts: _t, message: _m, ...context } = clean;
    persistLog(level, message, context);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────
export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info:  (msg, meta) => write('info',  msg, meta),
  warn:  (msg, meta) => write('warn',  msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Serialise an Error into plain fields safe for JSON logging. */
export function serializeError(err) {
  if (!(err instanceof Error)) return { raw: String(err) };
  return {
    errorMessage: err.message,
    errorName: err.name,
    stack: err.stack?.split('\n').slice(0, 6).join('\n'),
  };
}
