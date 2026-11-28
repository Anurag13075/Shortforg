import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config.js';
import { db, LongformProjectRecord, LongformChapter, ChannelRecord } from '../db/index.js';
import { LongformPipelineService } from '../services/longformPipeline.js';
import { SchedulerService } from '../services/scheduler.js';
import { ObjectStorageService } from '../services/objectStorage.js';

export const longformRouter = Router();

/**
 * GET /api/longform - List all longform projects
 */
longformRouter.get('/', (_req: Request, res: Response) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, ch.title as channel_title, ch.avatar_url as channel_avatar
      FROM longform_projects p
      LEFT JOIN channels ch ON p.assigned_channel_id = ch.id
      ORDER BY p.created_at DESC
    `).all() as any[];

    // Parse chapters JSON for preview count
    const enriched = projects.map((p) => {
      let chapterCount = 0;
      try {
        const parsed = JSON.parse(p.chapters || '[]');
        chapterCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {}
      return {
        ...p,
        chapter_count: chapterCount
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/longform/sync - Restore projects from client localStorage vault
 */
longformRouter.post('/sync', (req: Request, res: Response) => {
  const { projects } = req.body;
  if (!Array.isArray(projects)) {
    return res.status(400).json({ success: false, error: 'projects array required' });
  }

  let synced = 0;
  const now = new Date().toISOString();

  for (const p of projects) {
    try {
      const existing = db.prepare('SELECT id FROM longform_projects WHERE id = ?').get(p.id);
      if (!existing && p.id && p.topic) {
        db.prepare(`
          INSERT INTO longform_projects (
            id, title, topic, source_urls, target_duration, actual_duration,
            status, progress, stage_message, error_message, chapters,
            script_outline, video_path, thumbnail_path, assigned_channel_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          p.id,
          p.title || p.topic,
          p.topic,
          typeof p.source_urls === 'string' ? p.source_urls : JSON.stringify(p.source_urls || []),
          p.target_duration || 600,
          p.actual_duration || 0,
          p.status || 'completed',
          p.progress || 100,
          p.stage_message || '',
          p.error_message || null,
          typeof p.chapters === 'string' ? p.chapters : JSON.stringify(p.chapters || []),
          p.script_outline || null,
          p.video_path || null,
          p.thumbnail_path || null,
          p.assigned_channel_id || null,
          p.created_at || now,
          p.updated_at || now
        );
        synced++;
      }
    } catch (err: any) {
      console.warn('Longform project sync error:', err.message);
    }
  }

  res.json({ success: true, synced });
});

/**
 * POST /api/longform - Create new longform project & launch pipeline
 */
