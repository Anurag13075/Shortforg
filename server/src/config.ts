import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading root .env first, then local .env if available
const rootEnvPath = path.resolve(__dirname, '../../.env');
const localEnvPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else {
  dotenv.config();
}

const hasPersistentMount = fs.existsSync('/mnt/storage');

/**
 * Auto-discover Zerops PostgreSQL connection string from process.env
 * (supports DATABASE_URL or Zerops's <hostname>_connectionString)
 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  if (process.env.db_connectionString) return process.env.db_connectionString.trim();
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith('_connectionString') && typeof v === 'string' && v.startsWith('postgres')) {
      return v.trim();
    }
  }
  return '';
}

/**
 * Auto-discover Zerops Object Storage (S3) credentials from process.env
 * (supports S3_* or Zerops's <hostname>_apiUrl / _accessKeyId / _secretAccessKey / _bucketName)
 */
function resolveS3Config() {
  if (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    return {
      endpoint: process.env.S3_ENDPOINT.trim(),
      accessKeyId: process.env.S3_ACCESS_KEY_ID.trim(),
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY.trim(),
      bucket: (process.env.S3_BUCKET || '').trim(),
      region: (process.env.S3_REGION || 'us-east-1').trim()
    };
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith('_apiUrl') && typeof v === 'string' && v.startsWith('http')) {
      const prefix = k.slice(0, -'_apiUrl'.length);
      const accessKeyId = process.env[`${prefix}_accessKeyId`];
      const secretAccessKey = process.env[`${prefix}_secretAccessKey`];
      const bucket = process.env[`${prefix}_bucketName`];
      if (accessKeyId && secretAccessKey && bucket) {
        return {
          endpoint: v.trim(),
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          bucket: bucket.trim(),
          region: 'us-east-1'
        };
      }
    }
  }
  return { endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', region: 'us-east-1' };
}

const s3Config = resolveS3Config();

export const CONFIG = {
  PORT: parseInt((process.env.PORT || '3001').trim(), 10),
  APP_URL: (process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, ''),
  VIDKRAKEN_API_KEY: (process.env.VIDKRAKEN_API_KEY || '').trim(),
  GROQ_API_KEY: (process.env.GROQ_API_KEY || '').trim(),
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  GOOGLE_CLIENT_SECRET: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),

  // Permanent PostgreSQL + S3 Object Storage
  DATABASE_URL: resolveDatabaseUrl(),
  S3_ENDPOINT: s3Config.endpoint,
  S3_ACCESS_KEY_ID: s3Config.accessKeyId,
  S3_SECRET_ACCESS_KEY: s3Config.secretAccessKey,
  S3_BUCKET: s3Config.bucket,
  S3_REGION: s3Config.region,

  // Storage and directories (auto-uses /mnt/storage when Zerops Local Storage is mounted)
  STORAGE_DIR: (process.env.STORAGE_DIR || (hasPersistentMount ? '/mnt/storage/videos' : path.resolve(__dirname, '../storage'))).trim(),
  DATA_DIR: (process.env.DATA_DIR || (hasPersistentMount ? '/mnt/storage/data' : path.resolve(__dirname, '../data'))).trim(),
  DB_PATH: (process.env.DB_PATH || (hasPersistentMount ? '/mnt/storage/data/shortsforge.db' : path.resolve(__dirname, '../data/shortsforge.db'))).trim(),

  // YouTube OAuth redirect URL
  get GOOGLE_REDIRECT_URI() {
    if (process.env.GOOGLE_REDIRECT_URI) {
      return process.env.GOOGLE_REDIRECT_URI.trim();
    }
    // Default to port on localhost or APP_URL in production
    if (this.APP_URL.includes('localhost') || this.APP_URL.includes('127.0.0.1')) {
      return `http://localhost:${this.PORT}/auth/google/callback`;
    }
    return `${this.APP_URL}/auth/google/callback`;
  }
};

// Ensure required runtime storage and data directories exist
if (!fs.existsSync(CONFIG.STORAGE_DIR)) {
  fs.mkdirSync(CONFIG.STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}
