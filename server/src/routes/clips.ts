import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db, ClipRecord, ChannelRecord } from '../db/index.js';
import { PipelineService } from '../services/pipeline.js';

export const clipsRouter = Router();

/**
 * GET /api/clips - List all clips across projects with optional filters (?status=approved&project_id=...)
 */
clipsRouter.get('/', (req: Request, res: Response) => {
  try {
    const { status, project_id } = req.query;
    let query = `
      SELECT
        c.*,
        p.title as project_title,
        ch.title as assigned_channel_title,
        ch.avatar_url as assigned_channel_avatar
      FROM clips c
      JOIN projects p ON c.project_id = p.id
      LEFT JOIN channels ch ON c.assigned_channel_id = ch.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && typeof status === 'string' && status !== 'all') {
      query += ' AND c.status = ? ';
      params.push(status);
    }
    if (project_id && typeof project_id === 'string' && project_id !== 'all') {
      query += ' AND c.project_id = ? ';
      params.push(project_id);
    }

    query += ' ORDER BY c.virality_score DESC, c.created_at DESC ';

    const clips = db.prepare(query).all(...params);
    res.json({ success: true, data: clips });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/clips/:id - Get clip details
 */
clipsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const clip = db.prepare(`
      SELECT c.*, ch.title as assigned_channel_title, ch.avatar_url as assigned_channel_avatar
      FROM clips c
      LEFT JOIN channels ch ON c.assigned_channel_id = ch.id
      WHERE c.id = ?
    `).get(req.params.id) as ClipRecord | undefined;
    if (!clip) return res.status(404).json({ success: false, error: 'Clip not found' });
    res.json({ success: true, data: clip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/clips/:id - Update clip metadata, status (approve/reject/draft), crop offset, or assigned channel
 */
clipsRouter.patch('/:id', (req: Request, res: Response) => {
  const { title, caption, hashtags, status, crop_offset_x, assigned_channel_id } = req.body;
  const clipId = req.params.id;

  try {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord | undefined;
    if (!clip) return res.status(404).json({ success: false, error: 'Clip not found' });

    const newTitle = title !== undefined ? String(title).trim().substring(0, 100) : clip.title;
    const newCaption = caption !== undefined ? String(caption) : clip.caption;
    const newHashtags = hashtags !== undefined
      ? (typeof hashtags === 'string' ? hashtags : JSON.stringify(hashtags))
      : clip.hashtags;
    const newStatus = status !== undefined ? status : clip.status;
    const newOffset = crop_offset_x !== undefined ? parseFloat(crop_offset_x) : clip.crop_offset_x;
    const newChannelId = assigned_channel_id !== undefined ? assigned_channel_id : clip.assigned_channel_id;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE clips
      SET title = ?, caption = ?, hashtags = ?, status = ?, crop_offset_x = ?, assigned_channel_id = ?, updated_at = ?
      WHERE id = ?
    `).run(newTitle, newCaption, newHashtags, newStatus, newOffset, newChannelId, now, clipId);

    const updated = db.prepare(`
      SELECT c.*, ch.title as assigned_channel_title, ch.avatar_url as assigned_channel_avatar
      FROM clips c
      LEFT JOIN channels ch ON c.assigned_channel_id = ch.id
      WHERE c.id = ?
    `).get(clipId) as ClipRecord;
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/clips/:id/schedule - 1-Click schedule a clip to a specific channel
 */
clipsRouter.post('/:id/schedule', (req: Request, res: Response) => {
  const { channel_id, scheduled_time } = req.body;
  const clipId = String(req.params.id);

  if (!channel_id) {
    return res.status(400).json({ success: false, error: 'channel_id is required' });
  }

  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord | undefined;
  if (!clip) return res.status(404).json({ success: false, error: 'Clip not found' });

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id) as ChannelRecord | undefined;
  if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });

  // Default to tomorrow 10:00 AM if no time provided
  let targetTime = scheduled_time ? new Date(scheduled_time) : null;
  if (!targetTime || isNaN(targetTime.getTime())) {
    targetTime = new Date();
    targetTime.setDate(targetTime.getDate() + 1);
    targetTime.setHours(10, 0, 0, 0);
  }

  const now = new Date().toISOString();
  const queueId = uuidv4();

  try {
    // 1. Mark clip as approved and assign channel
    db.prepare("UPDATE clips SET status = 'approved', assigned_channel_id = ?, updated_at = ? WHERE id = ?")
      .run(channel_id, now, clipId);

    // 2. Insert into schedule_queue
    db.prepare(`
      INSERT INTO schedule_queue (id, clip_id, channel_id, scheduled_time, status, retry_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'scheduled', 0, ?, ?)
    `).run(queueId, clipId, channel_id, targetTime.toISOString(), now, now);

    const created = db.prepare(`
      SELECT q.*, c.title as clip_title, ch.title as channel_title
      FROM schedule_queue q
      JOIN clips c ON q.clip_id = c.id
      JOIN channels ch ON q.channel_id = ch.id
      WHERE q.id = ?
    `).get(queueId);

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/clips/:id/render - Trigger re-render of clip after editing crop offset or hook
 */
clipsRouter.post('/:id/render', async (req: Request, res: Response) => {
  const clipId = String(req.params.id);
  const { crop_offset_x } = req.body;

  try {
    const offset = crop_offset_x !== undefined ? parseFloat(crop_offset_x) : undefined;
    const updatedClip = await PipelineService.reRenderClip(clipId, offset);
    res.json({ success: true, data: updatedClip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/clips/:id/video - Stream MP4 video with range request support for video scrubbing
 */
clipsRouter.get('/:id/video', (req: Request, res: Response) => {
  try {
    const clip = db.prepare('SELECT video_path FROM clips WHERE id = ?').get(req.params.id) as { video_path: string } | undefined;
    if (!clip || !clip.video_path || !fs.existsSync(clip.video_path)) {
      return res.status(404).json({ success: false, error: 'Video file not ready or missing' });
    }

    const videoPath = clip.video_path;
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/clips/:id/thumbnail - Serve generated thumbnail image
 */
clipsRouter.get('/:id/thumbnail', (req: Request, res: Response) => {
  try {
    const clip = db.prepare('SELECT thumbnail_path FROM clips WHERE id = ?').get(req.params.id) as { thumbnail_path: string } | undefined;
    if (!clip || !clip.thumbnail_path || !fs.existsSync(clip.thumbnail_path)) {
      return res.status(404).send('Thumbnail not found');
    }

    res.setHeader('Content-Type', 'image/jpeg');
    fs.createReadStream(clip.thumbnail_path).pipe(res);
  } catch (err: any) {
    res.status(500).send('Error loading thumbnail');
  }
});

/**
 * GET /api/clips/:id/download - Force file download of finished Short
 */
clipsRouter.get('/:id/download', (req: Request, res: Response) => {
  try {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id) as ClipRecord | undefined;
    if (!clip || !clip.video_path || !fs.existsSync(clip.video_path)) {
      return res.status(404).json({ success: false, error: 'Video file not available for download' });
    }

    const cleanFilename = `${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_ShortsForge.mp4`;
    res.download(clip.video_path, cleanFilename);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
