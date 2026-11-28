import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { CONFIG } from '../config.js';

// Ensure data directory exists
const dbDir = path.dirname(CONFIG.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize WebAssembly-powered SQLite (Zero C++ native compilation, 100% portable)
const SQL = await initSqlJs();

let pgPool: pg.Pool | null = null;
let pgReady = false;

export function isPostgresActive(): boolean {
  return pgReady;
}

let rawDb: any;

if (CONFIG.DATABASE_URL) {
  try {
    pgPool = new pg.Pool({
      connectionString: CONFIG.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30000
    });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_sqlite_snapshot (
        id INTEGER PRIMARY KEY,
        db_bytes BYTEA NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const res = await pgPool.query('SELECT db_bytes FROM app_sqlite_snapshot WHERE id = 1');
    if (res.rows[0]?.db_bytes) {
      rawDb = new SQL.Database(res.rows[0].db_bytes);
      console.log('🐘 Loaded persistent database snapshot from PostgreSQL!');
    }
    pgReady = true;
  } catch (err: any) {
    console.error('⚠️ PostgreSQL connection failed, falling back to local disk SQLite:', err.message);
    pgPool = null;
    pgReady = false;
  }
}

if (!rawDb) {
  if (fs.existsSync(CONFIG.DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(CONFIG.DB_PATH);
      rawDb = new SQL.Database(fileBuffer);
    } catch {
      rawDb = new SQL.Database();
    }
  } else {
    rawDb = new SQL.Database();
  }
}

let saveTimer: NodeJS.Timeout | null = null;
let pgFlushInFlight: Promise<void> = Promise.resolve();

async function pushBufferToPostgres(buffer: Buffer) {
  if (!pgPool || !pgReady) return;
  try {
    await pgPool.query(
      `INSERT INTO app_sqlite_snapshot (id, db_bytes, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET db_bytes = EXCLUDED.db_bytes, updated_at = NOW()`,
      [buffer]
    );
  } catch (err: any) {
    console.error('Failed to sync DB snapshot to PostgreSQL:', err.message);
  }
}

function flushDatabaseSync() {
  if (!rawDb) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const dir = path.dirname(CONFIG.DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    const tmpPath = `${CONFIG.DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, CONFIG.DB_PATH);

    if (pgPool && pgReady) {
      pgFlushInFlight = pgFlushInFlight.then(() => pushBufferToPostgres(buffer));
    }
  } catch (err: any) {
    console.error('Failed to save SQLite database:', err.message);
  }
}

function saveDatabase() {
  if (!rawDb) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushDatabaseSync();
  }, 500);
}

process.on('exit', () => flushDatabaseSync());
process.on('SIGINT', async () => {
  flushDatabaseSync();
  await pgFlushInFlight;
  process.exit(0);
});
process.on('SIGTERM', async () => {
  flushDatabaseSync();
  await pgFlushInFlight;
  process.exit(0);
});

class StatementWrapper {
  constructor(private sql: string) {}

  all(...params: any[]): any[] {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = rawDb.prepare(this.sql);
    try {
      if (flatParams.length > 0) {
        stmt.bind(flatParams);
      }
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  get(...params: any[]): any {
    const rows = this.all(...params);
    return rows[0] !== undefined ? rows[0] : undefined;
  }

  run(...params: any[]): { changes: number } {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = rawDb.prepare(this.sql);
    try {
      if (flatParams.length > 0) {
        stmt.bind(flatParams);
      }
      stmt.step();
      saveDatabase();
      return { changes: 1 };
    } finally {
      stmt.free();
    }
  }
}

export const db = {
  prepare(sql: string) {
    return new StatementWrapper(sql);
  },
  exec(sql: string) {
    rawDb.exec(sql);
    saveDatabase();
  },
  pragma(_pragmaSql: string) {
    // Pragma in memory Wasm
  },
  transaction(fn: Function) {
    return (...args: any[]) => {
      rawDb.exec('BEGIN TRANSACTION;');
      try {
        const res = fn(...args);
        rawDb.exec('COMMIT;');
        saveDatabase();
        return res;
      } catch (err) {
        try { rawDb.exec('ROLLBACK;'); } catch {}
        throw err;
      }
    };
  }
};

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      youtube_url TEXT NOT NULL,
      title TEXT,
      duration REAL DEFAULT 0,
      source_video_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, downloading, transcribing, analyzing, rendering, completed, failed
      progress REAL DEFAULT 0,
      stage_message TEXT DEFAULT '',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      caption TEXT,
      hashtags TEXT, -- comma-separated or JSON array string
      hook_line TEXT,
      virality_score INTEGER DEFAULT 0,
      reason TEXT,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      crop_offset_x REAL DEFAULT 0, -- horizontal offset (-100 to 100 percentage)
      video_path TEXT,
      thumbnail_path TEXT,
      status TEXT NOT NULL DEFAULT 'draft', -- draft, approved, rejected, rendering
      caption_preset TEXT DEFAULT 'hormozi_gold',
      caption_active_color TEXT DEFAULT '#FFE600',
      caption_base_color TEXT DEFAULT '#FFFFFF',
      words_per_burst INTEGER DEFAULT 2,
      assigned_channel_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_channel_id) REFERENCES channels(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY, -- YouTube Channel ID
      title TEXT NOT NULL,
      avatar_url TEXT,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      token_expiry INTEGER,
      status TEXT NOT NULL DEFAULT 'active', -- active, reconnect_needed
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedule_queue (
      id TEXT PRIMARY KEY,
      clip_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      scheduled_time TEXT NOT NULL, -- ISO timestamp
      status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, posting, posted, failed
      youtube_video_id TEXT,
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS longform_projects (
      id TEXT PRIMARY KEY,
      title TEXT,
      topic TEXT NOT NULL,
      source_urls TEXT NOT NULL, -- JSON array of strings
      target_duration REAL DEFAULT 600,
      actual_duration REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, downloading, transcribing, scripting, rendering, completed, failed
      progress REAL DEFAULT 0,
      stage_message TEXT DEFAULT '',
      error_message TEXT,
      chapters TEXT, -- JSON array of LongformChapter
      script_outline TEXT,
      video_path TEXT,
      thumbnail_path TEXT,
      assigned_channel_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (assigned_channel_id) REFERENCES channels(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
    CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
    CREATE INDEX IF NOT EXISTS idx_queue_scheduled_time ON schedule_queue(scheduled_time, status);
    CREATE INDEX IF NOT EXISTS idx_longform_status ON longform_projects(status);
  `);

  try {
    db.exec('ALTER TABLE clips ADD COLUMN assigned_channel_id TEXT;');
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN caption_preset TEXT DEFAULT 'hormozi_gold';");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN caption_active_color TEXT DEFAULT '#FFE600';");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN caption_base_color TEXT DEFAULT '#FFFFFF';");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN words_per_burst INTEGER DEFAULT 2;");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN title_options TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN caption_options TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN layout TEXT DEFAULT 'blur_bg';");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN hook_overlay INTEGER DEFAULT 1;");
  } catch {}
  try {
    db.exec("ALTER TABLE clips ADD COLUMN error_message TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE projects ADD COLUMN niche TEXT DEFAULT 'high_energy';");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN scheduled_time TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN schedule_status TEXT DEFAULT 'none';");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN youtube_video_id TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN posted_at TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN description TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN narrator_enabled INTEGER DEFAULT 1;");
  } catch {}
  try {
    db.exec("ALTER TABLE longform_projects ADD COLUMN narrator_voice TEXT DEFAULT 'en-US-AndrewMultilingualNeural';");
  } catch {}

  // Recover any jobs stuck in mid-flight states after an unexpected restart
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE schedule_queue SET status = 'scheduled', updated_at = ? WHERE status = 'posting'").run(now);
    db.prepare("UPDATE longform_projects SET schedule_status = 'scheduled', updated_at = ? WHERE schedule_status = 'posting'").run(now);
    db.prepare("UPDATE projects SET status = 'failed', error_message = 'Interrupted by server restart — click Retry to resume.', updated_at = ? WHERE status IN ('downloading', 'transcribing', 'analyzing', 'rendering')").run(now);
    db.prepare("UPDATE longform_projects SET status = 'failed', error_message = 'Interrupted by server restart — click Retry to resume.', updated_at = ? WHERE status IN ('downloading', 'transcribing', 'scripting', 'rendering')").run(now);
    db.prepare("UPDATE clips SET status = 'draft', updated_at = ? WHERE status = 'rendering'").run(now);
    flushDatabaseSync();
  } catch {}
}

