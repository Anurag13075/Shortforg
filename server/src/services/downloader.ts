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
let ytdlpUpdatePromise: Promise<void> | null = null;
export let lastYtdlpUpdateStatus: string = 'not_run';

export function getPyLibsDir(): string {
  return path.join(CONFIG.DATA_DIR, 'pylibs');
}

export function getYtDlpEnv(): NodeJS.ProcessEnv {
  const pyLibs = getPyLibsDir();
  if (fs.existsSync(pyLibs)) {
    return {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH ? `${pyLibs}${path.delimiter}${process.env.PYTHONPATH}` : pyLibs
    };
  }
  return process.env;
}

/**
 * Automatically installs/upgrades yt-dlp and yt-dlp-ejs into a writable DATA_DIR/pylibs
 * folder on container boot so we never get stuck on an outdated cached runtime version.
 */
export function ensureLatestYtDlp(): Promise<void> {
  if (ytdlpUpdatePromise) return ytdlpUpdatePromise;

  ytdlpUpdatePromise = (async () => {
    try {
      const pyLibs = getPyLibsDir();
      if (!fs.existsSync(pyLibs)) {
        fs.mkdirSync(pyLibs, { recursive: true });
      }
      const env = getYtDlpEnv();
      const currentVer = execSync('python3 -m yt_dlp --version', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, env }).toString().trim();
      if (currentVer < '2026.10') {
        console.log(`⬆️ Outdated yt-dlp (${currentVer}) detected. Installing latest yt-dlp & yt-dlp-ejs into ${pyLibs}...`);
        execSync(`python3 -m pip install --no-cache-dir --break-system-packages --upgrade --target "${pyLibs}" yt-dlp yt-dlp-ejs`, {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 90000
        });
        const newVer = execSync('python3 -m yt_dlp --version', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, env: getYtDlpEnv() }).toString().trim();
        lastYtdlpUpdateStatus = `upgraded ${currentVer} -> ${newVer}`;
        console.log(`✅ yt-dlp upgraded to ${newVer}`);
      } else {
        lastYtdlpUpdateStatus = `up_to_date (${currentVer})`;
        console.log(`✅ yt-dlp is up to date (${currentVer})`);
      }
    } catch (err: any) {
      lastYtdlpUpdateStatus = `failed: ${err.message}`;
      console.warn('yt-dlp auto-upgrade skipped/failed:', err.message);
    }
  })();

  return ytdlpUpdatePromise;
}

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
  onProgress?: (progressPercent: number, message: string) => void,
  useCookies: boolean = true
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
    const activeCookies = useCookies
      ? (fs.existsSync(cookiesStoragePath)
          ? cookiesStoragePath
          : (fs.existsSync(relativeCookies) ? relativeCookies : (fs.existsSync(localCookies) ? localCookies : null)))
      : null;

    const args = [
      '--js-runtimes', `node:${process.execPath}`,
      '--remote-components', 'ejs:github',
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b/best',
      '--merge-output-format', 'mp4',
      '--extractor-args', `youtube:player_client=${playerClient}`,
      '--no-playlist',
      '--no-check-certificates',
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
    const child = spawn(bin, [...extraArgs, ...args], { env: getYtDlpEnv() });
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
        let filePath = lines.find((l) => /\.(mp4|mkv|webm)$/i.test(l));
        if (!filePath || !fs.existsSync(filePath)) {
          const files = fs.readdirSync(outputDir).filter((f) => f.includes(`source_${timestamp}`) && /\.(mp4|mkv|webm)$/i.test(f));
          if (files.length > 0) {
            filePath = path.join(outputDir, files[0]);
          }
        }

        if (filePath && fs.existsSync(filePath)) {
          const title = lines[1] || path.basename(filePath).replace(`source_${timestamp}_`, '').replace(/\.[^.]+$/, '');
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
    'https://co.wuk.sh',
    'https://cobalt.kwiatekm.tokyo',
    'https://instances.hyper.space'
  ];

  let streamUrl: string | null = null;
  let videoTitle = 'YouTube Video';

  for (const instance of cobaltInstances) {
    try {
      // Try v10 API first
      const v10Res = await axios.post(
        instance,
        { url: youtubeUrl, videoQuality: '1080' },
        {
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          timeout: 15000
        }
      ).catch(() => null);

      if (v10Res?.data?.url) {
        streamUrl = v10Res.data.url;
        if (v10Res.data.filename) videoTitle = v10Res.data.filename.replace(/\.mp4$/i, '');
        break;
      }

      // Fallback to legacy v7 API
      const res = await axios.post(
        `${instance}/api/json`,
        { url: youtubeUrl, vQuality: '1080', filenamePattern: 'classic' },
        {
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          timeout: 15000
        }
      ).catch(() => null);

      if (res?.data?.url) {
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
  await ensureLatestYtDlp();
  const ytDlpCmd = await ensureYtDlpBinary();

  // Check if cookies are present
  const cookiesStoragePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesStoragePath) && fs.statSync(cookiesStoragePath).size > 50;

  // Try cookie-authenticated clients first if cookies exist, then ALWAYS fall back to cookieless mobile/TV clients
  // (stale or bot-flagged web cookies often cause YouTube to return "Only images are available")
  const clientAttempts: Array<{ client: string; useCookies: boolean }> = hasCookies
    ? [
        { client: 'web', useCookies: true },
        { client: 'tv_simply,web', useCookies: true },
        { client: 'mweb', useCookies: true },
        { client: 'ios', useCookies: false },
        { client: 'android', useCookies: false },
        { client: 'tv_simply', useCookies: false },
        { client: 'android_vr', useCookies: false }
      ]
    : [
        { client: 'ios', useCookies: false },
        { client: 'android', useCookies: false },
        { client: 'tv_simply', useCookies: false },
        { client: 'android_vr', useCookies: false },
        { client: 'web', useCookies: false }
      ];

  let lastYtDlpError: string = '';
  let firstCookieError: string = '';

  for (const attempt of clientAttempts) {
    try {
      const modeTag = attempt.useCookies ? 'cookie-auth' : 'cookieless';
      onProgress?.(12, `Attempting YouTube stream extraction (${attempt.client} / ${modeTag})...`);
      return await runYtDlpWithClient(ytDlpCmd, youtubeUrl, outputDir, attempt.client, onProgress, attempt.useCookies);
    } catch (err: any) {
      const shortErr = (err.message || '').replace(/\s+/g, ' ').slice(0, 220);
      console.warn(`yt-dlp with client ${attempt.client} (cookies=${attempt.useCookies}) failed:`, shortErr);
      onProgress?.(12, `⚠️ ${attempt.client} (${attempt.useCookies ? 'cookie-auth' : 'cookieless'}) failed: ${shortErr}`);
      if (attempt.useCookies && !firstCookieError) {
        firstCookieError = shortErr;
      }
      lastYtDlpError = shortErr;
    }
  }

  // 3. Open Proxy / Cobalt Fallback
  try {
    return await downloadWithCobalt(youtubeUrl, outputDir, onProgress);
  } catch (cobaltErr: any) {
    console.warn('Cobalt stream fallback failed:', cobaltErr.message);
    onProgress?.(15, `⚠️ Cobalt fallback failed: ${cobaltErr.message}`);
  }

  // 4. VidKraken Fallback (if configured)
  if (CONFIG.VIDKRAKEN_API_KEY) {
    try {
      return await downloadWithVidKraken(youtubeUrl, outputDir, CONFIG.VIDKRAKEN_API_KEY, onProgress);
    } catch (vkError: any) {
      console.warn('VidKraken fallback failed:', vkError.message);
      onProgress?.(15, `⚠️ VidKraken fallback failed: ${vkError.message}`);
    }
  }

  const primaryErr = firstCookieError || lastYtDlpError || 'YouTube blocked cloud datacenter IP';
  throw new Error(`Download engine could not fetch video: ${primaryErr}. Tip: Export fresh YouTube cookies (logged-in) in YouTube Cookie Vault or switch to "Upload Video File".`);
}
