import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DownloadResult {
  filePath: string;
  title: string;
  duration: number; // in seconds
}

let cachedYtDlpPath: string | null = null;

/**
 * Ensures yt-dlp binary is available.
 * 1. Checks system PATH
 * 2. Checks common /usr/local/bin or local ./bin paths
 * 3. Downloads standalone official binary if missing
 */
export async function ensureYtDlpBinary(): Promise<string> {
  if (cachedYtDlpPath && fs.existsSync(cachedYtDlpPath)) {
    return cachedYtDlpPath;
  }

  // 1. Check if yt-dlp runs directly from PATH
  try {
    execSync('yt-dlp --version', { stdio: 'ignore' });
    cachedYtDlpPath = 'yt-dlp';
    return 'yt-dlp';
  } catch {}

  // 2. Check standard Linux locations
  const standardPaths = ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) {
      cachedYtDlpPath = p;
      return p;
    }
  }

  // 3. Check local bin directory inside application root
  const binDir = path.resolve(__dirname, '../../../bin');
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const localBinary = path.join(binDir, binaryName);

  if (fs.existsSync(localBinary)) {
    cachedYtDlpPath = localBinary;
    return localBinary;
  }

  // 4. Download standalone binary from official GitHub releases
  console.log(`⬇️ Downloading standalone yt-dlp binary for ${process.platform}...`);
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const downloadUrl = process.platform === 'win32'
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  const writer = fs.createWriteStream(localBinary);
  const response = await axios({
    method: 'GET',
    url: downloadUrl,
    responseType: 'stream',
    timeout: 120000
  });

  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', (err) => reject(err));
  });

  if (process.platform !== 'win32') {
    fs.chmodSync(localBinary, 0o755);
  }

  console.log(`✅ yt-dlp binary ready at ${localBinary}`);
  cachedYtDlpPath = localBinary;
  return localBinary;
}

/**
 * Primary Self-Hosted YouTube Downloader
 * Uses yt-dlp with mobile client spoofing to bypass datacenter IP restrictions
 */
