import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Groq from 'groq-sdk';
import { CONFIG } from '../config.js';
import { db, LongformProjectRecord, LongformChapter } from '../db/index.js';
import { downloadYouTubeVideo } from './downloader.js';
import { FFmpegService } from './ffmpeg.js';
import { transcribeAudio, TranscriptionResult } from './transcriber.js';
import { LongformFFmpegService } from './longformFfmpeg.js';
import { ObjectStorageService } from './objectStorage.js';

export interface LongformLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

type LongformProgressListener = (data: {
  projectId: string;
  status: string;
  progress: number;
  stageMessage: string;
  errorMessage?: string | null;
  log?: LongformLogEntry;
}) => void;

const listeners: Map<string, Set<LongformProgressListener>> = new Map();
const projectLogs: Map<string, LongformLogEntry[]> = new Map();

export class LongformPipelineService {
  /**
   * Subscribe to live progress and log updates for a longform project
   */
  static subscribeProgress(projectId: string, listener: LongformProgressListener): () => void {
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
  static getLogs(projectId: string): LongformLogEntry[] {
    return projectLogs.get(projectId) || [];
  }

  /**
   * Record a log entry and broadcast to SSE listeners
   */
  static addLog(projectId: string, level: LongformLogEntry['level'], message: string) {
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false
    });
    const entry: LongformLogEntry = {
      timestamp: timeStr,
      level,
      message
    };

