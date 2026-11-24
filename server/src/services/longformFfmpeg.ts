import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { FFmpegService } from './ffmpeg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LongformFFmpegService {
  /**
   * Discovers bundled fonts directory
   */
  public static getFontsDir(): string | null {
    return FFmpegService.getFontsDir();
  }

  /**
   * Escape file paths for use in FFmpeg filter strings
   */
  public static escapeFilterPath(filePath: string): string {
    let normalized = filePath.replace(/\\/g, '/');
    normalized = normalized.replace(/^([a-zA-Z]):/, '$1\\:');
    normalized = normalized.replace(/'/g, "\\'");
    return `'${normalized}'`;
  }

  /**
   * Generates a sleek 16:9 lower-third chapter title card overlay using ASS format
   */
  public static generateChapterAss(
    chapterTitle: string,
    hookText: string | undefined,
    outputPath: string
  ): string {
    const cleanTitle = chapterTitle.replace(/"/g, '').trim().toUpperCase();
    const cleanHook = (hookText || '').replace(/"/g, '').trim().toUpperCase();

    // 1920x1080 16:9 widescreen layout
    const assContent = `[Script Info]
Title: Longform Chapter Title Card
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ChapterBanner,Anton,54,&H00FFFFFF,&H00000000,&H00000000,&HA0000000,-1,0,0,0,100,100,1,0,1,6,3,1,90,90,90,1
Style: HookBadge,Anton,36,&H0000FFFF,&H00000000,&H00000000,&HA0000000,-1,0,0,0,100,100,1,0,1,5,2,1,90,90,165,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cleanHook ? `Dialogue: 0,0:00:00.40,0:00:04.20,HookBadge,,0,0,0,,{\\fad(300,500)}${cleanHook}` : ''}
Dialogue: 0,0:00:00.50,0:00:04.50,ChapterBanner,,0,0,0,,{\\fad(300,500)}${cleanTitle}
`;

    fs.writeFileSync(outputPath, assContent, 'utf-8');
    return outputPath;
  }

  /**
   * Renders a single 16:9 1080p chapter segment with chapter title overlay and 1080p normalization
   */
  public static async renderChapterSegment(params: {
    sourceVideoPath: string;
    startTime: number;
    endTime: number;
    chapterTitle: string;
    hookText?: string;
    assPath?: string;
    outputPath: string;
    onProgress?: (percent: number) => void;
  }): Promise<string> {
    try {
      return await this.executeRenderSegment(params, Boolean(params.assPath));
    } catch (err: any) {
      if (params.assPath) {
        console.warn('Longform segment subtitle filter failed, falling back to clean video segment:', err.message);
        return await this.executeRenderSegment(params, false);
      }
      throw err;
    }
  }

  private static async executeRenderSegment(
    params: {
      sourceVideoPath: string;
      startTime: number;
      endTime: number;
      chapterTitle: string;
      hookText?: string;
      assPath?: string;
      outputPath: string;
      onProgress?: (percent: number) => void;
    },
    includeSubtitles: boolean
  ): Promise<string> {
    const { sourceVideoPath, startTime, endTime, assPath, outputPath } = params;
    const duration = Math.max(1, endTime - startTime);

    const hasSubtitles = includeSubtitles && assPath && fs.existsSync(assPath);
    const escapedAssPath = hasSubtitles ? this.escapeFilterPath(assPath!) : '';
    const fontsDir = this.getFontsDir();
    const fontsDirParam = fontsDir ? `:fontsdir=${this.escapeFilterPath(fontsDir)}` : '';

    // Normalize to 1920x1080 16:9 with letterboxing / pillarboxing if aspect ratio doesn't match
    let vf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1';
    if (hasSubtitles) {
      vf += `,subtitles=${escapedAssPath}${fontsDirParam}`;
    }

    const args = [
      '-y',
      '-ss', startTime.toFixed(2),
      '-i', sourceVideoPath,
      '-t', duration.toFixed(2),
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      '-pix_fmt', 'yuv420p',
      '-g', '30',
      '-keyint_min', '30',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && params.onProgress) {
          const hours = parseFloat(timeMatch[1]);
          const mins = parseFloat(timeMatch[2]);
          const secs = parseFloat(timeMatch[3]);
          const currentSeconds = hours * 3600 + mins * 60 + secs;
          const percent = Math.min(99, Math.round((currentSeconds / duration) * 100));
          params.onProgress(percent);
        }
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Failed to render chapter segment. Code ${code}: ${stderr.slice(-300)}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Concatenate rendered chapter segments into the final master long-form video with audio mastering
   */
  public static async concatenateSegments(
    segmentPaths: string[],
    concatListFile: string,
    outputPath: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    if (segmentPaths.length === 0) {
      throw new Error('No chapter segments provided for concatenation');
    }

    // Write concat file
    const fileContent = segmentPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(concatListFile, fileContent, 'utf-8');

    // Concat with audio mastering (-14 LUFS YouTube standard)
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListFile,
      '-af', 'loudnorm=I=-14:TP=-1.0:LRA=7',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-ar', '48000',
      '-ac', '2',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (onProgress) {
          // Send heartbeat
          onProgress(50);
        }
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Failed to concatenate segments. Code ${code}: ${stderr.slice(-400)}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to run FFmpeg concat: ${err.message}`));
      });
    });
  }

  /**
   * Generates a 16:9 high-CTR YouTube thumbnail (1920x1080)
   */
  public static async generateThumbnail(params: {
    sourceVideoPath: string;
    captureTime: number;
    title: string;
    hookText: string;
    outputPath: string;
  }): Promise<string> {
    const { sourceVideoPath, captureTime, title, hookText, outputPath } = params;
    const fontsDir = this.getFontsDir();
    const fontsDirParam = fontsDir ? `:fontsdir=${this.escapeFilterPath(fontsDir)}` : '';

    // Create 1-frame ASS overlay with massive hook text for CTR
    const assPath = outputPath.replace(/\.jpg$/, '_thumb.ass');
    const cleanHook = hookText.replace(/"/g, '').toUpperCase().slice(0, 30);
    const cleanTitle = title.replace(/"/g, '').toUpperCase().slice(0, 45);

    const assContent = `[Script Info]
Title: Longform High CTR Thumbnail
ScriptType: v4.00+
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ThumbHook,Anton,96,&H0000FFFF,&H00000000,&H00000000,&HA0000000,-1,0,0,0,100,100,2,0,1,10,6,8,80,80,90,1
Style: ThumbSub,Anton,56,&H00FFFFFF,&H00000000,&H00000000,&HA0000000,-1,0,0,0,100,100,1,0,1,8,4,8,80,80,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,ThumbHook,,0,0,0,,${cleanHook}
Dialogue: 0,0:00:00.00,0:00:05.00,ThumbSub,,0,0,0,,${cleanTitle}
`;

    fs.writeFileSync(assPath, assContent, 'utf-8');
    const escapedAssPath = this.escapeFilterPath(assPath);

    // Filter with contrast/saturation boost and vignette
    const vfWithSub = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=contrast=1.15:saturation=1.2,subtitles=${escapedAssPath}${fontsDirParam}`;
    const vfClean = 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=contrast=1.15:saturation=1.2';

    const tryGenerate = (vf: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const args = [
          '-y',
          '-ss', captureTime.toFixed(2),
          '-i', sourceVideoPath,
          '-vf', vf,
          '-vframes', '1',
          '-q:v', '2',
          outputPath
        ];

        const child = spawn('ffmpeg', args);
        let stderr = '';
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve(outputPath);
          } else {
            reject(new Error(`Thumbnail gen failed: ${stderr.slice(-200)}`));
          }
        });
        child.on('error', reject);
      });
    };

    try {
      await tryGenerate(vfWithSub);
    } catch {
      // Fallback clean frame
      await tryGenerate(vfClean);
    } finally {
      if (fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch {}
      }
    }

    return outputPath;
  }
}
