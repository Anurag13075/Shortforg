import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export class FFmpegService {
  /**
   * Verify if ffmpeg and ffprobe are installed and available on PATH
   */
  static checkAvailability(): { available: boolean; message: string; version?: string } {
    try {
      const output = execSync('ffmpeg -version', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      const firstLine = output.split('\n')[0] || '';
      return {
        available: true,
        message: 'FFmpeg is installed and ready.',
        version: firstLine.trim()
      };
    } catch {
      return {
        available: false,
        message: 'FFmpeg was NOT found on your system PATH! Please install FFmpeg and add it to your PATH environment variable.'
      };
    }
  }

  /**
   * Extract audio from a video file as MP3 for Groq Whisper transcription
   */
  static async extractAudio(videoPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Extract audio at 128k mono/stereo mp3, fast and compatible with Groq API
      const args = [
        '-y',
        '-i', videoPath,
        '-vn',
        '-acodec', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '16000', // 16kHz optimal for speech recognition
        '-ac', '1',     // mono reduces payload size dramatically
        outputPath
      ];

      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Failed to extract audio. FFmpeg exit code ${code}: ${stderr.slice(-300)}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to run FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Get video duration and dimensions via ffprobe
   */
  static async getVideoMetadata(videoPath: string): Promise<{ duration: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=width,height',
        '-of', 'json',
        videoPath
      ];

      const child = spawn('ffprobe', args);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            const duration = parseFloat(data.format?.duration || '0');
            const stream = data.streams?.[0] || {};
            const width = parseInt(stream.width || '1920', 10);
            const height = parseInt(stream.height || '1080', 10);
            resolve({ duration, width, height });
          } catch (e: any) {
            reject(new Error(`Failed to parse video metadata: ${e.message}`));
          }
        } else {
          reject(new Error(`ffprobe failed (${code}): ${stderr}`));
        }
      });

      child.on('error', (err) => reject(err));
    });
  }

  /**
   * Escape file paths for use in FFmpeg filter strings (especially on Windows)
   */
  private static escapeFilterPath(filePath: string): string {
    // Standardize to forward slashes
    let normalized = filePath.replace(/\\/g, '/');
    // On Windows, paths like C:/path must escape the colon as C\:/path
    normalized = normalized.replace(/^([a-zA-Z]):/, '$1\\:');
    // Escape single quotes if any
    normalized = normalized.replace(/'/g, "\\'");
    return `'${normalized}'`;
  }

  /**
   * Render a 9:16 vertical clip with:
   * 1. Sub-clip cutting (startTime to endTime)
   * 2. 9:16 Vertical Crop (1080x1920) with horizontal offset adjustment
   * 3. Audio normalization (loudnorm)
   * 4. Burned-in ASS subtitles (animated highlight)
   * 5. H.264 MP4 export
   */
  static async renderClip(params: {
    sourceVideoPath: string;
    startTime: number;
    endTime: number;
    cropOffsetXPercent: number; // -100 to 100 percentage from center
    assSubtitlePath?: string;
    outputPath: string;
    onProgress?: (percent: number) => void;
  }): Promise<string> {
    const { sourceVideoPath, startTime, endTime, cropOffsetXPercent, assSubtitlePath, outputPath } = params;
    const duration = endTime - startTime;

    // Calculate crop filter:
    // To make a 9:16 aspect ratio:
    // Crop width = in_h * (9/16)
    // Offset X = (in_w - out_w) / 2 + (cropOffsetXPercent / 100) * ((in_w - out_w) / 2)
    // Clipped so it never exceeds boundaries: min(max(0, X), in_w - out_w)
    const offsetFactor = Math.max(-1, Math.min(1, cropOffsetXPercent / 100));

    // FFmpeg filter chain:
    // 1. Crop to 9:16
    // 2. Scale to 1080:1920
    // 3. Burn in ASS subtitles (if provided)
    const cropExpr = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'min(max(0,(iw-ow)/2+${offsetFactor}*(iw-ow)/2),iw-ow)':'(ih-oh)/2'`;
    const scaleExpr = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`;

    let vfFilters = `${cropExpr},${scaleExpr}`;
    if (assSubtitlePath && fs.existsSync(assSubtitlePath)) {
      const escapedAssPath = this.escapeFilterPath(assSubtitlePath);
      vfFilters += `,subtitles=${escapedAssPath}`;
    }

    const args = [
      '-y',
      '-ss', startTime.toFixed(3),
      '-t', duration.toFixed(3),
      '-i', sourceVideoPath,
      '-vf', vfFilters,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        // Parse time progression if requested
        if (params.onProgress) {
          const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (match) {
            const hours = parseFloat(match[1]);
            const minutes = parseFloat(match[2]);
            const seconds = parseFloat(match[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            const progress = Math.min(99, Math.round((currentTime / duration) * 100));
            params.onProgress(progress);
          }
        }
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          if (params.onProgress) params.onProgress(100);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg clip rendering failed (${code}): ${stderr.slice(-400)}`));
        }
      });

      child.on('error', (err) => reject(err));
    });
  }

  /**
   * Generate high-contrast 9:16 thumbnail with hook text overlay
   */
  static async generateThumbnail(params: {
    sourceVideoPath: string;
    captureTime: number; // timestamp in seconds
    hookText: string;
    cropOffsetXPercent: number;
    outputPath: string;
  }): Promise<string> {
    const { sourceVideoPath, captureTime, hookText, cropOffsetXPercent, outputPath } = params;

    // Create a temporary ASS subtitle file specifically for the thumbnail hook title
    const tempAssPath = outputPath + '.thumb.ass';
    const cleanHook = (hookText || 'WATCH THIS')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .toUpperCase();

    // Word wrap hook text into 2-3 short impactful lines
    const words = cleanHook.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const w of words) {
      if ((currentLine + ' ' + w).trim().length > 18) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = w;
      } else {
        currentLine = (currentLine + ' ' + w).trim();
      }
    }
    if (currentLine) lines.push(currentLine.trim());
    const displayHook = lines.join('\\N');

    const assContent = `[Script Info]
Title: Thumbnail Hook
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Montserrat,82,&H0000FFFF,&H00000000,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,8,4,5,60,60,400,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,Hook,,0,0,0,,{\\an5\\b1\\c&H00F0FF&\\3c&H000000&\\bord10\\shad4}${displayHook}
`;

    fs.writeFileSync(tempAssPath, assContent, 'utf-8');

    const offsetFactor = Math.max(-1, Math.min(1, cropOffsetXPercent / 100));
    const cropExpr = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'min(max(0,(iw-ow)/2+${offsetFactor}*(iw-ow)/2),iw-ow)':'(ih-oh)/2'`;
    const scaleExpr = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`;
    const escapedAssPath = this.escapeFilterPath(tempAssPath);

    const args = [
      '-y',
      '-ss', captureTime.toFixed(3),
      '-i', sourceVideoPath,
      '-vf', `${cropExpr},${scaleExpr},subtitles=${escapedAssPath}`,
      '-vframes', '1',
      '-q:v', '2',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        // Clean up temp ASS file
        try { fs.unlinkSync(tempAssPath); } catch {}

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Failed to generate thumbnail (${code}): ${stderr.slice(-300)}`));
        }
      });

      child.on('error', (err) => {
        try { fs.unlinkSync(tempAssPath); } catch {}
        reject(err);
      });
    });
  }
}

