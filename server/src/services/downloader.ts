
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { CONFIG } from '../config.js';

export interface DownloadResult {
  filePath: string;
  title: string;
  duration: number; // in seconds
}

/**
 * Fallback downloader using yt-dlp if VidKraken credits are exhausted
 */
async function downloadWithYtDlp(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  onProgress?.(10, 'VidKraken quota reached, using yt-dlp direct downloader...');
  const fileName = `source_${Date.now()}_video.mp4`;
  const outputPath = path.join(outputDir, fileName);

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      '--no-playlist',
      youtubeUrl
    ];

    const child = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      const match = text.match(/(\d+(?:\.\d+)?)%/);
      if (match && onProgress) {
        const percent = Math.min(60, 10 + Math.floor(parseFloat(match[1]) * 0.5));
        onProgress(percent, `Downloading video via yt-dlp: ${match[1]}%`);
      }
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({
          filePath: outputPath,
          title: 'YouTube Video',
          duration: 0 // Will be probed by FFmpeg
        });
      } else {
        reject(new Error(`yt-dlp failed (${code}): ${stderr.slice(-250)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`yt-dlp not available: ${err.message}`));
    });
  });
}

/**
 * Downloader service for YouTube videos.
 * Supports VidKraken API with automatic yt-dlp fallback when credits run out.
 */
export async function downloadYouTubeVideo(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  const apiKey = CONFIG.VIDKRAKEN_API_KEY;

  if (apiKey) {
    onProgress?.(5, 'Submitting download request to Vid Kraken (1080p/720p video)...');

    // Step 1: POST https://vidkraken.com/api/v2/download with video format (1080 -> 720 -> 480 -> 360)
    const videoFormats = ['1080', '720', '480', '360'];
    let createRes: any = null;
    let lastErrorMsg = '';
    let isQuotaLimit = false;

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
        const dataErr = err.response?.data?.error || err.response?.data?.message;
        lastErrorMsg = dataErr || err.message;

        if (err.response?.data?.code === 'LIMIT_REACHED' || err.response?.status === 403) {
          isQuotaLimit = true;
          lastErrorMsg = dataErr || "VidKraken credit limit reached. The free plan's downloads are used up. Upgrade at https://vidkraken.com/dashboard or update VIDKRAKEN_API_KEY.";
          console.warn('VidKraken credit limit reached:', lastErrorMsg);
          break;
        }

        console.warn(`VidKraken format ${fmt} request failed (${lastErrorMsg}), attempting lower resolution...`);
      }
    }

    if (createRes) {
      const jobId = createRes.data?.jobId || createRes.data?.id || createRes.data?.data?.jobId;
      if (jobId) {
        // Step 2: Poll GET https://vidkraken.com/api/v2/download/{jobId} until status is COMPLETED
        onProgress?.(15, `Processing video on Vid Kraken (Job: ${jobId})...`);

        let completedJobData: any = null;
        const maxAttempts = 120; // 4 minutes max with 2s interval
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));

          try {
            const pollRes = await axios.get(
              `https://vidkraken.com/api/v2/download/${jobId}`,
              {
                headers: {
                  'Authorization': `Bearer ${apiKey}`
                },
                timeout: 20000
              }
            );

            const data = pollRes.data?.data || pollRes.data;
            const status = (data.status || '').toUpperCase();

            if (status === 'COMPLETED') {
              completedJobData = data;
              break;
            } else if (status === 'FAILED' || status === 'ERROR') {
              throw new Error(data.error || data.message || 'Vid Kraken video download failed');
            } else {
              const pollProgress = 15 + Math.min(25, Math.floor(attempt * 0.5));
              onProgress?.(pollProgress, `Converting video... (${status || 'IN_PROGRESS'})`);
            }
          } catch (pollErr: any) {
            if (pollErr.message?.includes('download failed')) throw pollErr;
          }
        }

        if (completedJobData) {
          let downloadUrl = completedJobData.downloadUrl || completedJobData.url;
          if (completedJobData.formats && Array.isArray(completedJobData.formats)) {
            const f1080 = completedJobData.formats.find((f: any) => f.quality === '1080p' || f.height === 1080);
            const f720 = completedJobData.formats.find((f: any) => f.quality === '720p' || f.height === 720);
            downloadUrl = f1080?.url || f720?.url || downloadUrl || completedJobData.formats[0]?.url;
          }

          if (downloadUrl) {
            const title = (completedJobData.title || 'YouTube Video').replace(/[/\\?%*:|"<>]/g, '_');
            const duration = parseFloat(completedJobData.duration || '0');
            const fileName = `source_${Date.now()}_${title.substring(0, 30)}.mp4`;
            const filePath = path.join(outputDir, fileName);

            onProgress?.(42, 'Downloading video file to local storage...');

            const writer = fs.createWriteStream(filePath);
            const response = await axios({
              method: 'GET',
              url: downloadUrl,
              responseType: 'stream',
              timeout: 300000
            });

            const contentLength = response.headers['content-length'];
            const totalLength = parseInt(typeof contentLength === 'string' ? contentLength : '0', 10);
            let downloadedBytes = 0;

            response.data.on('data', (chunk: Buffer) => {
              downloadedBytes += chunk.length;
              if (totalLength > 0 && onProgress) {
                const streamPercent = 42 + Math.floor((downloadedBytes / totalLength) * 18);
                onProgress(streamPercent, `Downloading: ${Math.round((downloadedBytes / 1024 / 1024) * 10) / 10} MB / ${Math.round((totalLength / 1024 / 1024) * 10) / 10} MB`);
              }
            });

            await new Promise<void>((resolve, reject) => {
              response.data.pipe(writer);
              writer.on('finish', () => resolve());
              writer.on('error', (err) => reject(err));
            });

            onProgress?.(60, 'Video downloaded successfully!');

            return {
              filePath,
              title: completedJobData.title || title,
              duration
            };
          }
        }
      }
    }

    // If VidKraken failed due to credit limit or error, attempt yt-dlp fallback
    console.warn('VidKraken unavailable, attempting yt-dlp fallback...');
    try {
      return await downloadWithYtDlp(youtubeUrl, outputDir, onProgress);
    } catch (ytdlErr: any) {
      if (isQuotaLimit) {
        throw new Error(lastErrorMsg);
      }
      throw new Error(`Download failed: ${lastErrorMsg || ytdlErr.message}`);
    }
  }

  // If no VIDKRAKEN_API_KEY, use yt-dlp directly
  return await downloadWithYtDlp(youtubeUrl, outputDir, onProgress);
}
