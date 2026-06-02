import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'hyperbeing.db');

const db = new Database(DB_PATH);

const TARGET_CREDITS = 15;

const result = db.prepare(`
  UPDATE subscriptions
  SET credits_remaining = ?,
      credits_total      = MAX(credits_total, ?),
      updated_at         = CURRENT_TIMESTAMP
  WHERE plan = 'free'
    AND credits_remaining < ?
`).run(TARGET_CREDITS, TARGET_CREDITS, TARGET_CREDITS);

console.log(`Topped up ${result.changes} free-plan user(s) to ${TARGET_CREDITS} credits.`);

db.close();
