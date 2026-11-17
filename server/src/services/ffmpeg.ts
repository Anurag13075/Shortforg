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
      // Extract audio at 128k mono, 16kHz speech recognition format
      const args = [
        '-y',
        '-i', videoPath,
        '-vn',
        '-b:a', '128k',
        '-ar', '16000',
        '-ac', '1',
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
   * Escape file paths for use in FFmpeg filter strings
   */
  private static escapeFilterPath(filePath: string): string {
    let normalized = filePath.replace(/\\/g, '/');
    normalized = normalized.replace(/^([a-zA-Z]):/, '$1\\:');
    normalized = normalized.replace(/'/g, "\\'");
    return `'${normalized}'`;
  }

  /**
   * Render a 9:16 vertical clip with subtitle fallback
   */
  static async renderClip(params: {
    sourceVideoPath: string;
    startTime: number;
    endTime: number;
    cropOffsetXPercent: number;
    layout?: 'blur_bg' | 'crop';
    assSubtitlePath?: string;
    outputPath: string;
    onProgress?: (percent: number) => void;
  }): Promise<string> {
    try {
      // First attempt with animated subtitles and chosen layout
      return await this.executeRender(params, Boolean(params.assSubtitlePath));
    } catch (err: any) {
      if (params.assSubtitlePath) {
        console.warn('Subtitles filter failed (font/libass error), falling back to clean video cut:', err.message);
        // Fallback: render without subtitles filter
        return await this.executeRender(params, false);
      }
      throw err;
    }
  }

  private static async executeRender(
    params: {
      sourceVideoPath: string;
      startTime: number;
      endTime: number;
      cropOffsetXPercent: number;
      layout?: 'blur_bg' | 'crop';
      assSubtitlePath?: string;
      outputPath: string;
      onProgress?: (percent: number) => void;
    },
    includeSubtitles: boolean
  ): Promise<string> {
    const { sourceVideoPath, startTime, endTime, cropOffsetXPercent, assSubtitlePath, outputPath } = params;
    const duration = endTime - startTime;
    const layout = params.layout || 'blur_bg';

    const hasSubtitles = includeSubtitles && assSubtitlePath && fs.existsSync(assSubtitlePath);
    const escapedAssPath = hasSubtitles ? this.escapeFilterPath(assSubtitlePath!) : '';

    let args: string[] = [];

    if (layout === 'blur_bg') {
      // Hero Canvas Layout: Original video centered sharply with blurred/darkened background
      // 100% original video resolution is maintained with no cropped faces or zoom blur
      let filterComplex = `[0:v]split=2[fg][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5,eq=brightness=-0.18[bg_dark];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg_scaled];[bg_dark][fg_scaled]overlay=(W-w)/2:(H-h)/2[canvas]`;
      if (hasSubtitles) {
        filterComplex += `;[canvas]subtitles=${escapedAssPath}[v_out]`;
      } else {
        filterComplex += `;[canvas]null[v_out]`;
      }

      args = [
        '-y',
        '-ss', startTime.toFixed(3),
        '-i', sourceVideoPath,
        '-t', duration.toFixed(3),
        '-filter_complex', filterComplex,
        '-map', '[v_out]',
        '-map', '0:a?',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-b:v', '4500k',
        '-maxrate', '6000k',
        '-bufsize', '8000k',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        outputPath
      ];
    } else {
      // Smart 9:16 Center / Offset Crop with Lanczos resampling and unsharp mask
      const offsetFactor = Math.max(-1, Math.min(1, cropOffsetXPercent / 100));
      const cropExpr = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'min(max(0,(iw-ow)/2+${offsetFactor}*(iw-ow)/2),iw-ow)':'(ih-oh)/2'`;
      const scaleExpr = `scale=1080:1920:flags=lanczos,unsharp=3:3:0.8:3:3:0.4`;

      let vfFilters = `${cropExpr},${scaleExpr}`;
      if (hasSubtitles) {
        vfFilters += `,subtitles=${escapedAssPath}`;
      }

      args = [
        '-y',
        '-ss', startTime.toFixed(3),
        '-i', sourceVideoPath,
        '-t', duration.toFixed(3),
        '-vf', vfFilters,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-b:v', '4500k',
        '-maxrate', '6000k',
        '-bufsize', '8000k',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        outputPath
      ];
    }

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
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
   * Generate 9:16 thumbnail with hook text overlay
   */
  static async generateThumbnail(params: {
    sourceVideoPath: string;
    captureTime: number;
    hookText: string;
    cropOffsetXPercent: number;
    layout?: 'blur_bg' | 'crop';
    outputPath: string;
  }): Promise<string> {
    const { sourceVideoPath, captureTime, hookText, cropOffsetXPercent, outputPath } = params;
    const layout = params.layout || 'blur_bg';

    const tempAssPath = outputPath + '.thumb.ass';
    const cleanHook = (hookText || 'WATCH THIS')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .toUpperCase();

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
Style: Hook,DejaVu Sans,82,&H0000FFFF,&H00000000,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,8,4,5,60,60,400,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,Hook,,0,0,0,,{\\an5\\b1\\c&H00F0FF&\\3c&H000000&\\bord10\\shad4}${displayHook}
`;

    fs.writeFileSync(tempAssPath, assContent, 'utf-8');

    let vfFilters = '';
    if (layout === 'blur_bg') {
      vfFilters = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`;
    } else {
      const offsetFactor = Math.max(-1, Math.min(1, cropOffsetXPercent / 100));
      vfFilters = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'min(max(0,(iw-ow)/2+${offsetFactor}*(iw-ow)/2),iw-ow)':'(ih-oh)/2',scale=1080:1920`;
    }

    // Attempt with subtitles; fallback to clean frame if subtitle filter fails
    try {
      const escapedAssPath = this.escapeFilterPath(tempAssPath);
      await this.runThumbnailFfmpeg(`${vfFilters},subtitles=${escapedAssPath}`, sourceVideoPath, captureTime, outputPath);
    } catch {
      await this.runThumbnailFfmpeg(vfFilters, sourceVideoPath, captureTime, outputPath);
    } finally {
      try { fs.unlinkSync(tempAssPath); } catch {}
    }

    return outputPath;
  }

  private static runThumbnailFfmpeg(vfFilters: string, videoPath: string, captureTime: number, outputPath: string): Promise<string> {
    const args = [
      '-y',
      '-ss', captureTime.toFixed(3),
      '-i', videoPath,
      '-vf', vfFilters,
      '-vframes', '1',
      '-q:v', '2',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Thumbnail failed (${code}): ${stderr.slice(-200)}`));
        }
      });
      child.on('error', (err) => reject(err));
    });
  }
}