    if (!projectLogs.has(projectId)) {
      projectLogs.set(projectId, []);
    }
    const list = projectLogs.get(projectId)!;
    list.push(entry);
    if (list.length > 250) list.shift();

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
    status: LongformProjectRecord['status'],
    progress: number,
    stageMessage: string,
    errorMessage: string | null = null,
    logLevel: LongformLogEntry['level'] = 'info'
  ) {
    const now = new Date().toISOString();
    try {
      db.prepare(`
        UPDATE longform_projects
        SET status = ?, progress = ?, stage_message = ?, error_message = ?, updated_at = ?
        WHERE id = ?
      `).run(status, Math.round(progress), stageMessage, errorMessage, now, projectId);
    } catch (e: any) {
      console.error('Failed to update longform project progress in DB:', e.message);
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
   * Run the full Long-Form synthesis pipeline:
   * 1. Download all source videos
   * 2. Extract 16kHz audio & transcribe each with Groq Whisper
   * 3. AI Documentary Director (Groq LLM) designs cohesive narrative chapters
   * 4. Render 1080p 16:9 chapter segments with title cards
   * 5. Concat segments + master audio to -14 LUFS YouTube standard
   * 6. Generate 16:9 high-CTR thumbnail
   */
  static async runPipeline(projectId: string) {
    const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;
    if (!project) return;

    const projectDir = path.join(CONFIG.STORAGE_DIR, `longform_${projectId}`);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    let sourceUrls: string[] = [];
    try {
      sourceUrls = JSON.parse(project.source_urls);
    } catch {
      sourceUrls = [];
    }

    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) {
      this.notifyProgress(projectId, 'failed', 0, 'No source URLs provided for long-form synthesis', 'No source URLs provided', 'error');
      return;
    }

    try {
      this.addLog(projectId, 'info', `🎬 Initializing Long-Form Documentary Engine for topic: "${project.topic}" (${sourceUrls.length} sources)`);

      // ----------------------------------------------------------------------
      // STEP 1: DOWNLOAD ALL SOURCE VIDEOS
      // ----------------------------------------------------------------------
      interface SourceInfo {
        index: number;
        url: string;
        title: string;
        duration: number;
        videoPath: string;
        transcript?: TranscriptionResult;
      }

      const sources: SourceInfo[] = [];

      for (let i = 0; i < sourceUrls.length; i++) {
        const url = sourceUrls[i];
        const stepProgress = Math.round(5 + (i / sourceUrls.length) * 20);
        this.notifyProgress(projectId, 'downloading', stepProgress, `Downloading source video [${i + 1}/${sourceUrls.length}]...`);

        const sourceDir = path.join(projectDir, `source_${i}`);
        if (!fs.existsSync(sourceDir)) {
          fs.mkdirSync(sourceDir, { recursive: true });
        }

        // Check if cached file exists
        const existingFiles = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
        let videoPath = '';
        let videoTitle = `Source Video ${i + 1}`;
        let videoDuration = 0;

        if (existingFiles.length > 0) {
          videoPath = path.join(sourceDir, existingFiles[0]);
          try {
            const meta = await FFmpegService.getVideoMetadata(videoPath);
            videoDuration = meta.duration;
            videoTitle = existingFiles[0].replace(/^[a-z0-9_]+_/, '').replace(/\.[^.]+$/, '');
          } catch {}
          this.addLog(projectId, 'info', `⚡ Using cached source [${i + 1}]: "${videoTitle}" (${Math.round(videoDuration)}s)`);
        } else {
          const dlResult = await downloadYouTubeVideo(url, sourceDir, (p, msg) => {
            const scaled = Math.round(5 + (i / sourceUrls.length) * 20 + (p * 0.2) / sourceUrls.length);
            this.notifyProgress(projectId, 'downloading', scaled, `[${i + 1}/${sourceUrls.length}] ${msg}`);
          });
          videoPath = dlResult.filePath;
          videoTitle = dlResult.title;
          videoDuration = dlResult.duration;
          this.addLog(projectId, 'success', `✅ Downloaded source [${i + 1}]: "${videoTitle}" (${Math.round(videoDuration)}s)`);
        }

        sources.push({
          index: i,
          url,
          title: videoTitle,
          duration: videoDuration,
          videoPath
        });
      }

      // ----------------------------------------------------------------------
      // STEP 2: EXTRACT AUDIO & TRANSCRIBE EACH SOURCE
      // ----------------------------------------------------------------------
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const stepProgress = Math.round(25 + (i / sources.length) * 20);
        this.notifyProgress(projectId, 'transcribing', stepProgress, `Transcribing source audio [${i + 1}/${sources.length}]: "${src.title.slice(0, 30)}..."`);

        const sourceDir = path.dirname(src.videoPath);
        const transcriptFile = path.join(sourceDir, 'transcript.json');

        if (fs.existsSync(transcriptFile)) {
          try {
            src.transcript = JSON.parse(fs.readFileSync(transcriptFile, 'utf-8'));
            this.addLog(projectId, 'info', `⚡ Loaded existing transcript for source [${i + 1}] (${src.transcript?.words?.length || 0} words)`);
            continue;
          } catch {}
        }

        const audioPath = path.join(sourceDir, 'speech.mp3');
        if (!fs.existsSync(audioPath)) {
          await FFmpegService.extractAudio(src.videoPath, audioPath);
        }

        const transcription = await transcribeAudio(audioPath);
        src.transcript = transcription;
        fs.writeFileSync(transcriptFile, JSON.stringify(transcription, null, 2), 'utf-8');
        this.addLog(projectId, 'success', `✅ Transcribed source [${i + 1}]: ${transcription.words.length} words with timestamps`);
      }

      // ----------------------------------------------------------------------
      // STEP 3: AI DOCUMENTARY DIRECTOR (GROQ LLM)
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'scripting', 48, 'Groq AI synthesizing narrative story arc & chapter timeline...');

      const synthesisResult = await this.synthesizeStory(
        project.topic,
        sources,
        project.target_duration || 600
      );

      const generatedTitle = synthesisResult.title || project.topic;
      const scriptOutline = synthesisResult.script_outline || '';
      const chapters: LongformChapter[] = synthesisResult.chapters.map((ch, idx) => ({
        id: uuidv4(),
        title: ch.title,
        source_index: ch.source_index,
        source_url: sources[ch.source_index]?.url || sourceUrls[0],
        source_title: sources[ch.source_index]?.title || `Source ${ch.source_index + 1}`,
        start_time: ch.start_time,
        end_time: ch.end_time,
        duration: Math.max(1, ch.end_time - ch.start_time),
        hook_text: ch.hook_text || '',
        summary: ch.summary || '',
        order: idx + 1
      }));

      this.addLog(projectId, 'success', `🎬 AI Director created ${chapters.length} cohesive chapters: "${generatedTitle}"`);

      // Update DB with generated script outline, auto-discovered topic/title, and chapters
      db.prepare(`
        UPDATE longform_projects
        SET title = ?, topic = ?, chapters = ?, script_outline = ?, updated_at = ?
        WHERE id = ?
      `).run(generatedTitle, generatedTitle, JSON.stringify(chapters), scriptOutline, new Date().toISOString(), projectId);

      // ----------------------------------------------------------------------
      // STEP 4: RENDER CHAPTER SEGMENTS (1080p 16:9 + Lower Third Title Cards)
      // ----------------------------------------------------------------------
      const segmentPaths = await this.renderChapters(projectId, projectDir, sources, chapters);

      // ----------------------------------------------------------------------
      // STEP 5: CONCATENATE & MASTER AUDIO (-14 LUFS)
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'rendering', 90, 'Mastering final 1080p video & normalizing broadcast audio to -14 LUFS...');

      const masterVideoPath = path.join(projectDir, 'master_longform.mp4');
      const concatListFile = path.join(projectDir, 'concat_list.txt');

      await LongformFFmpegService.concatenateSegments(
        segmentPaths,
        concatListFile,
        masterVideoPath,
        (p) => {
          this.notifyProgress(projectId, 'rendering', 92, 'Mastering final video stream...');
        }
      );

      // Verify master video duration
      let actualDuration = 0;
      try {
        const meta = await FFmpegService.getVideoMetadata(masterVideoPath);
        actualDuration = meta.duration;
      } catch {}

      // ----------------------------------------------------------------------
      // STEP 6: GENERATE HIGH-CTR 16:9 THUMBNAIL
      // ----------------------------------------------------------------------
      this.notifyProgress(projectId, 'rendering', 96, 'Designing 16:9 high-CTR thumbnail with dynamic badges...');

      const thumbnailPath = path.join(projectDir, 'thumbnail.jpg');
      const firstSource = sources[0]?.videoPath || masterVideoPath;
      const thumbHook = chapters[0]?.hook_text || 'INSANE DETAILS';

      await LongformFFmpegService.generateThumbnail({
        sourceVideoPath: masterVideoPath,
        captureTime: Math.min(10, actualDuration * 0.1),
        title: generatedTitle,
        hookText: thumbHook,
        outputPath: thumbnailPath
      });

      // ----------------------------------------------------------------------
      // STEP 7: UPLOAD TO PERMANENT S3 OBJECT STORAGE & FINALIZE
      // ----------------------------------------------------------------------
      let storedVideoPath = path.relative(CONFIG.STORAGE_DIR, masterVideoPath).replace(/\\/g, '/');
      let storedThumbPath = path.relative(CONFIG.STORAGE_DIR, thumbnailPath).replace(/\\/g, '/');

      if (ObjectStorageService.isEnabled()) {
        this.notifyProgress(projectId, 'rendering', 98, 'Uploading 1080p master video & thumbnail to permanent cloud storage...');
        try {
          storedVideoPath = await ObjectStorageService.uploadFile(
            masterVideoPath,
            `longform/${projectId}/master_longform.mp4`,
            'video/mp4'
          );
          if (fs.existsSync(thumbnailPath)) {
            storedThumbPath = await ObjectStorageService.uploadFile(
              thumbnailPath,
              `longform/${projectId}/thumbnail.jpg`,
              'image/jpeg'
            );
          }
          this.addLog(projectId, 'success', '☁️ Saved master video & thumbnail permanently to S3 Object Storage.');
        } catch (s3Err: any) {
          this.addLog(projectId, 'warn', `S3 upload warning (kept local): ${s3Err.message}`);
        }
      }

      db.prepare(`
        UPDATE longform_projects
        SET status = 'completed', progress = 100, stage_message = 'Long-form documentary synthesized successfully!',
            actual_duration = ?, video_path = ?, thumbnail_path = ?, updated_at = ?
        WHERE id = ?
      `).run(actualDuration, storedVideoPath, storedThumbPath, new Date().toISOString(), projectId);

      this.addLog(projectId, 'success', `🏆 Full ${Math.round(actualDuration / 60)}m ${Math.round(actualDuration % 60)}s Long-Form Video ready for preview & upload!`);

    } catch (err: any) {
      console.error('Long-Form pipeline failed:', err);
      this.notifyProgress(
        projectId,
        'failed',
        0,
        `Pipeline failed: ${err.message}`,
        err.message,
        'error'
      );
    }
  }

  /**
   * AI Story Arc & Chapter Synthesis via Groq LLM
   */
  private static async synthesizeStory(
    topic: string,
    sources: Array<{ index: number; url: string; title: string; duration: number; transcript?: TranscriptionResult }>,
    targetDurationSeconds: number
  ): Promise<{
    title: string;
    script_outline: string;
    chapters: Array<{
      title: string;
      source_index: number;
      start_time: number;
      end_time: number;
      hook_text: string;
      summary: string;
    }>;
  }> {
    const apiKey = CONFIG.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured in .env');
    }

    const groq = new Groq({ apiKey });

    // Prepare rich timestamped source summaries so the AI Director sees the full arc
    const sourcesSummary = sources.map((src) => {
      const words = src.transcript?.words || [];
      const totalWords = words.length;
      const step = Math.max(1, Math.floor(totalWords / 30));
      const sampledQuotes: string[] = [];
      for (let i = 0; i < totalWords; i += step) {
        const slice = words.slice(i, i + 16);
        if (slice.length > 0) {
          sampledQuotes.push(`[${slice[0].start.toFixed(0)}s]: ${slice.map((w) => w.word).join(' ')}`);
        }
      }
      return `--- SOURCE VIDEO #${src.index} ---
Title: "${src.title}"
Total Duration: ${Math.round(src.duration)}s
Sampled Timeline Excerpts:
${sampledQuotes.slice(0, 28).join('\n')}`;
    }).join('\n\n');

    const isAutoTopic = !topic || topic === 'Auto-Synthesized Documentary';

    const systemPrompt = `You are an award-winning YouTube Documentary Director and Master Storyteller.
Your job is to analyze multiple YouTube source videos (which may cover different scenes, angles, or even random topics) and weave their best moments into ONE seamless, cohesive, high-retention long-form video that NEVER loses its track from start to end.

CRITICAL DIRECTING PRINCIPLES:
1. AUTO-DISCOVER THE UNIFYING STORY (EVEN FROM DIFFERENT VIDEOS):
   ${isAutoTopic
     ? '- The user did NOT specify a topic. Analyze ALL source transcripts and titles, discover the most exciting unifying theme or overarching narrative thread that connects them all, and invent a viral, curiosity-driven YouTube Title for it.'
     : `- Unify all source videos around this core angle: "${topic}".`}
2. 5-ACT NARRATIVE STRUCTURE (NO RANDOM JUMPS — SEAMLESS FLOW START TO END):
   - Chapter 1 (Cold Open / Explosive Hook): 25-45s. Opens with the single most shocking, high-energy revelation across ALL videos.
   - Chapters 2-3 (Act 1 — Setup & Context): Establishes the core mystery/subject and bridges the first sources smoothly.
   - Chapters 4-6 (Act 2 — Escalation & Deep Dive): Builds momentum with deeper evidence, comparisons, or gameplay/story twists so each chapter naturally leads into the next.
   - Chapters 7-8 (Act 3 — Climax / Biggest Reveal): The highest-stakes moment or twist across the sources.
   - Final Chapter (Grand Takeaway): Ties every thread together for a clean, satisfying ending.
3. USE EVERY SOURCE & KEEP COHESION:
   - Include segments from EVERY available source video (0 to ${sources.length - 1}) so nothing the user provided is wasted.
   - Target total duration around ${Math.round(targetDurationSeconds / 60)} minutes (${targetDurationSeconds}s) by creating 7 to 10 chapters of 45 to 95 seconds each.
   - Every chapter's "summary" should explain how it connects smoothly from the previous chapter to the next.
4. ACCURATE TIMESTAMPS:
   - "start_time" and "end_time" must be in seconds within that source video's total duration.
   - "source_index" must match the 0-based source video index.
5. TITLE & ON-SCREEN HOOKS:
   - Main Title: High-CTR, under 70 characters, no clickbait clichés unless grounded in the videos.
   - Each chapter must have a punchy 2-4 word "hook_text" displayed on-screen.

OUTPUT FORMAT: Return STRICT JSON ONLY:
{
  "title": "Your Compelling Unified YouTube Title",
  "script_outline": "A cohesive narrative roadmap explaining how all chapters flow from start to end...",
  "chapters": [
    {
      "title": "Chapter 1: ...",
      "source_index": 0,
      "start_time": 25.0,
      "end_time": 85.0,
      "hook_text": "SHORT PUNCHY HOOK",
      "summary": "How this chapter hooks the viewer and leads into Chapter 2."
    }
  ]
}`;

    const userPrompt = `${isAutoTopic ? 'MODE: AUTO-ANALYZE & UNIFY ALL VIDEOS (No preset topic given — discover the best unifying story!)' : `TOPIC / GOAL: "${topic}"`}
TARGET DURATION: ${targetDurationSeconds} seconds (~${Math.round(targetDurationSeconds / 60)} minutes)
AVAILABLE SOURCE VIDEOS (${sources.length} total):
${sourcesSummary}

Analyze all ${sources.length} videos and synthesize a complete 7-10 chapter cohesive video in valid JSON format.`;

    const candidateModels = [
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b'
    ];

    let lastError: any;

    for (const model of candidateModels) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4096,
          temperature: 0.3
        });

        const content = completion?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
            // Validate, sanitize, and snap timestamps to natural speech pauses / sentence boundaries
            const sanitizedChapters = parsed.chapters.map((ch: any) => {
              const srcIdx = Math.max(0, Math.min(sources.length - 1, Number(ch.source_index) || 0));
              const src = sources[srcIdx];
              const maxDur = src?.duration || 300;
              let start = Math.max(0, Number(ch.start_time) || 10);
              let end = Number(ch.end_time) || start + 60;
              if (end <= start) end = start + 50;
              if (end > maxDur) {
                end = Math.max(15, maxDur - 2);
                start = Math.max(0, end - 60);
              }
              const words = src?.transcript?.words || [];
              if (words.length > 0) {
                start = this.snapToSpeechBoundary(words, start, 'start');
                end = this.snapToSpeechBoundary(words, end, 'end');
                if (end <= start + 8) end = Math.min(maxDur, start + 45);
              }
              return {
                title: String(ch.title || `Chapter ${srcIdx + 1}`),
                source_index: srcIdx,
                start_time: Number(start.toFixed(1)),
                end_time: Number(end.toFixed(1)),
                hook_text: String(ch.hook_text || 'INSANE REVELATION'),
                summary: String(ch.summary || '')
              };
            });

            return {
              title: parsed.title || topic,
              script_outline: parsed.script_outline || '',
              chapters: sanitizedChapters
            };
          }
        }
      } catch (err: any) {
        console.warn(`Groq model ${model} failed for story synthesis:`, err.message);
        lastError = err;
      }
    }

    // Fallback if LLM fails: create intelligent balanced chapters across available sources
    console.warn('Falling back to algorithmic narrative chapter synthesis...');
    const fallbackChapters: any[] = [];
    let chOrder = 1;
    for (let sIdx = 0; sIdx < sources.length; sIdx++) {
      const src = sources[sIdx];
      const dur = src.duration || 300;
      const segLength = Math.min(75, Math.floor(dur / 3));

      fallbackChapters.push({
        title: `Chapter ${chOrder++}: Key Secrets from ${src.title.slice(0, 35)}`,
        source_index: sIdx,
        start_time: Math.max(0, Math.floor(dur * 0.1)),
        end_time: Math.min(dur, Math.floor(dur * 0.1) + segLength),
        hook_text: 'CRITICAL DETAIL',
        summary: `Highlights the most high-retention gameplay details from source #${sIdx + 1}.`
      });

      if (dur > 180) {
        fallbackChapters.push({
          title: `Chapter ${chOrder++}: Deep Analysis - ${src.title.slice(0, 35)}`,
          source_index: sIdx,
          start_time: Math.floor(dur * 0.5),
          end_time: Math.min(dur, Math.floor(dur * 0.5) + segLength),
          hook_text: 'GAME CHANGER',
          summary: `Deconstructs the story elements and mechanics from source #${sIdx + 1}.`
        });
      }
    }

    return {
      title: topic,
      script_outline: `A comprehensive deep-dive synthesis exploring ${topic} across ${sources.length} exclusive gameplay sources.`,
      chapters: fallbackChapters
    };
  }

  /**
   * Snaps a target timestamp to the nearest natural speech pause or sentence boundary within ±4s
   * so chapters never start or cut off mid-word.
   */
  private static snapToSpeechBoundary(
    words: Array<{ word: string; start: number; end: number }>,
    targetSec: number,
    mode: 'start' | 'end'
  ): number {
    let bestTime = targetSec;
    let bestScore = Infinity;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const candidate = mode === 'start' ? Math.max(0, w.start - 0.15) : w.end + 0.2;
      const dist = Math.abs(candidate - targetSec);
      if (dist > 4.0) continue;

      const prev = i > 0 ? words[i - 1] : null;
      const next = i + 1 < words.length ? words[i + 1] : null;
      const gapBefore = prev ? w.start - prev.end : 1.0;
      const gapAfter = next ? next.start - w.end : 1.0;
      const endsSentence = /[.?!]$/.test((mode === 'start' ? prev?.word : w.word) || '');

      const isPause = mode === 'start' ? gapBefore >= 0.3 : gapAfter >= 0.3;
      const penalty = (endsSentence ? 0 : 1.5) + (isPause ? 0 : 1.0);
      const score = dist + penalty;

      if (score < bestScore) {
        bestScore = score;
        bestTime = candidate;
      }
    }

    return bestTime;
  }

  /**
   * Renders each chapter segment with title cards and 1080p normalization
   */
  private static async renderChapters(
    projectId: string,
    projectDir: string,
    sources: Array<{ index: number; videoPath: string; title: string }>,
    chapters: LongformChapter[]
  ): Promise<string[]> {
    const segmentsDir = path.join(projectDir, 'segments');
    if (!fs.existsSync(segmentsDir)) {
      fs.mkdirSync(segmentsDir, { recursive: true });
    }

    const renderedPaths: string[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const src = sources[ch.source_index] || sources[0];
      const segProgress = Math.round(55 + (i / chapters.length) * 33);

      this.notifyProgress(
        projectId,
        'rendering',
        segProgress,
        `Rendering Chapter [${i + 1}/${chapters.length}]: "${ch.title.slice(0, 30)}..."`
      );

      const assPath = path.join(segmentsDir, `chapter_${i}.ass`);
      LongformFFmpegService.generateChapterAss(ch.title, ch.hook_text, assPath, i + 1, chapters.length);

      const segmentOutPath = path.join(segmentsDir, `seg_${i}.mp4`);

      await LongformFFmpegService.renderChapterSegment({
        sourceVideoPath: src.videoPath,
        startTime: ch.start_time,
        endTime: ch.end_time,
        chapterTitle: ch.title,
        hookText: ch.hook_text,
        assPath,
        outputPath: segmentOutPath,
        isFirst: i === 0,
        isLast: i === chapters.length - 1,
        onProgress: (p) => {
          const scaled = Math.round(55 + (i / chapters.length) * 33 + (p * 0.33) / chapters.length);
          this.notifyProgress(projectId, 'rendering', scaled, `[${i + 1}/${chapters.length}] Rendering: ${p}%`);
        }
      });

      renderedPaths.push(segmentOutPath);
      this.addLog(projectId, 'info', `✅ Rendered chapter [${i + 1}/${chapters.length}]: "${ch.title}" (${Math.round(ch.end_time - ch.start_time)}s)`);
    }

    return renderedPaths;
  }

  /**
   * Re-renders the longform video when user edits chapters (reorder, trim, rename) in UI
   */
  static async reRenderProject(projectId: string, customChapters: LongformChapter[]) {
    const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;
    if (!project) throw new Error('Project not found');

    const projectDir = path.join(CONFIG.STORAGE_DIR, `longform_${projectId}`);
    let sourceUrls: string[] = [];
    try {
      sourceUrls = JSON.parse(project.source_urls);
    } catch {
      sourceUrls = [];
    }

    // Discover source video paths
    const sources: Array<{ index: number; videoPath: string; title: string }> = [];
    for (let i = 0; i < sourceUrls.length; i++) {
      const sourceDir = path.join(projectDir, `source_${i}`);
      const files = fs.existsSync(sourceDir) ? fs.readdirSync(sourceDir).filter((f) => f.endsWith('.mp4') || f.endsWith('.mkv')) : [];
      if (files.length > 0) {
        sources.push({
          index: i,
          videoPath: path.join(sourceDir, files[0]),
          title: files[0]
        });
      }
    }

    if (sources.length === 0) {
      throw new Error('Source videos missing on server. Please re-run the full pipeline.');
    }

    this.notifyProgress(projectId, 'rendering', 10, 'Re-rendering updated chapter timeline...');

    // Save updated chapters to DB
    db.prepare(`
      UPDATE longform_projects
      SET chapters = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(customChapters), new Date().toISOString(), projectId);

    // Render segments
    const segmentPaths = await this.renderChapters(projectId, projectDir, sources, customChapters);

    // Concat & Master
    this.notifyProgress(projectId, 'rendering', 85, 'Mastering re-edited video and normalizing audio to -14 LUFS...');
    const masterVideoPath = path.join(projectDir, 'master_longform.mp4');
    const concatListFile = path.join(projectDir, 'concat_list.txt');

    await LongformFFmpegService.concatenateSegments(segmentPaths, concatListFile, masterVideoPath);

    let actualDuration = 0;
    try {
      const meta = await FFmpegService.getVideoMetadata(masterVideoPath);
      actualDuration = meta.duration;
    } catch {}

    let storedVideoPath = path.relative(CONFIG.STORAGE_DIR, masterVideoPath).replace(/\\/g, '/');

    if (ObjectStorageService.isEnabled()) {
      try {
        storedVideoPath = await ObjectStorageService.uploadFile(
          masterVideoPath,
          `longform/${projectId}/master_longform.mp4`,
          'video/mp4'
        );
      } catch (s3Err: any) {
        console.warn('S3 upload warning on longform reRender:', s3Err.message);
      }
    }

    db.prepare(`
      UPDATE longform_projects
      SET status = 'completed', progress = 100, stage_message = 'Re-render completed successfully!',
          actual_duration = ?, video_path = ?, updated_at = ?
      WHERE id = ?
    `).run(actualDuration, storedVideoPath, new Date().toISOString(), projectId);

    this.addLog(projectId, 'success', `🏆 Re-rendered master video (${Math.round(actualDuration / 60)}m ${Math.round(actualDuration % 60)}s)!`);
  }
}
