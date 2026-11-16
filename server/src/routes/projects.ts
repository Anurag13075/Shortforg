import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, ProjectRecord, ClipRecord } from '../db/index.js';
import { PipelineService } from '../services/pipeline.js';
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
 * POST /api/projects/sync - Restore projects from client vault (preserves projects across container redeployments)
 */
projectsRouter.post('/sync', (req: Request, res: Response) => {
  const { projects } = req.body;
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
          INSERT INTO projects (id, youtube_url, title, duration, source_video_path, status, progress, stage_message, error_message, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          p.id,
          p.youtube_url,
          p.title || null,
          p.duration || 0,
          p.source_video_path || null,
          p.status || 'failed',
          p.progress || 0,
          p.stage_message || '',
          p.error_message || null,
          p.created_at || now,
          p.updated_at || now
        );
        synced++;
      }
    } catch (err: any) {
      console.warn('Project sync error:', err.message);
    }
  }

  res.json({ success: true, synced });
});

/**
 * POST /api/projects - Create a new project and kick off background processing
 */
projectsRouter.post('/', (req: Request, res: Response) => {
  const { youtubeUrl } = req.body;

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

  try {
    db.prepare(`
      INSERT INTO projects (id, youtube_url, status, progress, stage_message, created_at, updated_at)
      VALUES (?, ?, 'pending', 0, 'Project created. Initializing pipeline...', ?, ?)
    `).run(projectId, cleanUrl, now, now);

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
