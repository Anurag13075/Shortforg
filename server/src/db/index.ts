import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

// Ensure data directory exists
const dbDir = path.dirname(CONFIG.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize WebAssembly-powered SQLite (Zero C++ native compilation, 100% portable)
const SQL = await initSqlJs();

let rawDb: any;
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

function saveDatabase() {
  if (!rawDb) return;
  try {
    const dir = path.dirname(CONFIG.DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(CONFIG.DB_PATH, buffer);
  } catch (err: any) {
    console.error('Failed to save SQLite database to disk:', err.message);
  }
}

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

    CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
    CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
    CREATE INDEX IF NOT EXISTS idx_queue_scheduled_time ON schedule_queue(scheduled_time, status);
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
  status: 'draft' | 'approved' | 'rejected' | 'rendering';
  caption_preset?: string | null;
  caption_active_color?: string | null;
  caption_base_color?: string | null;
  words_per_burst?: number | null;
  assigned_channel_id?: string | null;
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
