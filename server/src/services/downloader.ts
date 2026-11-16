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
 * Ensures latest yt-dlp binary is available.
 * 1. Checks local ./bin/yt-dlp
 * 2. Checks standard PATH
 * 3. Downloads standalone official binary from GitHub releases if missing
 */
function isValidYtDlpCommand(cmd: string): boolean {
  try {
    const res = execSync(`${cmd} --version`, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 6000 }).toString();
    return res.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensures a working yt-dlp executable or Python module is available.
 * 1. Checks 'python3 -m yt_dlp' (pure Python, 100% native on Alpine Linux & musl)
 * 2. Checks standard PATH 'yt-dlp'
 * 3. Checks standard Linux /usr/bin and /usr/local/bin
 * 4. Checks local ./bin/yt-dlp
 */
export async function ensureYtDlpBinary(): Promise<string> {
  if (cachedYtDlpPath && isValidYtDlpCommand(cachedYtDlpPath)) {
    return cachedYtDlpPath;
  }

  // 1. Check Python module (highest reliability on Alpine containers)
  if (isValidYtDlpCommand('python3 -m yt_dlp')) {
    cachedYtDlpPath = 'python3 -m yt_dlp';
    return cachedYtDlpPath;
  }

  // 2. Check standard PATH
  if (isValidYtDlpCommand('yt-dlp')) {
    cachedYtDlpPath = 'yt-dlp';
    return cachedYtDlpPath;
  }

  // 3. Check standard Linux / PATH locations
  const standardPaths = ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
  for (const p of standardPaths) {
    if (fs.existsSync(p) && isValidYtDlpCommand(p)) {
      cachedYtDlpPath = p;
      return p;
    }
  }

  // 4. Check local bin directory inside application root
  const binDir = path.resolve(__dirname, '../../../bin');
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const localBinary = path.join(binDir, binaryName);

  if (fs.existsSync(localBinary) && isValidYtDlpCommand(localBinary)) {
    cachedYtDlpPath = localBinary;
    return localBinary;
  }

  cachedYtDlpPath = 'yt-dlp';
  return 'yt-dlp';
}

/**
 * Run yt-dlp with specific player client arguments.
 * iOS client is the primary choice because it does NOT require web bot authentication tokens on datacenter IPs.
 */
async function runYtDlpWithClient(
  ytDlpCmd: string,
  youtubeUrl: string,
  outputDir: string,
  playerClient: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  const timestamp = Date.now();
  const outputTemplate = path.join(outputDir, `source_${timestamp}_%(title).40s.%(ext)s`);

  return new Promise((resolve, reject) => {
    // Check if optional cookies file exists or was provided via env
    const cookiesStoragePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    if (!fs.existsSync(cookiesStoragePath) && process.env.YOUTUBE_COOKIES) {
      try {
        fs.writeFileSync(cookiesStoragePath, process.env.YOUTUBE_COOKIES, 'utf-8');
      } catch {}
    }

    const localCookies = path.resolve(process.cwd(), 'cookies.txt');
    const relativeCookies = path.join(outputDir, '../cookies.txt');
    const activeCookies = fs.existsSync(cookiesStoragePath)
      ? cookiesStoragePath
      : (fs.existsSync(relativeCookies) ? relativeCookies : (fs.existsSync(localCookies) ? localCookies : null));

    const args = [
      '--js-runtimes', 'node',
      '-f', 'best[ext=mp4]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--extractor-args', `youtube:player_client=${playerClient}`,
      '--no-playlist',
      '--no-check-certificates',
      '--prefer-free-formats',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--print', 'after_move:filepath',
      '--print', 'after_move:title',
      '--print', 'after_move:duration',
      '-o', outputTemplate
    ];

    if (activeCookies) {
      args.push('--cookies', activeCookies);
    }

    args.push(youtubeUrl);

    const [bin, ...extraArgs] = ytDlpCmd.split(' ');
    const child = spawn(bin, [...extraArgs, ...args]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;

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
        let filePath = lines.find((l) => l.endsWith('.mp4'));
        if (!filePath || !fs.existsSync(filePath)) {
          const files = fs.readdirSync(outputDir).filter((f) => f.includes(`source_${timestamp}`) && f.endsWith('.mp4'));
          if (files.length > 0) {
            filePath = path.join(outputDir, files[0]);
          }
        }

        if (filePath && fs.existsSync(filePath)) {
          const title = lines[1] || path.basename(filePath, '.mp4').replace(`source_${timestamp}_`, '');
          const duration = parseFloat(lines[2] || '0');
          onProgress?.(60, 'Video downloaded successfully!');
          return resolve({ filePath, title, duration });
        }
      }

      reject(new Error(`Client ${playerClient} failed (${code}): ${stderr.slice(-300) || stdout.slice(-300)}`));
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Free Cobalt Scraper Fallback
 * Downloads high quality stream via public Cobalt instance when datacenter IPs are blocked
 */
async function downloadWithCobalt(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  onProgress?.(15, 'Requesting stream via open proxy network (Cobalt engine)...');

  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt.api.scip.io',
    'https://co.wuk.sh'
  ];

  let streamUrl: string | null = null;
  let videoTitle = 'YouTube Video';

  for (const instance of cobaltInstances) {
    try {
      const res = await axios.post(
        `${instance}/api/json`,
        {
          url: youtubeUrl,
          vQuality: '1080',
          filenamePattern: 'classic'
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 25000
        }
      );

      if (res.data?.url) {
        streamUrl = res.data.url;
        if (res.data.filename) {
          videoTitle = res.data.filename.replace(/\.mp4$/i, '');
        }
        break;
      }
    } catch {}
  }

  if (!streamUrl) {
    throw new Error('Open proxy engines were unavailable or did not return stream URL.');
  }

  onProgress?.(25, 'Downloading video file from high-speed stream...');
  const fileName = `source_${Date.now()}_stream.mp4`;
  const filePath = path.join(outputDir, fileName);

  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url: streamUrl,
    responseType: 'stream',
    timeout: 300000
  });

  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', (err) => reject(err));
  });

  onProgress?.(60, 'Video downloaded successfully!');
  return {
    filePath,
    title: videoTitle,
    duration: 0
  };
}