export interface ProjectRecord {
  id: string;
  youtube_url: string;
  title: string | null;
  duration: number;
  source_video_path: string | null;
  status: 'pending' | 'downloading' | 'transcribing' | 'analyzing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage_message: string;
  error_message: string | null;
  niche?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipRecord {
  id: string;
  project_id: string;
  title: string;
  caption: string | null;
  hashtags: string | null;
  hook_line: string | null;
  virality_score: number;
  reason: string | null;
  start_time: number;
  end_time: number;
  crop_offset_x: number;
  video_path: string | null;
  thumbnail_path: string | null;
  status: 'draft' | 'approved' | 'rejected' | 'rendering' | 'failed';
  caption_preset?: string | null;
  caption_active_color?: string | null;
  caption_base_color?: string | null;
  words_per_burst?: number | null;
  assigned_channel_id?: string | null;
  title_options?: string | null;
  caption_options?: string | null;
  layout?: 'blur_bg' | 'crop';
  hook_overlay?: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelRecord {
  id: string;
  title: string;
  avatar_url: string | null;
  refresh_token: string;
  access_token: string | null;
  token_expiry: number | null;
  status: 'active' | 'reconnect_needed';
  total_posted?: number;
  created_at: string;
  updated_at: string;
}

export interface QueueRecord {
  id: string;
  clip_id: string;
  channel_id: string;
  scheduled_time: string;
  status: 'scheduled' | 'posting' | 'posted' | 'failed';
  youtube_video_id: string | null;
  retry_count: number;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LongformChapter {
  id: string;
  title: string;
  source_index: number;
  source_url: string;
  source_title: string;
  start_time: number;
  end_time: number;
  duration: number;
  hook_text?: string;
  summary?: string;
  intro_narration?: string;
  bridge_narration?: string;
  outro_narration?: string;
  order: number;
}

export interface LongformProjectRecord {
  id: string;
  title: string | null;
  topic: string;
  source_urls: string; // JSON array of string URLs
  target_duration: number;
  actual_duration: number;
  status: 'pending' | 'downloading' | 'transcribing' | 'scripting' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage_message: string;
  error_message: string | null;
  chapters: string | null; // JSON array of LongformChapter
  script_outline: string | null;
  description?: string | null;
  narrator_enabled?: number;
  narrator_voice?: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  assigned_channel_id: string | null;
  scheduled_time?: string | null;
  schedule_status?: 'none' | 'scheduled' | 'posting' | 'posted' | 'failed';
  youtube_video_id?: string | null;
  posted_at?: string | null;
  created_at: string;
  updated_at: string;
}
