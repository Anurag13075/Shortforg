# ShortsForge 🔥

A personal, local-first web app that transforms any YouTube video into 5–10 viral 9:16 vertical YouTube Shorts with burned-in animated captions, high-contrast hook thumbnails, virality scoring, and automated YouTube channel scheduling.

Built with **TypeScript**, **React + Vite**, **Node.js + Express**, **SQLite (better-sqlite3)**, **FFmpeg**, and **Groq AI**.

---

## 🚀 Quick Start

### 1. Prerequisites to Install on Your Machine
1. **Node.js**: Version **18+** or **20+** (LTS recommended).
2. **FFmpeg**: Must be installed and accessible on your system `PATH`.
   - On Windows: Download from [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) or install via winget:
     ```powershell
     winget install "Gyan.FFmpeg"
     ```
   - Verify in your terminal:
     ```bash
     ffmpeg -version
     ```

---

### 2. Configure `.env`
Copy `.env.example` to `.env` in the root folder:
```bash
cp .env.example .env
```
Fill in your API keys and Google Cloud OAuth credentials:
```env
# Vid Kraken API Key (for YouTube video downloading)
VIDKRAKEN_API_KEY=your_vidkraken_api_key_here

# Groq API Key (for Whisper transcription & viral moment analysis)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Google Cloud OAuth 2.0 Credentials (for YouTube channel connection & uploads)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Frontend Application URL (default: http://localhost:5173)
APP_URL=http://localhost:5173

# Backend Server Port (default: 3001)
PORT=3001
```

---

### 3. Google Cloud OAuth Configuration
In your [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Create or select an OAuth 2.0 Client ID (Application type: **Web application**).
2. Set **Authorized JavaScript origins**:
   ```
   http://localhost:5173
   http://localhost:3001
   ```
3. Set **Authorized redirect URIs**:
   ```
   http://localhost:3001/auth/google/callback
   ```
4. Enable the **YouTube Data API v3** in APIs & Services > Enabled APIs & Services.

---

### 4. Install & Run Commands

**One command to install all dependencies (root, backend, and frontend):**
```bash
npm run install:all
```

**One command to start both frontend and backend concurrently:**
```bash
npm run dev
```

- Frontend studio: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:3001](http://localhost:3001)

---

## 🛠️ Architecture & Pipeline

1. **Downloader (`downloader.ts`)**: Calls the Vid Kraken API (`POST /api/v2/download`), polls until `COMPLETED`, and downloads 1080p/720p MP4 to `/server/storage`.
2. **Transcriber (`transcriber.ts`)**: FFmpeg extracts audio (mono MP3, 16kHz) and sends it to Groq's `whisper-large-v3` endpoint for word-level timestamps.
3. **Moment Picker (`momentPicker.ts`)**: Sends timestamped transcript to Groq LLM (`llama-3.3-70b-versatile`) to pick 5–10 standalone moments (20–55s) with virality scoring (1–100), hook lines, titles under 70 chars, and 5 hashtags.
4. **Vertical Video & Animated Captions (`ffmpeg.ts` & `subtitleGenerator.ts`)**: Generates ASS subtitles highlighting words dynamically in bright yellow/gold as spoken, crops video to 9:16 (1080x1920) with customizable horizontal offset, and normalizes audio via `loudnorm`.
5. **Thumbnails (`ffmpeg.ts`)**: Exports frame at clip start and burns large high-contrast hook text overlay.
6. **YouTube Scheduler (`scheduler.ts` & `youtube.ts`)**: Internal background cron runs every minute, checks the SQLite queue, uploads due clips as YouTube Shorts with title, caption, hashtags, and thumbnail, and retries failures up to 3 times.
