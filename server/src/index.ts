import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { initDatabase } from './db/index.js';
import { FFmpegService } from './services/ffmpeg.js';
import { SchedulerService } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { projectsRouter } from './routes/projects.js';
import { clipsRouter } from './routes/clips.js';
import { channelsRouter } from './routes/channels.js';
import { scheduleRouter } from './routes/schedule.js';
import { authRouter } from './routes/auth.js';
import { copilotRouter } from './routes/copilot.js';

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      googleRedirectUri: CONFIG.GOOGLE_REDIRECT_URI
    }
  });
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

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 ShortsForge Backend running on http://localhost:${CONFIG.PORT}`);
  console.log(`🔗 Google OAuth Redirect URI: ${CONFIG.GOOGLE_REDIRECT_URI}`);
  console.log('========================================================');
});
