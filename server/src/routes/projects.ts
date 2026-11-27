import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, ProjectRecord, ClipRecord } from '../db/index.js';
import { PipelineService } from '../services/pipeline.js';
import { FFmpegService } from '../services/ffmpeg.js';
import { CONFIG } from '../config.js';
import fs from 'fs';
import path from 'path';

export const projectsRouter = Router();

/**
 * GET /api/projects - List all projects
 */
projectsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM clips WHERE project_id = p.id) as clip_count,
        (SELECT COUNT(*) FROM clips WHERE project_id = p.id AND status = 'approved') as approved_count
      FROM projects p
      ORDER BY p.created_at DESC
    `).all();

    res.json({ success: true, data: projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/projects/sync - Restore projects and clips from client vault (preserves data across container redeployments)
 */
projectsRouter.post('/sync', (req: Request, res: Response) => {
  const { projects, clips } = req.body;
  if (!Array.isArray(projects) || projects.length === 0) {
    return res.json({ success: true, synced: 0 });
  }

  const now = new Date().toISOString();
  let synced = 0;

  for (const p of projects) {
    if (!p.id || !p.youtube_url) continue;
    try {
      const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(p.id);
      if (!existing) {
        db.prepare(`
          INSERT INTO projects (id, youtube_url, title, duration, source_video_path, status, progress, stage_message, error_message, niche, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          p.id,
          p.youtube_url,
          p.title || null,
          p.duration || 0,
          p.source_video_path || null,
          p.status || 'completed',
          p.progress || 100,
          p.stage_message || '',
          p.error_message || null,
          p.niche || 'high_energy',
          p.created_at || now,
          p.updated_at || now
        );
        synced++;
      }
    } catch (err: any) {
      console.warn('Project sync error:', err.message);
    }
  }

  // Restore clips associated with these projects (including upgrading any dummy 'restored' placeholders)
  if (Array.isArray(clips) && clips.length > 0) {
    for (const c of clips) {
      if (!c.id || !c.project_id) continue;
      try {
        const existing = db.prepare('SELECT id, project_id, video_path FROM clips WHERE id = ?').get(c.id) as
          | { id: string; project_id: string; video_path: string | null }
          | undefined;

        if (!existing) {
          db.prepare(`
            INSERT INTO clips (
              id, project_id, title, caption, hashtags, hook_line, virality_score, reason,
              start_time, end_time, crop_offset_x, video_path, thumbnail_path, status,
              caption_preset, caption_active_color, caption_base_color, words_per_burst,
              assigned_channel_id, title_options, caption_options, layout, hook_overlay, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            c.id,
            c.project_id,
            c.title,
            c.caption || null,
            c.hashtags || null,
            c.hook_line || null,
            c.virality_score || 85,
            c.reason || null,
            c.start_time || 0,
            c.end_time || 30,
            c.crop_offset_x || 0,
            c.video_path || null,
            c.thumbnail_path || null,
            c.status || 'draft',
            c.caption_preset || 'hormozi_gold',
            c.caption_active_color || '#FFE600',
            c.caption_base_color || '#FFFFFF',
            c.words_per_burst || 2,
            c.assigned_channel_id || null,
            typeof c.title_options === 'string' ? c.title_options : JSON.stringify(c.title_options || [c.title]),
            typeof c.caption_options === 'string' ? c.caption_options : JSON.stringify(c.caption_options || [c.caption]),
            c.layout || 'blur_bg',
            c.hook_overlay !== undefined ? c.hook_overlay : 1,
            c.created_at || now,
            c.updated_at || now
          );
        } else if (existing.project_id === 'restored' || !existing.video_path) {
          // Upgrade dummy 'restored' clip created by /schedule/sync with full clip metadata
          db.prepare(`
            UPDATE clips SET
              project_id = ?, title = ?, caption = ?, hashtags = ?, hook_line = ?, virality_score = ?, reason = ?,
              start_time = ?, end_time = ?, crop_offset_x = ?, video_path = ?, thumbnail_path = ?,
              caption_preset = ?, caption_active_color = ?, caption_base_color = ?, words_per_burst = ?,
              assigned_channel_id = ?, title_options = ?, caption_options = ?, layout = ?, hook_overlay = ?, updated_at = ?
            WHERE id = ?
          `).run(
            c.project_id,
            c.title,
            c.caption || null,
            c.hashtags || null,
            c.hook_line || null,
            c.virality_score || 85,
            c.reason || null,
            c.start_time || 0,
            c.end_time || 30,
            c.crop_offset_x || 0,
            c.video_path || null,
            c.thumbnail_path || null,
            c.caption_preset || 'hormozi_gold',
            c.caption_active_color || '#FFE600',
            c.caption_base_color || '#FFFFFF',
            c.words_per_burst || 2,
            c.assigned_channel_id || null,
            typeof c.title_options === 'string' ? c.title_options : JSON.stringify(c.title_options || [c.title]),
            typeof c.caption_options === 'string' ? c.caption_options : JSON.stringify(c.caption_options || [c.caption]),
            c.layout || 'blur_bg',
            c.hook_overlay !== undefined ? c.hook_overlay : 1,
            now,
            c.id
          );
        }
      } catch (err: any) {
        console.warn('Clip sync warning:', err.message);
      }
    }
  }

  res.json({ success: true, synced });
});

/**
 * GET /api/projects/:id/logs - Get real-time terminal logs for project
 */
projectsRouter.get('/:id/logs', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  res.json({ success: true, data: PipelineService.getLogs(projectId) });
});

/**
 * POST /api/projects - Create a new project and kick off background processing
 */
projectsRouter.post('/', (req: Request, res: Response) => {
  const { youtubeUrl, niche } = req.body;

  if (!youtubeUrl || typeof youtubeUrl !== 'string' || !youtubeUrl.trim()) {
    return res.status(400).json({ success: false, error: 'youtubeUrl is required' });
  }

  // Verify YouTube or direct video URL
  const cleanUrl = youtubeUrl.trim();
  const isYouTube = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)/i.test(cleanUrl);
  const isDirectVideo = /\.(mp4|mov|webm)(\?.*)?$/i.test(cleanUrl) || /^https?:\/\/.*(storage|download|video|media).*/i.test(cleanUrl);
  if (!isYouTube && !isDirectVideo) {
    return res.status(400).json({ success: false, error: 'Please enter a valid YouTube video URL or direct video link' });
  }

  const projectId = uuidv4();
  const now = new Date().toISOString();
  const projectNiche = niche || 'high_energy';

  try {
    db.prepare(`
      INSERT INTO projects (id, youtube_url, niche, status, progress, stage_message, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 0, 'Project created. Initializing pipeline...', ?, ?)
    `).run(projectId, cleanUrl, projectNiche, now, now);

    // Launch pipeline in background asynchronously
    setImmediate(() => {
      PipelineService.runProjectPipeline(projectId).catch((err) => {
        console.error(`Background pipeline execution failed for ${projectId}:`, err);
      });
    });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord;
    res.status(201).json({ success: true, data: project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/projects/upload - Direct video file upload (.mp4, .mov, .webm)
 */
projectsRouter.post('/upload', async (req: Request, res: Response) => {
  const projectId = uuidv4();
  const projectDir = path.join(CONFIG.STORAGE_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const rawFilename = (req.query.filename as string) || `video_${Date.now()}.mp4`;
  const cleanFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetPath = path.join(projectDir, cleanFilename);

  const writeStream = fs.createWriteStream(targetPath);
  req.pipe(writeStream);

  writeStream.on('error', (err) => {
    console.error('Upload write error:', err);
    res.status(500).json({ success: false, error: err.message });
  });

  writeStream.on('finish', async () => {
    try {
      const now = new Date().toISOString();
      const meta = await FFmpegService.getVideoMetadata(targetPath).catch(() => ({ duration: 0 }));
      const title = path.basename(cleanFilename, path.extname(cleanFilename)).replace(/[_]+/g, ' ').trim();

      db.prepare(`
        INSERT INTO projects (id, youtube_url, title, duration, source_video_path, status, progress, stage_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, 'Video uploaded. Initializing pipeline...', ?, ?)
      `).run(projectId, `file://${cleanFilename}`, title || 'Uploaded Video', meta.duration || 0, targetPath, now, now);

      setImmediate(() => {
        PipelineService.runProjectPipeline(projectId).catch((err) => {
          console.error(`Background pipeline failed for uploaded video ${projectId}:`, err);
        });
      });

      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord;
      res.status(201).json({ success: true, data: project });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
});

/**
 * GET /api/projects/:id - Get project details with all clips
 */
projectsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord | undefined;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const clips = db.prepare(`
      SELECT
        c.*,
        ch.title as assigned_channel_title,
        ch.avatar_url as assigned_channel_avatar
      FROM clips c
      LEFT JOIN channels ch ON c.assigned_channel_id = ch.id
      WHERE c.project_id = ?
      ORDER BY c.virality_score DESC, c.start_time ASC
    `).all(projectId) as ClipRecord[];

    res.json({
      success: true,
      data: {
        ...project,
        clips
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/projects/:id/progress - Server-Sent Events (SSE) for live pipeline progress
 */
projectsRouter.get('/:id/progress', (req: Request, res: Response) => {
  const projectId = String(req.params.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord | undefined;
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({
    projectId: project.id,
    status: project.status,
    progress: project.progress,
    stageMessage: project.stage_message,
    errorMessage: project.error_message
  })}\n\n`);

  // Subscribe to real-time events
  const unsubscribe = PipelineService.subscribeProgress(projectId, (update) => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
    if (update.status === 'completed' || update.status === 'failed') {
      // Completed or failed
    }
  });

  req.on('close', () => {
    unsubscribe();
  });
});

/**
 * POST /api/projects/:id/retry - Retry pipeline execution for a failed project
 */
projectsRouter.post('/:id/retry', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord | undefined;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    db.prepare(`
      UPDATE projects
      SET status = 'pending', progress = 0, stage_message = 'Retrying pipeline...', error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), projectId);

    setImmediate(() => {
      PipelineService.runProjectPipeline(projectId).catch((err) => {
        console.error(`Retry pipeline execution failed for ${projectId}:`, err);
      });
    });

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord;
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/projects/:id - Delete project and its files
 */
projectsRouter.delete('/:id', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRecord | undefined;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Delete DB entries (foreign keys cascade will remove clips & queue)
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    // Delete project storage folder
    if (project.source_video_path) {
      const projectDir = path.dirname(project.source_video_path);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    }

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
