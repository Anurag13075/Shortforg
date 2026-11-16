import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import { db, ProjectRecord, ClipRecord } from '../db/index.js';
import { downloadYouTubeVideo } from './downloader.js';
import { FFmpegService } from './ffmpeg.js';
import { transcribeAudio } from './transcriber.js';
import { pickViralMoments, ViralMoment } from './momentPicker.js';
import { generateAssSubtitles, CaptionPreset } from './subtitleGenerator.js';

export interface ReRenderOptions {
  cropOffsetX?: number;
  captionPreset?: CaptionPreset;
  captionActiveColor?: string;
  captionBaseColor?: string;
  wordsPerBurst?: number;
}

// In-memory event listeners for Server-Sent Events (SSE) live progress per project
type ProgressListener = (data: {
  projectId: string;
  status: string;
  progress: number;
  stageMessage: string;
  errorMessage?: string | null;
}) => void;

const listeners: Map<string, Set<ProgressListener>> = new Map();

export class PipelineService {
  /**
   * Subscribe to live progress updates for a project
   */
  static subscribeProgress(projectId: string, listener: ProgressListener): () => void {
    if (!listeners.has(projectId)) {
      listeners.set(projectId, new Set());
    }
    listeners.get(projectId)!.add(listener);

    return () => {
      listeners.get(projectId)?.delete(listener);
      if (listeners.get(projectId)?.size === 0) {
        listeners.delete(projectId);
      }
    };
  }

  /**
   * Broadcast progress state to DB and active SSE listeners
   */
  static notifyProgress(
    projectId: string,
    status: ProjectRecord['status'],
    progress: number,
    stageMessage: string,
    errorMessage: string | null = null
  ) {
    const now = new Date().toISOString();
    try {
      db.prepare(`
        UPDATE projects
        SET status = ?, progress = ?, stage_message = ?, error_message = ?, updated_at = ?
        WHERE id = ?
      `).run(status, Math.round(progress), stageMessage, errorMessage, now, projectId);
    } catch (e: any) {
      console.error('Failed to update project progress in DB:', e.message);
    }

    const set = listeners.get(projectId);
    if (set) {
      for (const listener of set) {
        try {
          listener({ projectId, status, progress, stageMessage, errorMessage });
        } catch {}
      }
    }
  }

  /**
   * Run full pipeline in background:
   * 1. Download
   * 2. Transcribe (Groq Whisper)
   * 3. LLM Viral Moments Selection
   * 4. Multi-clip 9:16 rendering + ASS animated subtitles
   * 5. Thumbnails generation
   */
  static async runProjectPipeline(projectId: string) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord | undefined;
    if (!project) return;

    const projectDir = path.join(CONFIG.STORAGE_DIR, projectId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    try {
      // ----------------------------------------------------------------------
      // STEP 1: PREPARE SOURCE VIDEO (DOWNLOAD OR DIRECT FILE)
      // ----------------------------------------------------------------------
      let sourceVideoPath = project.source_video_path;
      let duration = project.duration;
      let title = project.title || 'Source Video';

      if (sourceVideoPath && fs.existsSync(sourceVideoPath)) {
        this.notifyProgress(projectId, 'downloading', 30, 'Video file ready for processing...');
        if (!duration || duration <= 0) {
          try {
            const meta = await FFmpegService.getVideoMetadata(sourceVideoPath);
            duration = meta.duration;
          } catch {}
        }
      } else {
        this.notifyProgress(projectId, 'downloading', 5, 'Downloading video stream...');
        const downloadResult = await downloadYouTubeVideo(
          project.youtube_url,
          projectDir,
          (progress, msg) => {
            this.notifyProgress(projectId, 'downloading', Math.min(30, Math.round(progress * 0.3)), msg);
          }
        );

        sourceVideoPath = downloadResult.filePath;
        title = downloadResult.title;
        duration = downloadResult.duration;

        if (!duration || duration <= 0) {
          try {
            const meta = await FFmpegService.getVideoMetadata(sourceVideoPath);
            duration = meta.duration;
          } catch {}
        }

        db.prepare(`
          UPDATE projects
          SET title = ?, duration = ?, source_video_path = ?, updated_at = ?
          WHERE id = ?
        `).run(title, duration, sourceVideoPath, new Date().toISOString(), projectId);
      }

      // ----------------------------------------------------------------------
      // STEP 2: EXTRACT AUDIO & TRANSCRIBE (GROQ WHISPER)
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'transcribing', 35, 'Extracting audio for Whisper transcription...');

      const audioPath = path.join(projectDir, 'audio_extracted.mp3');
      await FFmpegService.extractAudio(sourceVideoPath!, audioPath);

      this.notifyProgress(projectId, 'transcribing', 42, 'Transcribing with Groq Whisper (word timestamps)...');
      const transcription = await transcribeAudio(audioPath);

      // Save transcription to storage for inspection/debugging
      fs.writeFileSync(
        path.join(projectDir, 'transcript.json'),
        JSON.stringify(transcription, null, 2),
        'utf-8'
      );

      // ----------------------------------------------------------------------
      // STEP 3: PICK VIRAL MOMENTS (GROQ LLM)
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'analyzing', 52, 'Groq LLM is hunting for the best viral moments...');

