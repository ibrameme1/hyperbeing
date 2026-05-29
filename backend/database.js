import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'hyperbeing.db');

let db;

export function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      meta_id TEXT UNIQUE,
      tiktok_id TEXT UNIQUE,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS presentations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT DEFAULT 'Untitled Presentation',
      status TEXT DEFAULT 'chat',
      slide_plan TEXT,
      slides_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      presentation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      history TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      plan TEXT DEFAULT 'free',
      stripe_customer_id TEXT UNIQUE,
      stripe_subscription_id TEXT UNIQUE,
      status TEXT DEFAULT 'active',
      credits_remaining INTEGER DEFAULT 5,
      credits_total INTEGER DEFAULT 5,
      current_period_end DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      presentation_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrate: OAuth columns
  for (const col of [
    'ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE',
    'ALTER TABLE users ADD COLUMN meta_id TEXT UNIQUE',
    'ALTER TABLE users ADD COLUMN tiktok_id TEXT UNIQUE',
    'ALTER TABLE users ADD COLUMN avatar TEXT',
  ]) {
    try { db.exec(col); } catch { /* already exists */ }
  }

  // Migrate: add aspect_ratio column if it doesn't exist
  try {
    db.exec('ALTER TABLE presentations ADD COLUMN aspect_ratio TEXT DEFAULT "16:9"');
  } catch { /* column already exists */ }

  // Migrate: add thumbnail column for dashboard card previews
  try {
    db.exec('ALTER TABLE presentations ADD COLUMN thumbnail TEXT');
  } catch { /* column already exists */ }

  // Migrate: add profile_data for onboarding answers
  try {
    db.exec('ALTER TABLE users ADD COLUMN profile_data TEXT DEFAULT NULL');
  } catch { /* already exists */ }

  // Analytics events table for custom event tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      page TEXT,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
  `);

  // GDPR: anonymise analytics events older than 90 days by nullifying user_id
  function anonymiseOldAnalytics() {
    db.prepare(
      `UPDATE analytics_events SET user_id = NULL
       WHERE user_id IS NOT NULL AND created_at < datetime('now', '-90 days')`
    ).run();
  }
  anonymiseOldAnalytics();
  setInterval(anonymiseOldAnalytics, 24 * 60 * 60 * 1000);

  console.log('✅ Database ready');
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialised — call initDatabase() first');
  return db;
}