async function downloadWithYtDlp(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  onProgress?.(8, 'Initializing self-hosted downloader engine (yt-dlp)...');
  const ytDlpCmd = await ensureYtDlpBinary();

  const timestamp = Date.now();
  const outputTemplate = path.join(outputDir, `source_${timestamp}_%(title).40s.%(ext)s`);

  return new Promise((resolve, reject) => {
    onProgress?.(15, 'Fetching video stream with mobile app spoofing (1080p)...');

    const args = [
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--extractor-args', 'youtube:player_client=android,ios,web',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      '--no-playlist',
      '--no-check-certificates',
      '--prefer-free-formats',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--print', 'after_move:filepath',
      '--print', 'after_move:title',
      '--print', 'after_move:duration',
      '-o', outputTemplate,
      youtubeUrl
    ];

    const child = spawn(ytDlpCmd, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;

      // Parse download percentage from yt-dlp output
      const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match && onProgress) {
        const percent = Math.min(60, 15 + Math.floor(parseFloat(match[1]) * 0.45));
        onProgress(percent, `Downloading video: ${match[1]}%`);
      }
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
        // Find line ending in .mp4
        let filePath = lines.find((l) => l.endsWith('.mp4'));
        if (!filePath || !fs.existsSync(filePath)) {
          // Fallback: look for file in outputDir matching timestamp
          const files = fs.readdirSync(outputDir).filter((f) => f.includes(`source_${timestamp}`) && f.endsWith('.mp4'));
          if (files.length > 0) {
            filePath = path.join(outputDir, files[0]);
          }
        }

        if (filePath && fs.existsSync(filePath)) {
          const title = lines[1] || path.basename(filePath, '.mp4').replace(`source_${timestamp}_`, '');
          const duration = parseFloat(lines[2] || '0');
          onProgress?.(60, 'Video downloaded successfully!');
          return resolve({
            filePath,
            title,
            duration
          });
        }
      }

      // If failed, reject with details
      reject(new Error(`yt-dlp download failed (${code}): ${stderr.slice(-300) || stdout.slice(-300)}`));
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Secondary VidKraken API Downloader (Fallback)
 */
async function downloadWithVidKraken(
  youtubeUrl: string,
  outputDir: string,
  apiKey: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  onProgress?.(10, 'Requesting video via VidKraken API...');
  const videoFormats = ['1080', '720', '480', '360'];
  let createRes: any = null;
  let lastErrorMsg = '';

  for (const fmt of videoFormats) {
    try {
      createRes = await axios.post(
        'https://vidkraken.com/api/v2/download',
        { url: youtubeUrl, format: fmt },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      if (createRes.data?.jobId || createRes.data?.id || createRes.data?.data?.jobId) {
        break;
      }
    } catch (err: any) {
      lastErrorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      if (err.response?.data?.code === 'LIMIT_REACHED' || err.response?.status === 403) {
        throw new Error(err.response?.data?.error || 'VidKraken credit limit reached.');
      }
    }
  }

  const jobId = createRes?.data?.jobId || createRes?.data?.id || createRes?.data?.data?.jobId;
  if (!jobId) {
    throw new Error(`VidKraken initialization failed: ${lastErrorMsg}`);
  }

  let completedJobData: any = null;
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const pollRes = await axios.get(`https://vidkraken.com/api/v2/download/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 20000
      });
      const data = pollRes.data?.data || pollRes.data;
      if ((data.status || '').toUpperCase() === 'COMPLETED') {
        completedJobData = data;
        break;
      }
    } catch {}
  }

  if (!completedJobData?.downloadUrl && !completedJobData?.url) {
    throw new Error('VidKraken download timed out or failed');
  }

  const downloadUrl = completedJobData.downloadUrl || completedJobData.url;
  const title = (completedJobData.title || 'YouTube Video').replace(/[/\\?%*:|"<>]/g, '_');
  const duration = parseFloat(completedJobData.duration || '0');
  const filePath = path.join(outputDir, `source_${Date.now()}_${title.substring(0, 30)}.mp4`);

  const writer = fs.createWriteStream(filePath);
  const response = await axios({ method: 'GET', url: downloadUrl, responseType: 'stream', timeout: 300000 });
  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', (err) => reject(err));
  });

  return { filePath, title, duration };
}

/**
 * Universal Downloader for ShortsForge
 * 1. Direct video URLs (MP4 / WebM / CDN) -> Direct streaming
 * 2. YouTube URLs -> Built-in Self-Hosted yt-dlp engine (Primary)
 * 3. Fallback -> VidKraken (if key available)
 */
export async function downloadYouTubeVideo(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  const isDirectVideo = /\.(mp4|mov|webm)(\?.*)?$/i.test(youtubeUrl) || !/(?:youtube\.com|youtu\.be)/i.test(youtubeUrl);

  // 1. Direct Video Link
  if (isDirectVideo) {
    onProgress?.(15, 'Downloading video directly from URL...');
    const fileName = `source_${Date.now()}_direct.mp4`;
    const filePath = path.join(outputDir, fileName);

    const writer = fs.createWriteStream(filePath);
    const response = await axios({
      method: 'GET',
      url: youtubeUrl,
      responseType: 'stream',
      timeout: 300000
    });

    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve());
      writer.on('error', (err) => reject(err));
    });

    onProgress?.(60, 'Direct video downloaded successfully!');
    return {
      filePath,
      title: 'Direct Video Stream',
      duration: 0
    };
  }

  // 2. Primary Engine: Built-in Self-Hosted yt-dlp
  try {
    return await downloadWithYtDlp(youtubeUrl, outputDir, onProgress);
  } catch (ytdlError: any) {
    console.warn('Primary yt-dlp engine failed, attempting VidKraken fallback:', ytdlError.message);

    // 3. Fallback: VidKraken if configured
    if (CONFIG.VIDKRAKEN_API_KEY) {
      try {
        return await downloadWithVidKraken(youtubeUrl, outputDir, CONFIG.VIDKRAKEN_API_KEY, onProgress);
      } catch (vkError: any) {
        throw new Error(`Self-hosted download failed (${ytdlError.message}), and VidKraken fallback failed (${vkError.message})`);
      }
    }

    throw ytdlError;
  }
}
