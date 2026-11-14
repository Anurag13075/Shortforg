import { Router, Request, Response } from 'express';
import { db, ChannelRecord } from '../db/index.js';

export const channelsRouter = Router();

/**
 * GET /api/channels - List all connected YouTube channels
 */
channelsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const channels = db.prepare(`
      SELECT c.id, c.title, c.avatar_url, c.status, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM schedule_queue WHERE channel_id = c.id AND status = 'posted') as total_posted,
        (SELECT COUNT(*) FROM schedule_queue WHERE channel_id = c.id AND status = 'scheduled') as total_scheduled
      FROM channels c
      ORDER BY c.created_at DESC
    `).all();

    res.json({ success: true, data: channels });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/channels/:id - Remove/disconnect a channel
 */
channelsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id) as ChannelRecord | undefined;
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: `Disconnected channel "${channel.title}"` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
