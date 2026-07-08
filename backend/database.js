import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'hyperbeing.db');

export { DATA_DIR, DB_PATH };

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
      -- Real free-plan allocation comes from PLAN_CREDITS in config/credits.js
      -- (rows are always created via getOrCreateSubscription). Defaults are 0
      -- so nobody mistakes the schema for the source of truth.
      credits_remaining INTEGER DEFAULT 0,
      credits_total INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      page TEXT,
      message TEXT NOT NULL,
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

  // Migrate: per-user token usage tracking
  try {
    db.exec('ALTER TABLE subscriptions ADD COLUMN tokens_used INTEGER DEFAULT 0');
  } catch { /* already exists */ }

  // Migrate: pending plan for scheduled downgrades
  try {
    db.exec('ALTER TABLE subscriptions ADD COLUMN pending_plan TEXT DEFAULT NULL');
  } catch { /* already exists */ }

  // Migrate: credit economy — edit-tier tracking and reset scheduling
  try {
    db.exec('ALTER TABLE subscriptions ADD COLUMN edits_this_month INTEGER DEFAULT 0');
  } catch { /* already exists */ }
  try {
    db.exec('ALTER TABLE subscriptions ADD COLUMN credits_reset_date DATETIME');
  } catch { /* already exists */ }

  // Migrate: locked-slide prompts (server-side only) for partial generation
  try {
    db.exec("ALTER TABLE presentations ADD COLUMN locked_slides TEXT DEFAULT '[]'");
  } catch { /* already exists */ }

  // Migrate: flag set while an add-slides run is generating new slides. The
  // presentation row stays 'completed' during the run, so the dashboard needs
  // this to show "Generating…" instead of "Complete" while slides are still
  // being made.
  try {
    db.exec('ALTER TABLE presentations ADD COLUMN adding_slides INTEGER DEFAULT 0');
  } catch { /* already exists */ }

  // Migrate: image-prompt style — "classic" (busy editorial 5-layer) vs
  // "minimalistic" (cinematic, restrained, one-idea-per-slide). Drives which
  // system prompt claudeAgent uses when generating nano_banana_prompts.
  try {
    db.exec("ALTER TABLE presentations ADD COLUMN style TEXT DEFAULT 'classic'");
  } catch { /* already exists */ }

  // Migrate: extend credit_transactions into a full ledger
  for (const col of [
    "ALTER TABLE credit_transactions ADD COLUMN credits_before INTEGER",
    "ALTER TABLE credit_transactions ADD COLUMN slides_generated INTEGER DEFAULT 0",
    "ALTER TABLE credit_transactions ADD COLUMN slides_locked INTEGER DEFAULT 0",
    "ALTER TABLE credit_transactions ADD COLUMN edit_tier_used TEXT",
    "ALTER TABLE credit_transactions ADD COLUMN edits_this_month_before INTEGER",
    "ALTER TABLE credit_transactions ADD COLUMN metadata TEXT DEFAULT '{}'",
  ]) {
    try { db.exec(col); } catch { /* already exists */ }
  }

  // Indexes on the hottest foreign keys — dashboard list, message fetch,
  // ledger reads. (The smaller tables below already had theirs.)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_presentations_user ON presentations(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_presentation ON messages(presentation_id);
    CREATE INDEX IF NOT EXISTS idx_credit_txn_user ON credit_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
  `);

  // Migrate: normalize the legacy 'ultra' plan key to its concrete tier so
  // pricing lookups never depend on the PLANS.ultra alias.
  db.prepare("UPDATE subscriptions SET plan = 'ultra1' WHERE plan = 'ultra'").run();

  // Slide version history — image blobs live here instead of inside the
  // slides_data JSON (slides keep only {id, instruction, created_at} stubs).
  // Keeping multi-MB base64 images out of the presentations row keeps every
  // slide mutation from rewriting old versions too.
  // NB: image_data is intentionally nullable. Version images live on disk now
  // (image_file); image_data is only a legacy/transitional column. Tables
  // created by the first cut declared it NOT NULL — which SQLite can't drop via
  // ALTER — so writers store '' rather than NULL to stay compatible with both.
  db.exec(`
    CREATE TABLE IF NOT EXISTS slide_versions (
      id TEXT PRIMARY KEY,
      presentation_id TEXT NOT NULL,
      slide_index INTEGER NOT NULL,
      image_data TEXT,
      instruction TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_slide_versions_slide ON slide_versions(presentation_id, slide_index);
  `);

  // slide_versions.image_data held base64 in the first cut; images now live on
  // disk (GAPS #7) and this column holds the filename instead. Add image_file
  // and make image_data nullable-in-practice (kept for the migration window).
  try { db.exec('ALTER TABLE slide_versions ADD COLUMN image_file TEXT'); } catch { /* exists */ }

  // One-time migration (guarded by PRAGMA user_version): move version images
  // embedded in slides_data into slide_versions, leaving metadata stubs behind.
  migrateEmbeddedSlideVersions();

  // One-time migration (user_version 2): move real slide images (and version
  // images, and thumbnails) out of the DB onto the image store on disk.
  migrateImagesToDisk();

  // Structured application logs (rolling — capped at 10 K rows by logger.js)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT    NOT NULL,
      message    TEXT    NOT NULL,
      context    TEXT    DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_app_logs_level   ON app_logs(level);
    CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at);
  `);

  // Design mode — image generation gallery
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      mode TEXT NOT NULL DEFAULT 'own',
      user_prompt TEXT,
      final_prompt TEXT,
      image_data TEXT,
      reference_images TEXT DEFAULT '[]',
      settings TEXT DEFAULT '{}',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_design_gen_user ON design_generations(user_id);
    CREATE INDEX IF NOT EXISTS idx_design_gen_batch ON design_generations(batch_id);
    CREATE INDEX IF NOT EXISTS idx_design_gen_status ON design_generations(status);
  `);

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

// Moves full base64 images out of slides_data[].versions[] into the
// slide_versions table. Runs once — user_version 1 marks completion, so
// subsequent boots skip the (potentially expensive) full-table JSON parse.
function migrateEmbeddedSlideVersions() {
  const version = db.pragma('user_version', { simple: true });
  if (version >= 1) return;

  const rows = db.prepare("SELECT id, slides_data FROM presentations WHERE slides_data LIKE '%\"versions\"%'").all();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO slide_versions (id, presentation_id, slide_index, image_data, instruction, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const update = db.prepare('UPDATE presentations SET slides_data = ? WHERE id = ?');

  const txn = db.transaction(() => {
    for (const row of rows) {
      let slides;
      try { slides = JSON.parse(row.slides_data); } catch { continue; }
      let changed = false;
      for (const slide of slides) {
        if (!Array.isArray(slide.versions)) continue;
        for (const v of slide.versions) {
          if (v.image_data) {
            insert.run(v.id, row.id, slide.index, v.image_data, v.instruction || null, v.created_at || new Date().toISOString());
            delete v.image_data;
            changed = true;
          }
        }
      }
      if (changed) update.run(JSON.stringify(slides), row.id);
    }
    db.pragma('user_version = 1');
  });
  txn();
  if (rows.length > 0) console.log(`✅ Migrated embedded slide versions for ${rows.length} presentation(s)`);
}

// Image store dir — mirrors services/imageStore.js (kept local to avoid a
// database.js → imageStore.js → database.js import cycle during the migration).
const IMAGE_DIR = process.env.IMAGE_STORAGE_DIR || path.join(DATA_DIR, 'images');
const EXT_FOR_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };

// Writes a base64 image data URL to the image dir, returns its filename, or
// null if it isn't a raster image we persist (svg placeholders stay inline).
function writeImageFile(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const ext = EXT_FOR_MIME[m[1].toLowerCase()];
  if (!ext) return null;
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const filename = `${uuid()}.${ext}`;
  fs.writeFileSync(path.join(IMAGE_DIR, filename), Buffer.from(m[2], 'base64'));
  return filename;
}

// Moves real slide images (and version images and thumbnails) out of the DB
// onto disk (GAPS #7). Runs once — user_version 2 marks completion. Each image
// is written to a file first, then the row is rewritten to reference it, so a
// crash mid-migration can only leave un-migrated (still-inline) images, never
// lost ones. svg placeholders and nulls are left untouched.
function migrateImagesToDisk() {
  const version = db.pragma('user_version', { simple: true });
  if (version >= 2) return;

  let movedSlides = 0, movedVersions = 0;

  const txn = db.transaction(() => {
    // ── Slide images + thumbnail ──
    const presRows = db.prepare('SELECT id, slides_data, thumbnail FROM presentations').all();
    const updatePres = db.prepare('UPDATE presentations SET slides_data = ?, thumbnail = ? WHERE id = ?');
    for (const row of presRows) {
      let slides = [];
      try { slides = JSON.parse(row.slides_data || '[]'); } catch { continue; }
      let changed = false;
      for (const slide of slides) {
        const file = writeImageFile(slide.image_data);
        if (file) {
          slide.image_file = file;
          slide.image_data = `/api/presentations/${row.id}/slides/${slide.index}/image?f=${file}`;
          movedSlides++;
          changed = true;
        }
      }
      // Thumbnail points at the first slide's file when we have one; otherwise
      // convert any standalone base64 thumbnail on its own.
      let thumb = row.thumbnail;
      const firstWithFile = slides.find(s => s.image_file);
      if (firstWithFile) thumb = firstWithFile.image_file;
      else { const tf = writeImageFile(row.thumbnail); if (tf) thumb = tf; }

      if (changed || thumb !== row.thumbnail) {
        updatePres.run(JSON.stringify(slides), thumb ?? null, row.id);
      }
    }

    // ── Version images ──
    const verRows = db.prepare("SELECT id, image_data FROM slide_versions WHERE image_file IS NULL AND image_data IS NOT NULL").all();
    // Store '' rather than NULL — tables from the first cut declared image_data
    // NOT NULL and SQLite can't drop that constraint. image_data is never read
    // once image_file is set, so '' is inert.
    const updateVer = db.prepare("UPDATE slide_versions SET image_file = ?, image_data = '' WHERE id = ?");
    for (const v of verRows) {
      const file = writeImageFile(v.image_data);
      if (file) { updateVer.run(file, v.id); movedVersions++; }
    }

    db.pragma('user_version = 2');
  });
  txn();

  if (movedSlides || movedVersions) {
    console.log(`✅ Migrated ${movedSlides} slide image(s) and ${movedVersions} version image(s) to disk`);
  }
}

export function getDb() {
  if (!db) throw new Error('Database not initialised — call initDatabase() first');
  return db;
}
