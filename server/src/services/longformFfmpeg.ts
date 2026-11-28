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
    outputPath: string,
    chapterIndex?: number,
    totalChapters?: number
  ): string {
    const cleanTitle = chapterTitle.replace(/"/g, '').trim().toUpperCase();
    const rawHook = (hookText || '').replace(/"/g, '').trim().toUpperCase();
    const partPrefix = chapterIndex && totalChapters ? `PART ${chapterIndex}/${totalChapters}  •  ` : '';
    const cleanHook = `${partPrefix}${rawHook}`.trim();

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
Style: ChapterBanner,Anton,52,&H00FFFFFF,&H00000000,&H00000000,&HC0101018,-1,0,0,0,100,100,2,0,3,14,0,1,85,85,80,1
Style: HookBadge,Anton,32,&H0000E5FF,&H00000000,&H00000000,&HD00B0B12,-1,0,0,0,100,100,2,0,3,10,0,1,85,85,152,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cleanHook ? `Dialogue: 0,0:00:00.45,0:00:04.20,HookBadge,,0,0,0,,{\\fad(250,450)} ${cleanHook} ` : ''}
Dialogue: 0,0:00:00.55,0:00:04.50,ChapterBanner,,0,0,0,,{\\fad(250,450)} ${cleanTitle} 
`;

    fs.writeFileSync(outputPath, assContent, 'utf-8');
    return outputPath;
  }

  /**
   * Generates a clean editorial kinetic overlay for Cold-Open Intro, Chapter Bridges, and Outro
   */
  public static generateBridgeAss(params: {
    kicker: string;
    headline: string;
    duration: number;
    outputPath: string;
  }): string {
    const cleanKicker = params.kicker.replace(/"/g, '').trim().toUpperCase().slice(0, 48);
    const cleanHeadline = params.headline.replace(/"/g, '').trim().toUpperCase().slice(0, 68);
    const endSec = Math.max(2.0, params.duration - 0.35);
    const mins = Math.floor(endSec / 60);
    const secs = (endSec % 60).toFixed(2).padStart(5, '0');
    const endStamp = `0:${String(mins).padStart(2, '0')}:${secs}`;

    const assContent = `[Script Info]
Title: Documentary Narrator Bridge
ScriptType: v4.00+
WrapStyle: 1
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KickerPill,Anton,34,&H0000E5FF,&H00000000,&H00000000,&HD00B0B12,-1,0,0,0,100,100,3,0,3,12,0,2,120,120,565,1
Style: BridgeHeadline,Anton,66,&H00FFFFFF,&H00000000,&H00000000,&HB00B0B12,-1,0,0,0,100,100,2,0,1,4,3,5,140,140,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cleanKicker ? `Dialogue: 0,0:00:00.25,${endStamp},KickerPill,,0,0,0,,{\\fad(250,350)} ${cleanKicker} ` : ''}
Dialogue: 0,0:00:00.35,${endStamp},BridgeHeadline,,0,0,0,,{\\fad(300,350)}${cleanHeadline}
`;

    fs.writeFileSync(params.outputPath, assContent, 'utf-8');
    return params.outputPath;
  }

  /**
   * Renders a cinematic 1080p B-roll Narrator Bridge (slow Ken Burns push-in + ducked ambient synth pad + narrator voiceover)
   */
  public static async renderNarratorBridgeSegment(params: {
    sourceVideoPath: string;
    startTime: number;
    narratorAudioPath: string;
    duration: number;
    kicker: string;
    headline: string;
    outputPath: string;
  }): Promise<string> {
    const { sourceVideoPath, startTime, narratorAudioPath, duration, kicker, headline, outputPath } = params;
    const dur = Math.max(2.0, duration + 0.5); // 0.25s lead-in + 0.25s tail
    const durStr = dur.toFixed(2);
    const fadeOutStart = Math.max(0.2, dur - 0.35).toFixed(2);

    const assPath = outputPath.replace(/\.mp4$/, '.ass');
    this.generateBridgeAss({ kicker, headline, duration: dur, outputPath: assPath });

    const fontsDir = this.getFontsDir();
    const fontsDirParam = fontsDir ? `:fontsdir=${this.escapeFilterPath(fontsDir)}` : '';
    const escapedAssPath = this.escapeFilterPath(assPath);

    // Muted source gameplay with subtle slow-mo + Ken Burns push-in + dark cinema grade
    const vf = [
      `setpts=1.08*PTS`,
      `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080`,
      `scale=w='trunc(1920*(1+0.05*t/${durStr})/2)*2':h=-2:eval=frame,crop=1920:1080`,
      `fps=30,setsar=1`,
      `eq=contrast=1.10:saturation=1.08:brightness=-0.06`,
      `vignette=PI/4`,
      `subtitles=${escapedAssPath}${fontsDirParam}`,
      `fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOutStart}:d=0.35`
    ].join(',');

    // Mix crisp narrator voiceover (-14 LUFS) over subtle synthesized low-end documentary synth pad (-26 dB)
    const filterComplex = [
      `[1:a]adelay=200|200,apad=pad_dur=0.4,loudnorm=I=-14:TP=-1.0:LRA=7[vo]`,
      `sine=f=55:d=${durStr}[s1]`,
      `sine=f=82.41:d=${durStr}[s2]`,
      `sine=f=110:d=${durStr}[s3]`,
      `[s1][s2][s3]amix=inputs=3:normalize=0,lowpass=f=240,volume=-26dB,aformat=sample_rates=48000:channel_layouts=stereo[pad]`,
      `[vo][pad]amix=inputs=2:duration=first:dropout_transition=0,afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOutStart}:d=0.30[aout]`
    ].join(';');

    const args = [
      '-y',
      '-ss', Math.max(0, startTime).toFixed(2),
      '-i', sourceVideoPath,
      '-i', narratorAudioPath,
      '-t', durStr,
      '-vf', vf,
      '-filter_complex', filterComplex,
      '-map', '0:v',
      '-map', '[aout]',
      '-threads', '2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
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
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`Narrator bridge render failed (${code}): ${stderr.slice(-300)}`));
        }
      });
      child.on('error', reject);
    });
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
    isFirst?: boolean;
    isLast?: boolean;
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
      isFirst?: boolean;
      isLast?: boolean;
      onProgress?: (percent: number) => void;
    },
    includeSubtitles: boolean
  ): Promise<string> {
    const { sourceVideoPath, startTime, endTime, assPath, outputPath, isFirst, isLast } = params;
    const duration = Math.max(1, endTime - startTime);

    const hasSubtitles = includeSubtitles && assPath && fs.existsSync(assPath);
    const escapedAssPath = hasSubtitles ? this.escapeFilterPath(assPath!) : '';
    const fontsDir = this.getFontsDir();
    const fontsDirParam = fontsDir ? `:fontsdir=${this.escapeFilterPath(fontsDir)}` : '';

    // Normalize to 1920x1080 16:9 edge-to-edge @ 30fps with unified cinematic color grade, subtle vignette, and smooth chapter fades
    const fadeDur = Math.min(0.35, duration / 4);
    const fadeOutStart = Math.max(0.1, duration - fadeDur).toFixed(2);
    const aFadeDur = Math.min(0.25, duration / 4);
    const aFadeOutStart = Math.max(0.1, duration - aFadeDur).toFixed(2);

    let vf = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,eq=contrast=1.06:saturation=1.10,vignette=PI/6`;
    if (hasSubtitles) {
      vf += `,subtitles=${escapedAssPath}${fontsDirParam}`;
    }
    vf += `,fade=t=in:st=0:d=${fadeDur.toFixed(2)},fade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(2)}`;

    const af = `loudnorm=I=-14:TP=-1.0:LRA=7,afade=t=in:st=0:d=${aFadeDur.toFixed(2)},afade=t=out:st=${aFadeOutStart}:d=${aFadeDur.toFixed(2)}`;

    const args = [
      '-y',
      '-ss', startTime.toFixed(2),
      '-i', sourceVideoPath,
      '-t', duration.toFixed(2),
      '-vf', vf,
      '-af', af,
      '-threads', '2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
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
   * Fast stream-copy concatenation of normalized chapter segments (each segment is already 1080p@30fps, -14 LUFS, with smooth fade-in/out)
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

    if (segmentPaths.length === 1) {
      fs.copyFileSync(segmentPaths[0], outputPath);
      if (onProgress) onProgress(100);
      return outputPath;
    }

    // Fast stream-copy concat (1-2 seconds, ~20MB RAM — zero OOM risk)
    const fileContent = segmentPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(concatListFile, fileContent, 'utf-8');

    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListFile,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (onProgress) {
          onProgress(75);
        }
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          if (onProgress) onProgress(100);
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
