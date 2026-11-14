import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

export interface DownloadResult {
  filePath: string;
  title: string;
  duration: number; // in seconds
}

/**
 * Downloader service for YouTube videos.
 * Kept in this single file so the underlying provider can be swapped easily.
 */
export async function downloadYouTubeVideo(
  youtubeUrl: string,
  outputDir: string,
  onProgress?: (progressPercent: number, message: string) => void
): Promise<DownloadResult> {
  const apiKey = CONFIG.VIDKRAKEN_API_KEY;
  if (!apiKey) {
    throw new Error('VIDKRAKEN_API_KEY is not configured in .env');
  }

  onProgress?.(5, 'Submitting download request to Vid Kraken...');

  // Step 1: POST https://vidkraken.com/api/v2/download
  let createRes;
  try {
    createRes = await axios.post(
      'https://vidkraken.com/api/v2/download',
      { url: youtubeUrl },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message;
    throw new Error(`Vid Kraken download init failed: ${msg}`);
  }

  const jobId = createRes.data?.jobId || createRes.data?.id || createRes.data?.data?.jobId;
  if (!jobId) {
    throw new Error(`Vid Kraken returned no jobId: ${JSON.stringify(createRes.data)}`);
  }

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
      // Network hiccup on poll - continue trying
    }
  }

  if (!completedJobData) {
    throw new Error('Vid Kraken download timed out after waiting 4 minutes');
  }

  // Step 3: Extract download URL (prefer 1080p, fall back to 720p or default downloadUrl)
  let downloadUrl = completedJobData.downloadUrl || completedJobData.url;
  if (completedJobData.formats && Array.isArray(completedJobData.formats)) {
    const f1080 = completedJobData.formats.find((f: any) => f.quality === '1080p' || f.height === 1080);
    const f720 = completedJobData.formats.find((f: any) => f.quality === '720p' || f.height === 720);
    downloadUrl = f1080?.url || f720?.url || downloadUrl || completedJobData.formats[0]?.url;
  }

  if (!downloadUrl) {
    throw new Error('No download URL returned by Vid Kraken completed job');
  }

  const title = (completedJobData.title || 'YouTube Video').replace(/[/\\?%*:|"<>]/g, '_');
  const duration = parseFloat(completedJobData.duration || '0');

  // Step 4: Stream download file into /storage
  const fileName = `source_${Date.now()}_${title.substring(0, 30)}.mp4`;
  const filePath = path.join(outputDir, fileName);

  onProgress?.(42, 'Downloading video file to local storage...');

  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url: downloadUrl,
    responseType: 'stream',
    timeout: 300000 // 5 minutes stream timeout
  });

  const totalLength = parseInt(response.headers['content-length'] || '0', 10);
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
