import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { initDatabase, isPostgresActive } from './db/index.js';
import { FFmpegService } from './services/ffmpeg.js';
import { SchedulerService } from './services/scheduler.js';
import { ObjectStorageService } from './services/objectStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { projectsRouter } from './routes/projects.js';
import { clipsRouter } from './routes/clips.js';
import { channelsRouter } from './routes/channels.js';
import { scheduleRouter } from './routes/schedule.js';
import { authRouter } from './routes/auth.js';
import { copilotRouter } from './routes/copilot.js';
import { cookiesRouter } from './routes/cookies.js';
import { longformRouter } from './routes/longform.js';
import { ensureYtDlpBinary, ensureLatestYtDlp, getYtDlpEnv, lastYtdlpUpdateStatus } from './services/downloader.js';
import { execSync } from 'child_process';

const app = express();

// ----------------------------------------------------------------------------
// Startup Checks
// ----------------------------------------------------------------------------
console.log('========================================================');
console.log('🎬 ShortsForge Server Starting...');
console.log('========================================================');

// Check FFmpeg
const ffmpegStatus = FFmpegService.checkAvailability();
if (ffmpegStatus.available) {
  console.log(`✅ ${ffmpegStatus.message} (${ffmpegStatus.version})`);
} else {
  console.error('❌ CRITICAL ERROR:');
  console.error(`   ${ffmpegStatus.message}`);
  console.error('   Please install FFmpeg from https://ffmpeg.org and ensure "ffmpeg" is in your system PATH.');
  console.error('========================================================');
}

// Check Environment Variables
const missingKeys: string[] = [];
if (!CONFIG.VIDKRAKEN_API_KEY) missingKeys.push('VIDKRAKEN_API_KEY');
if (!CONFIG.GROQ_API_KEY) missingKeys.push('GROQ_API_KEY');
if (!CONFIG.GOOGLE_CLIENT_ID) missingKeys.push('GOOGLE_CLIENT_ID');
if (!CONFIG.GOOGLE_CLIENT_SECRET) missingKeys.push('GOOGLE_CLIENT_SECRET');

if (missingKeys.length > 0) {
  console.warn(`⚠️ Warning: Missing .env configuration variables: ${missingKeys.join(', ')}`);
  console.warn('   Fill them in your .env file to enable complete automated downloading, transcription, and YouTube publishing.');
}

// Initialize SQLite database
initDatabase();
console.log(`📁 Database initialized at: ${CONFIG.DB_PATH}`);
console.log(`💾 Storage folder initialized at: ${CONFIG.STORAGE_DIR}`);

// ----------------------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------------------
app.use(cors({
  origin: [CONFIG.APP_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve static storage files if needed
app.use('/storage', express.static(CONFIG.STORAGE_DIR));

// ----------------------------------------------------------------------------
// API Routes
// ----------------------------------------------------------------------------
app.use('/api/projects', projectsRouter);
app.use('/api/clips', clipsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/copilot', copilotRouter);
app.use('/api/cookies', cookiesRouter);
app.use('/api/longform', longformRouter);
app.use('/auth', authRouter);

// Health & System Info
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ffmpeg: FFmpegService.checkAvailability(),
    config: {
      hasVidKraken: Boolean(CONFIG.VIDKRAKEN_API_KEY),
      hasGroq: Boolean(CONFIG.GROQ_API_KEY),
      hasGoogleOAuth: Boolean(CONFIG.GOOGLE_CLIENT_ID && CONFIG.GOOGLE_CLIENT_SECRET),
      appUrl: CONFIG.APP_URL,
      googleRedirectUri: CONFIG.GOOGLE_REDIRECT_URI,
      storageDir: CONFIG.STORAGE_DIR,
      mntDirs: fs.existsSync('/mnt') ? fs.readdirSync('/mnt') : [],
      postgres: isPostgresActive(),
      objectStorage: ObjectStorageService.isEnabled()
    }
  });
});

app.get('/api/health/ytdlp', async (_req, res) => {
  try {
    await ensureLatestYtDlp();
    const env = getYtDlpEnv();
    const cmd = await ensureYtDlpBinary();
    const version = execSync(`${cmd} --version`, { timeout: 5000, env }).toString().trim();
    let ejsStatus = 'unknown';
    try {
      ejsStatus = execSync(`python3 -c "import yt_dlp_ejs; print(yt_dlp_ejs.__file__)"`, { timeout: 5000, env }).toString().trim();
    } catch (e: any) {
      ejsStatus = `missing: ${e.message}`;
    }
    const cookiesPath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    let cookieLines = 0;
    let hasLoginCookie = false;
    if (fs.existsSync(cookiesPath)) {
      const txt = fs.readFileSync(cookiesPath, 'utf-8');
      cookieLines = txt.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length;
      hasLoginCookie = /LOGIN_INFO|SID|SAPISID|HSID|__Secure-3PSID/.test(txt);
    }
    let testListFormats = '';
    try {
      const cookieArg = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';
      testListFormats = execSync(
        `${cmd} --js-runtimes "node:${process.execPath}" --remote-components ejs:github ${cookieArg} --extractor-args "youtube:player_client=web" -F "https://www.youtube.com/watch?v=8-DRGbQ1IXc" 2>&1`,
        { timeout: 25000, env }
      ).toString().slice(-1500);
    } catch (e: any) {
      testListFormats = (e.stdout?.toString() || e.stderr?.toString() || e.message).slice(-1500);
    }
    res.json({
      cmd,
      version,
      updateStatus: lastYtdlpUpdateStatus,
      nodeExecPath: process.execPath,
      nodeVersion: process.version,
      ejsStatus,
      cookieLines,
      hasLoginCookie,
      testListFormats
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// In production, serve the built Vite frontend if client/dist exists
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req: any, res: any, next: any) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/storage')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ----------------------------------------------------------------------------
// Start Scheduler & HTTP Server
// ----------------------------------------------------------------------------
SchedulerService.startScheduler();
ensureLatestYtDlp().catch(() => {});
if (ObjectStorageService.isEnabled()) {
  const cookiePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
  if (!fs.existsSync(cookiePath)) {
    ObjectStorageService.downloadText('system/cookies.txt')
      .then((txt) => {
        if (txt && txt.trim().length > 20) {
          fs.writeFileSync(cookiePath, txt.trim(), 'utf-8');
          console.log('🍪 Restored cookies.txt from Object Storage');
        }
      })
      .catch(() => {});
  }
}

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 ShortsForge Backend running on http://localhost:${CONFIG.PORT}`);
  console.log(`🔗 Google OAuth Redirect URI: ${CONFIG.GOOGLE_REDIRECT_URI}`);
  console.log('========================================================');
});
