import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, QueueRecord, ClipRecord, ChannelRecord } from '../db/index.js';
import { SchedulerService } from '../services/scheduler.js';

export const scheduleRouter = Router();

/**
 * GET /api/schedule - Get queue of scheduled, posting, posted, and failed clips
 */
scheduleRouter.get('/', (_req: Request, res: Response) => {
  try {
    const queue = db.prepare(`
      SELECT
        q.*,
        c.title as clip_title,
        c.virality_score,
        c.hook_line,
        c.thumbnail_path,
        c.video_path,
        ch.title as channel_title,
        ch.avatar_url as channel_avatar,
        ch.status as channel_status
      FROM schedule_queue q
      JOIN clips c ON q.clip_id = c.id
      JOIN channels ch ON q.channel_id = ch.id
      ORDER BY
        CASE q.status
          WHEN 'posting' THEN 1
          WHEN 'scheduled' THEN 2
          WHEN 'failed' THEN 3
          WHEN 'posted' THEN 4
        END,
        q.scheduled_time ASC
    `).all();

    res.json({ success: true, data: queue });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/schedule - Schedule a specific approved clip
 */
scheduleRouter.post('/', (req: Request, res: Response) => {
  const { clip_id, channel_id, scheduled_time } = req.body;

  if (!clip_id || !channel_id || !scheduled_time) {
    return res.status(400).json({ success: false, error: 'clip_id, channel_id, and scheduled_time are required' });
  }

  // Validate clip
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clip_id) as ClipRecord | undefined;
  if (!clip) return res.status(404).json({ success: false, error: 'Clip not found' });

  // Validate channel
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id) as ChannelRecord | undefined;
  if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });

  // Validate date
  const dateObj = new Date(scheduled_time);
  if (isNaN(dateObj.getTime())) {
    return res.status(400).json({ success: false, error: 'Invalid scheduled_time format' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    // Also mark clip as approved if it was draft
    db.prepare("UPDATE clips SET status = 'approved', updated_at = ? WHERE id = ?").run(now, clip_id);

    db.prepare(`
      INSERT INTO schedule_queue (id, clip_id, channel_id, scheduled_time, status, retry_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'scheduled', 0, ?, ?)
    `).run(id, clip_id, channel_id, dateObj.toISOString(), now, now);

    const created = db.prepare('SELECT * FROM schedule_queue WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/schedule/auto - Auto-schedule all approved clips (spread 1-2 per day)
 */
scheduleRouter.post('/auto', (req: Request, res: Response) => {
  const { channel_id, clips_per_day } = req.body;

  if (!channel_id) {
    return res.status(400).json({ success: false, error: 'channel_id is required' });
  }

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id);
  if (!channel) {
    return res.status(404).json({ success: false, error: 'Channel not found' });
  }

  try {
    const result = SchedulerService.autoScheduleApproved(channel_id, clips_per_day ? parseInt(clips_per_day, 10) : 2);
    res.json({
      success: true,
      message: `Auto-scheduled ${result.scheduledCount} approved clips.`,
      scheduledCount: result.scheduledCount
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/schedule/:id/retry - Immediately retry a failed upload
 */
scheduleRouter.post('/:id/retry', async (req: Request, res: Response) => {
  const id = req.params.id;

  try {
    const item = db.prepare(`
      SELECT q.*, c.video_path, c.thumbnail_path, c.title as clip_title, c.caption, c.hashtags
      FROM schedule_queue q
      JOIN clips c ON q.clip_id = c.id
      WHERE q.id = ?
    `).get(id) as (QueueRecord & {
      video_path: string;
      thumbnail_path: string | null;
      clip_title: string;
      caption: string | null;
      hashtags: string | null;
    }) | undefined;

    if (!item) {
      return res.status(404).json({ success: false, error: 'Queue item not found' });
    }

    // Reset retry count and schedule immediately
    const now = new Date().toISOString();
    db.prepare("UPDATE schedule_queue SET status = 'scheduled', scheduled_time = ?, retry_count = 0, error_message = null, updated_at = ? WHERE id = ?")
      .run(now, now, id);

    // Trigger process in background immediately
    setImmediate(() => {
      SchedulerService.processDuePosts().catch(console.error);
    });

    res.json({ success: true, message: 'Upload retry triggered.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/schedule/:id - Cancel/remove from queue
 */
scheduleRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM schedule_queue WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Queue item deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