/**
 * VidKraken API Downloader (Fallback)
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
 * 1. Direct video URLs (MP4 / WebM / CDN) -> Direct stream
 * 2. Multi-tier yt-dlp spoofing:
 *    - Tier A: iOS client (highest success rate on cloud IPs, avoids web challenge)
 *    - Tier B: Android client
 *    - Tier C: mweb client
 * 3. Fallback: Free Cobalt proxy scraper
 * 4. Fallback: VidKraken (if key available and has credits)
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

  // 2. Self-Hosted yt-dlp Engine with multi-client spoofing
  const ytDlpCmd = await ensureYtDlpBinary();

  // Try android,web with Node.js n-challenge solver (bypasses bot verification and extracts formats), then android, then tv
  const clientsToTry = ['android,web', 'android', 'tv,android', 'web'];
  let lastYtDlpError: string = '';

  for (const client of clientsToTry) {
    try {
      onProgress?.(12, `Attempting YouTube stream extraction (${client} mobile engine)...`);
      return await runYtDlpWithClient(ytDlpCmd, youtubeUrl, outputDir, client, onProgress);
    } catch (err: any) {
      console.warn(`yt-dlp with client ${client} failed:`, err.message);
      lastYtDlpError = err.message;
    }
  }

  // 3. Open Proxy / Cobalt Fallback
  try {
    return await downloadWithCobalt(youtubeUrl, outputDir, onProgress);
  } catch (cobaltErr: any) {
    console.warn('Cobalt stream fallback failed:', cobaltErr.message);
  }

  // 4. VidKraken Fallback (if configured)
  if (CONFIG.VIDKRAKEN_API_KEY) {
    try {
      return await downloadWithVidKraken(youtubeUrl, outputDir, CONFIG.VIDKRAKEN_API_KEY, onProgress);
    } catch (vkError: any) {
      console.warn('VidKraken fallback failed:', vkError.message);
    }
  }

  throw new Error(`Download engine could not fetch video: ${lastYtDlpError || 'YouTube stream blocked'}. If this video requires authentication, paste a direct video link or try another YouTube link.`);
}