longformRouter.post('/', (req: Request, res: Response) => {
  const { topic, sourceUrls, targetDuration } = req.body;

  const cleanTopic = typeof topic === 'string' && topic.trim() ? topic.trim() : 'Auto-Synthesized Documentary';

  if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) {
    return res.status(400).json({ success: false, error: 'At least 1-2 source video URLs are required' });
  }

  const cleanUrls = sourceUrls
    .map((u: any) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u: string) => u.length > 0);

  if (cleanUrls.length === 0) {
    return res.status(400).json({ success: false, error: 'Valid YouTube URLs required' });
  }

  const projectId = uuidv4();
  const now = new Date().toISOString();
  const durationSec = Math.max(300, Math.min(1800, Number(targetDuration) || 600));

  try {
    db.prepare(`
      INSERT INTO longform_projects (
        id, topic, title, source_urls, target_duration, actual_duration,
        status, progress, stage_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 'pending', 0, 'Project created. Initializing Long-Form Studio Engine...', ?, ?)
    `).run(projectId, cleanTopic, cleanTopic, JSON.stringify(cleanUrls), durationSec, now, now);

    // Launch background pipeline
    setImmediate(() => {
      LongformPipelineService.runPipeline(projectId).catch((err) => {
        console.error(`Long-Form pipeline failed for ${projectId}:`, err);
      });
    });

    const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord;
    res.status(201).json({ success: true, data: project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/longform/:id - Get project details
 */
longformRouter.get('/:id', (req: Request, res: Response) => {
  const projectId = String(req.params.id);

  try {
    const project = db.prepare(`
      SELECT p.*, ch.title as channel_title, ch.avatar_url as channel_avatar
      FROM longform_projects p
      LEFT JOIN channels ch ON p.assigned_channel_id = ch.id
      WHERE p.id = ?
    `).get(projectId) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Long-form project not found' });
    }

    let chapters: LongformChapter[] = [];
    try {
      chapters = JSON.parse(project.chapters || '[]');
    } catch {}

    let sourceUrls: string[] = [];
    try {
      sourceUrls = JSON.parse(project.source_urls || '[]');
    } catch {}

    res.json({
      success: true,
      data: {
        ...project,
        chapters,
        source_urls: sourceUrls
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/longform/:id/logs - Get pipeline logs
 */
longformRouter.get('/:id/logs', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  res.json({ success: true, data: LongformPipelineService.getLogs(projectId) });
});

/**
 * GET /api/longform/:id/progress - SSE stream for live progress
 */
longformRouter.get('/:id/progress', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({
    projectId: project.id,
    status: project.status,
    progress: project.progress,
    stageMessage: project.stage_message,
    errorMessage: project.error_message
  })}\n\n`);

  const unsubscribe = LongformPipelineService.subscribeProgress(projectId, (update) => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

/**
 * POST /api/longform/:id/retry - Retry failed pipeline
 */
longformRouter.post('/:id/retry', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;

  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  db.prepare(`
    UPDATE longform_projects
    SET status = 'pending', progress = 0, stage_message = 'Retrying synthesis pipeline...', error_message = NULL, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), projectId);

  setImmediate(() => {
    LongformPipelineService.runPipeline(projectId).catch((err) => {
      console.error(`Retry failed for longform project ${projectId}:`, err);
    });
  });

  const updated = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId);
  res.json({ success: true, data: updated });
});

/**
 * POST /api/longform/:id/render - Re-render video with modified chapter timeline
 */
longformRouter.post('/:id/render', async (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  const { chapters } = req.body;

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ success: false, error: 'chapters array is required' });
  }

  try {
    setImmediate(() => {
      LongformPipelineService.reRenderProject(projectId, chapters).catch((err) => {
        console.error(`Re-render failed for longform project ${projectId}:`, err);
      });
    });

    res.json({ success: true, message: 'Re-render started in background' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/longform/:id - Delete project & storage files
 */
longformRouter.delete('/:id', (req: Request, res: Response) => {
  const projectId = String(req.params.id);

  try {
    const project = db.prepare('SELECT id FROM longform_projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    db.prepare('DELETE FROM longform_projects WHERE id = ?').run(projectId);

    // Delete local folder & S3 objects
    const projectDir = path.join(CONFIG.STORAGE_DIR, `longform_${projectId}`);
    if (fs.existsSync(projectDir)) {
      try {
        fs.rmSync(projectDir, { recursive: true, force: true });
      } catch (e: any) {
        console.warn('Failed to delete project folder:', e.message);
      }
    }
    ObjectStorageService.deletePrefix(`longform/${projectId}/`).catch(() => {});

    res.json({ success: true, message: 'Longform project deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/longform/:id/video - Video streaming with HTTP Range requests
 */
longformRouter.get('/:id/video', async (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT video_path FROM longform_projects WHERE id = ?').get(req.params.id) as { video_path: string } | undefined;
    if (!project || !project.video_path) {
      return res.status(404).json({ success: false, error: 'Video file not ready' });
    }

    if (ObjectStorageService.isS3Uri(project.video_path)) {
      await ObjectStorageService.streamVideoToResponse(project.video_path, req, res);
      return;
    }

    const fullPath = path.isAbsolute(project.video_path)
      ? project.video_path
      : path.join(CONFIG.STORAGE_DIR, project.video_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'Video file missing from storage' });
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(fullPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache'
      });

      file.pipe(res);
      file.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      res.on('close', () => file.destroy());
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });
      const file = fs.createReadStream(fullPath);
      file.pipe(res);
      file.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      res.on('close', () => file.destroy());
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/longform/:id/thumbnail - Serve 16:9 thumbnail
 */
longformRouter.get('/:id/thumbnail', async (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT thumbnail_path FROM longform_projects WHERE id = ?').get(req.params.id) as { thumbnail_path: string } | undefined;
    if (!project || !project.thumbnail_path) {
      return res.status(404).json({ success: false, error: 'Thumbnail not ready' });
    }

    if (ObjectStorageService.isS3Uri(project.thumbnail_path)) {
      await ObjectStorageService.streamImageToResponse(project.thumbnail_path, res);
      return;
    }

    const fullPath = path.isAbsolute(project.thumbnail_path)
      ? project.thumbnail_path
      : path.join(CONFIG.STORAGE_DIR, project.thumbnail_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'Thumbnail not found on disk' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(fullPath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/longform/:id/download - Force download attachment
 */
longformRouter.all('/:id/download', async (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT title, video_path FROM longform_projects WHERE id = ?').get(req.params.id) as any;
    if (!project || !project.video_path) {
      return res.status(404).json({ success: false, error: 'Video not ready' });
    }

    const safeTitle = (project.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

    if (ObjectStorageService.isS3Uri(project.video_path)) {
      await ObjectStorageService.streamVideoToResponse(project.video_path, req, res, `${safeTitle}_1080p.mp4`);
      return;
    }

    const fullPath = path.isAbsolute(project.video_path)
      ? project.video_path
      : path.join(CONFIG.STORAGE_DIR, project.video_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'Video missing' });
    }

    if (req.method === 'HEAD') {
      const stat = fs.statSync(fullPath);
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
      res.end();
      return;
    }

    res.download(fullPath, `${safeTitle}_1080p.mp4`);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/longform/:id/metadata - Update custom YouTube title and description
 */
longformRouter.patch('/:id/metadata', (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  const { title, description } = req.body;

  try {
    const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const nextTitle = typeof title === 'string' && title.trim() ? title.trim() : project.title;
    const nextDescription = typeof description === 'string' ? description : project.description ?? null;

    db.prepare(`
      UPDATE longform_projects
      SET title = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(nextTitle, nextDescription, new Date().toISOString(), projectId);

    const updated = db.prepare(`
      SELECT p.*, ch.title as channel_title, ch.avatar_url as channel_avatar
      FROM longform_projects p
      LEFT JOIN channels ch ON p.assigned_channel_id = ch.id
      WHERE p.id = ?
    `).get(projectId) as any;

    res.json({ success: true, data: updated, message: 'Title & description saved!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/longform/:id/thumbnail - Upload a custom 16:9 thumbnail image (base64 data URL)
 */
longformRouter.post('/:id/thumbnail', async (req: Request, res: Response) => {
  const projectId = String(req.params.id);
  const { imageDataUrl } = req.body;

  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return res.status(400).json({ success: false, error: 'imageDataUrl is required' });
  }

  const match = imageDataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    return res.status(400).json({ success: false, error: 'Invalid image format. Please upload a PNG, JPG, or WebP image.' });
  }

  try {
    const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const mimeType = match[1].toLowerCase();
    const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
    const buffer = Buffer.from(match[3], 'base64');

    const projectDir = path.join(CONFIG.STORAGE_DIR, `longform_${projectId}`);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const localThumbPath = path.join(projectDir, `custom_thumbnail.${ext}`);
    fs.writeFileSync(localThumbPath, buffer);

    let storedThumbPath = path.relative(CONFIG.STORAGE_DIR, localThumbPath).replace(/\\/g, '/');
    if (ObjectStorageService.isEnabled()) {
      storedThumbPath = await ObjectStorageService.uploadFile(
        localThumbPath,
        `longform/${projectId}/custom_thumbnail_${Date.now()}.${ext}`,
        mimeType
      );
    }

    db.prepare(`
      UPDATE longform_projects
      SET thumbnail_path = ?, updated_at = ?
      WHERE id = ?
    `).run(storedThumbPath, new Date().toISOString(), projectId);

    const updated = db.prepare(`
      SELECT p.*, ch.title as channel_title, ch.avatar_url as channel_avatar
      FROM longform_projects p
      LEFT JOIN channels ch ON p.assigned_channel_id = ch.id
      WHERE p.id = ?
    `).get(projectId) as any;

    res.json({ success: true, data: updated, message: 'Custom thumbnail uploaded!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/longform/:id/assign-channel - Assign YouTube channel
 */
longformRouter.post('/:id/assign-channel', (req: Request, res: Response) => {
  const { channel_id } = req.body;
  const projectId = String(req.params.id);

  try {
    const channel = channel_id ? db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id) : null;
    db.prepare('UPDATE longform_projects SET assigned_channel_id = ?, updated_at = ? WHERE id = ?')
      .run(channel ? channel_id : null, new Date().toISOString(), projectId);

    res.json({ success: true, message: 'Channel assigned successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/longform/:id/schedule - Schedule or immediately publish a long-form video to YouTube
 */
longformRouter.post('/:id/schedule', (req: Request, res: Response) => {
  const { channel_id, scheduled_time, publish_now } = req.body;
  const projectId = String(req.params.id);

  if (!channel_id) {
    return res.status(400).json({ success: false, error: 'Target YouTube channel_id is required' });
  }

  const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  if (project.status !== 'completed' || !project.video_path) {
    return res.status(400).json({ success: false, error: 'Video is still processing or missing. Only completed videos can be scheduled.' });
  }

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id) as ChannelRecord | undefined;
  if (!channel) {
    return res.status(404).json({ success: false, error: 'YouTube channel not found in database' });
  }

  try {
    const now = new Date().toISOString();
    let targetTime = scheduled_time;

    if (publish_now) {
      targetTime = now;
    } else if (!targetTime) {
      // Default to tomorrow 6:00 PM IST
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      targetTime = tomorrow.toISOString();
    }

    db.prepare(`
      UPDATE longform_projects
      SET assigned_channel_id = ?,
          scheduled_time = ?,
          schedule_status = 'scheduled',
          updated_at = ?
      WHERE id = ?
    `).run(channel_id, targetTime, now, projectId);

    if (publish_now) {
      setImmediate(() => {
        SchedulerService.processDueLongformPosts().catch((err) => {
          console.error(`Immediate publish failed for longform project ${projectId}:`, err);
        });
      });
    }

    const updated = db.prepare(`
      SELECT p.*, ch.title as channel_title, ch.avatar_url as channel_avatar
      FROM longform_projects p
      LEFT JOIN channels ch ON p.assigned_channel_id = ch.id
      WHERE p.id = ?
    `).get(projectId) as any;

    res.json({
      success: true,
      data: updated,
      message: publish_now ? 'Video upload started immediately!' : `Scheduled for ${new Date(targetTime).toLocaleString('en-IN')}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/longform/:id/cancel-schedule - Cancel a scheduled upload
 */
longformRouter.post('/:id/cancel-schedule', (req: Request, res: Response) => {
  const projectId = String(req.params.id);

  try {
    const project = db.prepare('SELECT * FROM longform_projects WHERE id = ?').get(projectId) as LongformProjectRecord | undefined;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (project.schedule_status === 'posting') {
      return res.status(400).json({ success: false, error: 'Upload is already in progress and cannot be cancelled.' });
    }

    db.prepare(`
      UPDATE longform_projects
      SET schedule_status = 'none',
          scheduled_time = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), projectId);

    const updated = db.prepare(`
      SELECT p.*, ch.title as channel_title, ch.avatar_url as channel_avatar
      FROM longform_projects p
      LEFT JOIN channels ch ON p.assigned_channel_id = ch.id
      WHERE p.id = ?
    `).get(projectId) as any;

    res.json({ success: true, data: updated, message: 'Scheduled upload cancelled' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
