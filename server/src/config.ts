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

export const CONFIG = {
  PORT: parseInt((process.env.PORT || '3001').trim(), 10),
  APP_URL: (process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, ''),
  VIDKRAKEN_API_KEY: (process.env.VIDKRAKEN_API_KEY || '').trim(),
  GROQ_API_KEY: (process.env.GROQ_API_KEY || '').trim(),
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  GOOGLE_CLIENT_SECRET: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),

  // Storage and directories
  STORAGE_DIR: (process.env.STORAGE_DIR || path.resolve(__dirname, '../storage')).trim(),
  DATA_DIR: (process.env.DATA_DIR || path.resolve(__dirname, '../data')).trim(),
  DB_PATH: (process.env.DB_PATH || path.resolve(__dirname, '../data/shortsforge.db')).trim(),

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
