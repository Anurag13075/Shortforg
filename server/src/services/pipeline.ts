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
import { ObjectStorageService } from './objectStorage.js';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface ReRenderOptions {
  cropOffsetX?: number;
  startTime?: number;
  endTime?: number;
  layout?: 'blur_bg' | 'crop';
  hookOverlay?: boolean;
  captionPreset?: CaptionPreset;
  captionActiveColor?: string;
  captionBaseColor?: string;
  wordsPerBurst?: number;
}

// In-memory event listeners and logs for Server-Sent Events (SSE) live progress per project
type ProgressListener = (data: {
  projectId: string;
  status: string;
  progress: number;
  stageMessage: string;
  errorMessage?: string | null;
  log?: LogEntry;
}) => void;

const listeners: Map<string, Set<ProgressListener>> = new Map();
const projectLogs: Map<string, LogEntry[]> = new Map();

export class PipelineService {
  /**
   * Subscribe to live progress and log updates for a project
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
   * Get all accumulated logs for a project
   */
  static getLogs(projectId: string): LogEntry[] {
    return projectLogs.get(projectId) || [];
  }

  /**
   * Record a log entry and broadcast to SSE listeners
   */
  static addLog(projectId: string, level: LogEntry['level'], message: string) {
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false
    });
    const entry: LogEntry = {
      timestamp: timeStr,
      level,
      message
    };

    if (!projectLogs.has(projectId)) {
      projectLogs.set(projectId, []);
    }
    const list = projectLogs.get(projectId)!;
    list.push(entry);
    if (list.length > 200) list.shift();

    const set = listeners.get(projectId);
    if (set) {
      for (const listener of set) {
        try {
          listener({
            projectId,
            status: 'processing',
            progress: -1,
            stageMessage: message,
            log: entry
          });
        } catch {}
      }
    }
  }

  /**
   * Broadcast progress state to DB and active SSE listeners
   */
  static notifyProgress(
    projectId: string,
    status: ProjectRecord['status'],
    progress: number,
    stageMessage: string,
    errorMessage: string | null = null,
    logLevel: LogEntry['level'] = 'info'
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

    this.addLog(projectId, logLevel, stageMessage);

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
   * 1. Download / Load video
   * 2. Transcribe (Groq Whisper with word-level timestamps)
   * 3. LLM Viral Moments Selection + Speech Sentence Snapping
   * 4. Pre-create all clip records in DB
   * 5. Isolated 1080p rendering for each clip (failures isolated, all clips processed)
   * 6. High-contrast thumbnails
   */
  static async runProjectPipeline(projectId: string) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord | undefined;
    if (!project) return;

    const projectDir = path.join(CONFIG.STORAGE_DIR, projectId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    try {
      this.addLog(projectId, 'info', `🚀 Starting ShortsForge autonomous studio pipeline for project ${projectId.slice(0, 8)}...`);

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
        this.notifyProgress(projectId, 'downloading', 5, 'Downloading high-resolution video stream from YouTube...');
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

      this.addLog(projectId, 'success', `✅ Source video loaded: "${title}" (${Math.round(duration)}s)`);

      // ----------------------------------------------------------------------
      // STEP 2: EXTRACT AUDIO & TRANSCRIBE (GROQ WHISPER)
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'transcribing', 35, 'Extracting 16kHz speech recognition audio stream...');

      const audioPath = path.join(projectDir, 'audio_extracted.mp3');
      await FFmpegService.extractAudio(sourceVideoPath!, audioPath);

      this.notifyProgress(projectId, 'transcribing', 42, 'Transcribing full audio with Groq Whisper (word timestamps)...');
      const transcription = await transcribeAudio(audioPath);

      this.addLog(projectId, 'success', `✅ Groq Whisper transcribed ${transcription.words.length} words with millisecond timestamps.`);

      // Save transcription to storage for inspection/debugging
      fs.writeFileSync(
        path.join(projectDir, 'transcript.json'),
        JSON.stringify(transcription, null, 2),
        'utf-8'
      );

      // ----------------------------------------------------------------------
      // STEP 3: PICK VIRAL MOMENTS & SNAP TO NATURAL SENTENCE BOUNDARIES
      // ----------------------------------------------------------------------
      const niche = project.niche || 'high_energy';
      this.notifyProgress(projectId, 'analyzing', 52, `Groq AI analyzing hooks & storytelling narrative (${niche} niche)...`);

      const viralMoments = await pickViralMoments(
        transcription.text,
        transcription.words,
        duration,
        8, // target 8 viral clips
        niche
      );

      this.addLog(projectId, 'success', `🧠 Groq AI extracted ${viralMoments.length} viral standalone moments with clean sentence cuts.`);

      // ----------------------------------------------------------------------
      // STEP 4: PRE-CREATE ALL CLIP RECORDS IN SQLITE (SO ALL CLIPS APPEAR IN UI IMMEDIATELY)
      // ----------------------------------------------------------------------
      // Clear any prior clips for this project if re-running
      try {
        db.prepare('DELETE FROM clips WHERE project_id = ?').run(projectId);
      } catch {}

      const totalMoments = viralMoments.length;
      const clipIds: string[] = [];

      for (let i = 0; i < totalMoments; i++) {
        const moment = viralMoments[i];
        const clipId = uuidv4();
        clipIds.push(clipId);
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO clips (
            id, project_id, title, caption, hashtags, hook_line, virality_score, reason,
            start_time, end_time, crop_offset_x, caption_preset, caption_active_color, caption_base_color, words_per_burst,
            title_options, caption_options, layout, hook_overlay, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'hormozi_gold', '#FFE600', '#FFFFFF', 2, ?, ?, 'blur_bg', 1, 'rendering', ?, ?)
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
          JSON.stringify(moment.title_options || [moment.title]),
          JSON.stringify(moment.caption_options || [moment.caption]),
          now,
          now
        );
      }

      // ----------------------------------------------------------------------
      // STEP 5: RENDER EACH CLIP INDEPENDENTLY (FAILURES ARE ISOLATED)
      // ----------------------------------------------------------------------
      let renderedSuccessCount = 0;

      for (let i = 0; i < totalMoments; i++) {
        const moment = viralMoments[i];
        const clipId = clipIds[i];
        const clipProgressStart = 60 + Math.floor((i / totalMoments) * 35);

        this.notifyProgress(
          projectId,
          'rendering',
          clipProgressStart,
          `Rendering Short #${i + 1}/${totalMoments}: "${moment.title}"...`
        );

        const videoOutputPath = path.join(projectDir, `short_${i + 1}_${clipId.substring(0, 8)}.mp4`);
        const thumbOutputPath = path.join(projectDir, `thumb_${i + 1}_${clipId.substring(0, 8)}.jpg`);
        const assPath = path.join(projectDir, `clip_${i + 1}_subtitles.ass`);

        try {
          // 1. Generate ASS animated subtitles with burned hook overlay (first 2.5s)
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
              animation: 'bounce',
              hookText: moment.hook_line,
              includeHookOverlay: true
            }
          );

          // 2. Render 1080p 9:16 vertical video with Hero Canvas blurred background
          await FFmpegService.renderClip({
            sourceVideoPath: sourceVideoPath!,
            startTime: moment.start,
            endTime: moment.end,
            cropOffsetXPercent: 0,
            layout: 'blur_bg',
            assSubtitlePath: assPath,
            outputPath: videoOutputPath
          });

          // 3. Generate high-contrast thumbnail
          const frameTimestamp = Math.min(moment.end, moment.start + 1.8);
          await FFmpegService.generateThumbnail({
            sourceVideoPath: sourceVideoPath!,
            captureTime: frameTimestamp,
            hookText: moment.hook_line,
            cropOffsetXPercent: 0,
            layout: 'blur_bg',
            outputPath: thumbOutputPath
          }).catch(() => '');

          // 4. Upload to S3 Object Storage if configured (permanent across redeploys) & Update Clip in DB
          let storedVideoPath = videoOutputPath;
          let storedThumbPath: string | null = fs.existsSync(thumbOutputPath) ? thumbOutputPath : null;

          if (ObjectStorageService.isEnabled()) {
            try {
              storedVideoPath = await ObjectStorageService.uploadFile(
                videoOutputPath,
                `projects/${projectId}/${path.basename(videoOutputPath)}`,
                'video/mp4'
              );
              if (storedThumbPath) {
                storedThumbPath = await ObjectStorageService.uploadFile(
                  storedThumbPath,
                  `projects/${projectId}/${path.basename(storedThumbPath)}`,
                  'image/jpeg'
                );
              }
            } catch (s3Err: any) {
              console.warn(`S3 upload warning for clip ${clipId}:`, s3Err.message);
            }
          }

          const now = new Date().toISOString();
          db.prepare(`
            UPDATE clips
            SET video_path = ?, thumbnail_path = ?, status = 'draft', updated_at = ?
            WHERE id = ?
          `).run(
            storedVideoPath,
            storedThumbPath,
            now,
            clipId
          );

          renderedSuccessCount++;
          this.addLog(projectId, 'success', `🎬 Short #${i + 1} ready: "${moment.title}" (${Math.round(moment.end - moment.start)}s)`);
        } catch (clipErr: any) {
          console.error(`Clip #${i + 1} rendering failed:`, clipErr.message);
          this.addLog(projectId, 'warn', `⚠️ Short #${i + 1} rendering error: ${clipErr.message}`);

          // Mark this individual clip failed, but CONTINUE loop so other clips render!
          db.prepare(`
            UPDATE clips
            SET status = 'failed', error_message = ?, updated_at = ?
            WHERE id = ?
          `).run(clipErr.message, new Date().toISOString(), clipId);
        }
      }

      // ----------------------------------------------------------------------
      // STEP 6: COMPLETED!
      // ----------------------------------------------------------------------
      const finalMsg = renderedSuccessCount > 0
        ? `Success! Generated ${renderedSuccessCount}/${totalMoments} viral Shorts ready for review.`
        : 'All clip rendering attempts failed.';

      this.notifyProgress(
        projectId,
        renderedSuccessCount > 0 ? 'completed' : 'failed',
        100,
        finalMsg,
        renderedSuccessCount > 0 ? null : 'Failed to render clips',
        renderedSuccessCount > 0 ? 'success' : 'error'
      );
    } catch (err: any) {
      console.error(`Pipeline error on project ${projectId}:`, err);
      this.notifyProgress(
        projectId,
        'failed',
        0,
        'Pipeline encountered an error',
        err.message || 'Unknown processing error',
        'error'
      );
    }
  }

  /**
   * Re-render a single clip when user updates crop offset, trim start/end, layout, or caption styles
   */
  static async reRenderClip(
    clipId: string,
    options?: number | ReRenderOptions
  ): Promise<ClipRecord> {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord | undefined;
    if (!clip) throw new Error(`Clip ${clipId} not found`);

    let project = db.prepare('SELECT * FROM projects WHERE id = ?').get(clip.project_id) as ProjectRecord | undefined;
    if (!project) {
      throw new Error('Parent project not found');
    }

    const projectDir = path.join(CONFIG.STORAGE_DIR, project.id);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Auto-recover source video if wiped on server restart
    if (!project.source_video_path || !fs.existsSync(project.source_video_path)) {
      if (!project.youtube_url || project.youtube_url.startsWith('file://')) {
        throw new Error('Original uploaded source video is missing on server.');
      }
      const dl = await downloadYouTubeVideo(project.youtube_url, projectDir);
      db.prepare('UPDATE projects SET source_video_path = ?, updated_at = ? WHERE id = ?')
        .run(dl.filePath, new Date().toISOString(), project.id);
      project = { ...project, source_video_path: dl.filePath };
    }

    // Auto-recover transcript.json if missing (so kinetic subtitles still render!)
    const transcriptCheckPath = path.join(projectDir, 'transcript.json');
    if (!fs.existsSync(transcriptCheckPath)) {
      try {
        const audioPath = path.join(projectDir, 'audio_extracted.mp3');
        if (!fs.existsSync(audioPath)) {
          await FFmpegService.extractAudio(project.source_video_path!, audioPath);
        }
        const trans = await transcribeAudio(audioPath);
        fs.writeFileSync(transcriptCheckPath, JSON.stringify(trans, null, 2), 'utf-8');
      } catch (transErr: any) {
        console.warn('Could not auto-recover transcript.json:', transErr.message);
      }
    }

    const opts: ReRenderOptions = typeof options === 'number' ? { cropOffsetX: options } : (options || {});
    const cropOffsetX = opts.cropOffsetX !== undefined ? opts.cropOffsetX : (clip.crop_offset_x ?? 0);
    const startTime = opts.startTime !== undefined ? Math.max(0, opts.startTime) : clip.start_time;
    const endTime = opts.endTime !== undefined ? Math.max(startTime + 5, opts.endTime) : clip.end_time;
    const layout = opts.layout || clip.layout || 'blur_bg';
    const hookOverlay = opts.hookOverlay !== undefined ? opts.hookOverlay : (clip.hook_overlay !== 0);

    const captionPreset = opts.captionPreset || (clip.caption_preset as CaptionPreset) || 'hormozi_gold';
    const captionActiveColor = opts.captionActiveColor || clip.caption_active_color || '#FFE600';
    const captionBaseColor = opts.captionBaseColor || clip.caption_base_color || '#FFFFFF';
    const wordsPerBurst = opts.wordsPerBurst || clip.words_per_burst || 2;

    // Update status to rendering
    db.prepare(`
      UPDATE clips
      SET status = 'rendering', start_time = ?, end_time = ?, crop_offset_x = ?, layout = ?, hook_overlay = ?, updated_at = ?
      WHERE id = ?
    `).run(startTime, endTime, cropOffsetX, layout, hookOverlay ? 1 : 0, new Date().toISOString(), clipId);

    try {
      // Re-read transcript if exists to build ASS subtitles
      const transcriptPath = path.join(projectDir, 'transcript.json');
      let assPath: string | undefined;

      if (fs.existsSync(transcriptPath)) {
        try {
          const transData = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
          if (Array.isArray(transData.words)) {
            assPath = path.join(projectDir, `clip_rerender_${clipId.substring(0, 6)}.ass`);
            generateAssSubtitles(transData.words, startTime, endTime, assPath, {
              preset: captionPreset,
              activeColorHex: captionActiveColor,
              baseColorHex: captionBaseColor,
              wordsPerChunk: wordsPerBurst,
              animation: 'bounce',
              hookText: clip.hook_line || clip.title,
              includeHookOverlay: hookOverlay
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
        startTime,
        endTime,
        cropOffsetXPercent: cropOffsetX,
        layout,
        assSubtitlePath: assPath,
        outputPath: newVideoPath
      });

      // Re-generate thumbnail
      const newThumbPath = path.join(projectDir, `thumb_rerender_${clipId.substring(0, 8)}_${Date.now()}.jpg`);
      try {
        await FFmpegService.generateThumbnail({
          sourceVideoPath: project.source_video_path,
          captureTime: Math.min(endTime, startTime + 1.8),
          hookText: clip.hook_line || clip.title,
          cropOffsetXPercent: cropOffsetX,
          layout,
          outputPath: newThumbPath
        });
      } catch {}

      // Delete old local files if different
      if (clip.video_path && !ObjectStorageService.isS3Uri(clip.video_path) && clip.video_path !== newVideoPath) {
        try { fs.unlinkSync(clip.video_path); } catch {}
      }
      if (clip.thumbnail_path && !ObjectStorageService.isS3Uri(clip.thumbnail_path) && clip.thumbnail_path !== newThumbPath) {
        try { fs.unlinkSync(clip.thumbnail_path); } catch {}
      }

      let storedVideoPath = newVideoPath;
      let storedThumbPath: string | null = fs.existsSync(newThumbPath) ? newThumbPath : clip.thumbnail_path;

      if (ObjectStorageService.isEnabled()) {
        try {
          storedVideoPath = await ObjectStorageService.uploadFile(
            newVideoPath,
            `projects/${project.id}/${path.basename(newVideoPath)}`,
            'video/mp4'
          );
          if (fs.existsSync(newThumbPath)) {
            storedThumbPath = await ObjectStorageService.uploadFile(
              newThumbPath,
              `projects/${project.id}/${path.basename(newThumbPath)}`,
              'image/jpeg'
            );
          }
        } catch (s3Err: any) {
          console.warn(`S3 upload warning on reRenderClip ${clipId}:`, s3Err.message);
        }
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE clips
        SET video_path = ?, thumbnail_path = ?, status = 'draft', start_time = ?, end_time = ?,
            crop_offset_x = ?, layout = ?, hook_overlay = ?, caption_preset = ?, caption_active_color = ?,
            caption_base_color = ?, words_per_burst = ?, updated_at = ?
        WHERE id = ?
      `).run(
        storedVideoPath,
        storedThumbPath,
        startTime,
        endTime,
        cropOffsetX,
        layout,
        hookOverlay ? 1 : 0,
        captionPreset,
        captionActiveColor,
        captionBaseColor,
        wordsPerBurst,
        now,
        clipId
      );

      return db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord;
    } catch (err: any) {
      db.prepare("UPDATE clips SET status = 'draft', error_message = ?, updated_at = ? WHERE id = ?")
        .run(err.message, new Date().toISOString(), clipId);
      throw err;
    }
  }
}