      const viralMoments = await pickViralMoments(
        transcription.text,
        transcription.words,
        duration,
        8 // default 8 clips
      );

      // ----------------------------------------------------------------------
      // STEP 4: RENDER 9:16 VERTICAL CLIPS & ANIMATED SUBTITLES & THUMBNAILS
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'rendering', 60, `Rendering ${viralMoments.length} vertical 9:16 Shorts with animated captions...`);

      // Clear any prior clips for this project if re-running
      try {
        db.prepare('DELETE FROM clips WHERE project_id = ?').run(projectId);
      } catch {}

      const totalMoments = viralMoments.length;
      for (let i = 0; i < totalMoments; i++) {
        const moment = viralMoments[i];
        const clipId = uuidv4();
        const clipProgressStart = 60 + Math.floor((i / totalMoments) * 35);

        this.notifyProgress(
          projectId,
          'rendering',
          clipProgressStart,
          `Rendering Short #${i + 1}/${totalMoments}: "${moment.title}"...`
        );

        // 1. Generate ASS animated subtitles for this segment (Videocaptions.ai style kinetic pop)
        const assPath = path.join(projectDir, `clip_${i + 1}_subtitles.ass`);
        generateAssSubtitles(
          transcription.words,
          moment.start,
          moment.end,
          assPath,
          {
            preset: 'hormozi_gold',
            activeColorHex: '#FFE600',
            baseColorHex: '#FFFFFF',
            wordsPerChunk: 2,
            animation: 'bounce'
          }
        );

        // 2. Render 9:16 cropped clip with FFmpeg
        const videoOutputPath = path.join(projectDir, `short_${i + 1}_${clipId.substring(0, 8)}.mp4`);
        await FFmpegService.renderClip({
          sourceVideoPath: sourceVideoPath!,
          startTime: moment.start,
          endTime: moment.end,
          cropOffsetXPercent: 0, // default center crop
          assSubtitlePath: assPath,
          outputPath: videoOutputPath
        });

        // 3. Generate high-contrast thumbnail with hook text overlay
        const thumbOutputPath = path.join(projectDir, `thumb_${i + 1}_${clipId.substring(0, 8)}.jpg`);
        const frameTimestamp = Math.min(moment.end, moment.start + 1.8);
        try {
          await FFmpegService.generateThumbnail({
            sourceVideoPath: sourceVideoPath!,
            captureTime: frameTimestamp,
            hookText: moment.hook_line,
            cropOffsetXPercent: 0,
            outputPath: thumbOutputPath
          });
        } catch (thumbErr: any) {
          console.warn(`Thumbnail generation warning for clip ${i + 1}: ${thumbErr.message}`);
        }

        // 4. Save Clip to SQLite
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO clips (
            id, project_id, title, caption, hashtags, hook_line, virality_score, reason,
            start_time, end_time, crop_offset_x, caption_preset, caption_active_color, caption_base_color, words_per_burst,
            video_path, thumbnail_path, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        `).run(
          clipId,
          projectId,
          moment.title,
          moment.caption,
          JSON.stringify(moment.hashtags),
          moment.hook_line,
          moment.virality_score,
          moment.reason,
          moment.start,
          moment.end,
          0,
          'hormozi_gold',
          '#FFE600',
          '#FFFFFF',
          2,
          videoOutputPath,
          fs.existsSync(thumbOutputPath) ? thumbOutputPath : null,
          now,
          now
        );
      }

      // ----------------------------------------------------------------------
      // STEP 5: COMPLETED!
      // ----------------------------------------------------------------------
      this.notifyProgress(
        projectId,
        'completed',
        100,
        `Success! Generated ${totalMoments} viral Shorts ready for review.`
      );
    } catch (err: any) {
      console.error(`Pipeline error on project ${projectId}:`, err);
      this.notifyProgress(
        projectId,
        'failed',
        0,
        'Pipeline encountered an error',
        err.message || 'Unknown processing error'
      );
    }
  }

  /**
   * Re-render a single clip when user updates crop offset or caption colors/presets
   */
  static async reRenderClip(
    clipId: string,
    options?: number | ReRenderOptions
  ): Promise<ClipRecord> {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord | undefined;
    if (!clip) throw new Error(`Clip ${clipId} not found`);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(clip.project_id) as ProjectRecord | undefined;
    if (!project || !project.source_video_path || !fs.existsSync(project.source_video_path)) {
      throw new Error('Original source video is missing');
    }

    const opts: ReRenderOptions = typeof options === 'number' ? { cropOffsetX: options } : (options || {});
    const cropOffsetX = opts.cropOffsetX !== undefined ? opts.cropOffsetX : (clip.crop_offset_x ?? 0);
    const captionPreset = opts.captionPreset || (clip.caption_preset as CaptionPreset) || 'hormozi_gold';
    const captionActiveColor = opts.captionActiveColor || clip.caption_active_color || '#FFE600';
    const captionBaseColor = opts.captionBaseColor || clip.caption_base_color || '#FFFFFF';
    const wordsPerBurst = opts.wordsPerBurst || clip.words_per_burst || 2;

    const projectDir = path.dirname(clip.video_path || path.join(CONFIG.STORAGE_DIR, clip.project_id, 'file.mp4'));

    // Update status to rendering
    db.prepare("UPDATE clips SET status = 'rendering', crop_offset_x = ?, updated_at = ? WHERE id = ?")
      .run(cropOffsetX, new Date().toISOString(), clipId);

    try {
      // Re-read transcript if exists to build ASS subtitles
      const transcriptPath = path.join(projectDir, 'transcript.json');
      let assPath: string | undefined;

      if (fs.existsSync(transcriptPath)) {
        try {
          const transData = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
          if (Array.isArray(transData.words)) {
            assPath = path.join(projectDir, `clip_rerender_${clipId.substring(0, 6)}.ass`);
            generateAssSubtitles(transData.words, clip.start_time, clip.end_time, assPath, {
              preset: captionPreset,
              activeColorHex: captionActiveColor,
              baseColorHex: captionBaseColor,
              wordsPerChunk: wordsPerBurst,
              animation: 'bounce'
            });
          }
        } catch (err: any) {
          console.warn('Subtitle re-generation warning:', err.message);
        }
      }

      // Output new video file
      const newVideoPath = path.join(projectDir, `short_rerender_${clipId.substring(0, 8)}_${Date.now()}.mp4`);
      await FFmpegService.renderClip({
        sourceVideoPath: project.source_video_path,
        startTime: clip.start_time,
        endTime: clip.end_time,
        cropOffsetXPercent: cropOffsetX,
        assSubtitlePath: assPath,
        outputPath: newVideoPath
      });

      // Re-generate thumbnail with offset
      const newThumbPath = path.join(projectDir, `thumb_rerender_${clipId.substring(0, 8)}_${Date.now()}.jpg`);
      try {
        await FFmpegService.generateThumbnail({
          sourceVideoPath: project.source_video_path,
          captureTime: Math.min(clip.end_time, clip.start_time + 1.8),
          hookText: clip.hook_line || clip.title,
          cropOffsetXPercent: cropOffsetX,
          outputPath: newThumbPath
        });
      } catch {}

      // Delete old files if different
      if (clip.video_path && clip.video_path !== newVideoPath) {
        try { fs.unlinkSync(clip.video_path); } catch {}
      }
      if (clip.thumbnail_path && clip.thumbnail_path !== newThumbPath) {
        try { fs.unlinkSync(clip.thumbnail_path); } catch {}
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE clips
        SET video_path = ?, thumbnail_path = ?, status = 'draft', crop_offset_x = ?,
            caption_preset = ?, caption_active_color = ?, caption_base_color = ?, words_per_burst = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        newVideoPath,
        fs.existsSync(newThumbPath) ? newThumbPath : clip.thumbnail_path,
        cropOffsetX,
        captionPreset,
        captionActiveColor,
        captionBaseColor,
        wordsPerBurst,
        now,
        clipId
      );

      return db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord;
    } catch (err: any) {
      db.prepare("UPDATE clips SET status = 'draft', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), clipId);
      throw err;
    }
  }
}
