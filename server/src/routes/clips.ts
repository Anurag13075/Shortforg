import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db, ClipRecord, ChannelRecord } from '../db/index.js';
import { PipelineService } from '../services/pipeline.js';
import { regenerateClipMetadata } from '../services/momentPicker.js';
import { CONFIG } from '../config.js';

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
  const {
    title,
    caption,
    hashtags,
    status,
    crop_offset_x,
    start_time,
    end_time,
    layout,
    hook_overlay,
    title_options,
    caption_options,
    assigned_channel_id,
    caption_preset,
    caption_active_color,
    caption_base_color,
    words_per_burst
  } = req.body;
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
    const newStartTime = start_time !== undefined ? parseFloat(start_time) : clip.start_time;
    const newEndTime = end_time !== undefined ? parseFloat(end_time) : clip.end_time;
    const newLayout = layout !== undefined ? layout : (clip.layout || 'blur_bg');
    const newHookOverlay = hook_overlay !== undefined ? (hook_overlay ? 1 : 0) : (clip.hook_overlay ?? 1);
    const newTitleOptions = title_options !== undefined
      ? (typeof title_options === 'string' ? title_options : JSON.stringify(title_options))
      : clip.title_options;
    const newCaptionOptions = caption_options !== undefined
      ? (typeof caption_options === 'string' ? caption_options : JSON.stringify(caption_options))
      : clip.caption_options;

    const newChannelId = assigned_channel_id !== undefined ? assigned_channel_id : clip.assigned_channel_id;
    const newPreset = caption_preset !== undefined ? String(caption_preset) : (clip.caption_preset || 'hormozi_gold');
    const newActiveColor = caption_active_color !== undefined ? String(caption_active_color) : (clip.caption_active_color || '#FFE600');
    const newBaseColor = caption_base_color !== undefined ? String(caption_base_color) : (clip.caption_base_color || '#FFFFFF');
    const newBurst = words_per_burst !== undefined ? parseInt(String(words_per_burst), 10) : (clip.words_per_burst || 2);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE clips
      SET title = ?, caption = ?, hashtags = ?, status = ?, crop_offset_x = ?, start_time = ?, end_time = ?,
          layout = ?, hook_overlay = ?, title_options = ?, caption_options = ?, assigned_channel_id = ?,
          caption_preset = ?, caption_active_color = ?, caption_base_color = ?, words_per_burst = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newTitle, newCaption, newHashtags, newStatus, newOffset, newStartTime, newEndTime,
      newLayout, newHookOverlay, newTitleOptions, newCaptionOptions, newChannelId,
      newPreset, newActiveColor, newBaseColor, newBurst, now, clipId
    );

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
 * POST /api/clips/:id/render - Trigger re-render of clip after editing crop offset, trim, layout or captions
 */
clipsRouter.post('/:id/render', async (req: Request, res: Response) => {
  const clipId = String(req.params.id);
  const {
    crop_offset_x,
    start_time,
    end_time,
    layout,
    hook_overlay,
    caption_preset,
    caption_active_color,
    caption_base_color,
    words_per_burst
  } = req.body;

  try {
    const updatedClip = await PipelineService.reRenderClip(clipId, {
      cropOffsetX: crop_offset_x !== undefined ? parseFloat(crop_offset_x) : undefined,
      startTime: start_time !== undefined ? parseFloat(start_time) : undefined,
      endTime: end_time !== undefined ? parseFloat(end_time) : undefined,
      layout,
      hookOverlay: hook_overlay !== undefined ? Boolean(hook_overlay) : undefined,
      captionPreset: caption_preset,
      captionActiveColor: caption_active_color,
      captionBaseColor: caption_base_color,
      wordsPerBurst: words_per_burst !== undefined ? parseInt(String(words_per_burst), 10) : undefined
    });
    res.json({ success: true, data: updatedClip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/clips/:id/regenerate-metadata - AI regenerate title, hook, and description strictly matching the exact spoken dialogue
 */
clipsRouter.post('/:id/regenerate-metadata', async (req: Request, res: Response) => {
  const clipId = String(req.params.id);

  try {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord | undefined;
    if (!clip) return res.status(404).json({ success: false, error: 'Clip not found' });

    // Look for transcript.json in project storage directory
    const projectDir = path.join(CONFIG.STORAGE_DIR, clip.project_id);
    const transcriptPath = path.join(projectDir, 'transcript.json');

    let transcriptSliceText = '';
    if (fs.existsSync(transcriptPath)) {
      try {
        const transData = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
        if (Array.isArray(transData.words)) {
          const matchingWords = transData.words.filter(
            (w: any) => w.end >= clip.start_time && w.start <= clip.end_time
          );
          transcriptSliceText = matchingWords.map((w: any) => w.word).join(' ');
        }
      } catch (err: any) {
        console.warn('Could not parse transcript.json for clip:', err.message);
      }
    }

    if (!transcriptSliceText && clip.caption) {
      transcriptSliceText = clip.caption;
    }

    if (!transcriptSliceText) {
      transcriptSliceText = clip.title;
    }

    const newMetadata = await regenerateClipMetadata(transcriptSliceText);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE clips
      SET title = ?, hook_line = ?, caption = ?, hashtags = ?, title_options = ?, caption_options = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newMetadata.title,
      newMetadata.hook_line,
      newMetadata.caption,
      JSON.stringify(newMetadata.hashtags),
      JSON.stringify(newMetadata.title_options),
      JSON.stringify(newMetadata.caption_options),
      now,
      clipId
    );

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
      const file = fs.createReadStream(videoPath, { start, end });
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
      const file = fs.createReadStream(videoPath);
      file.pipe(res);
      file.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      res.on('close', () => file.destroy());
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
 * DELETE /api/clips/:id - Delete a single clip and remove its files
 */
clipsRouter.delete('/:id', (req: Request, res: Response) => {
  const clipId = String(req.params.id);
  try {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as ClipRecord | undefined;
    if (!clip) return res.status(404).json({ success: false, error: 'Clip not found' });

    if (clip.video_path && fs.existsSync(clip.video_path)) {
      try { fs.unlinkSync(clip.video_path); } catch {}
    }
    if (clip.thumbnail_path && fs.existsSync(clip.thumbnail_path)) {
      try { fs.unlinkSync(clip.thumbnail_path); } catch {}
    }

    db.prepare('DELETE FROM clips WHERE id = ?').run(clipId);
    res.json({ success: true, message: 'Clip deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
