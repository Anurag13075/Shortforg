import { Router, Request, Response } from 'express';
import { db, ChannelRecord } from '../db/index.js';

export const channelsRouter = Router();

/**
 * GET /api/channels - List all connected YouTube channels
 */
channelsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const channels = db.prepare(`
      SELECT c.id, c.title, c.avatar_url, c.refresh_token, c.access_token, c.token_expiry, c.status, c.created_at, c.updated_at,
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
 * POST /api/channels/sync - Restore channels from client vault (preserves accounts across all redeployments)
 */
channelsRouter.post('/sync', (req: Request, res: Response) => {
  const { channels } = req.body;
  if (!Array.isArray(channels) || channels.length === 0) {
    return res.json({ success: true, synced: 0 });
  }

  const now = new Date().toISOString();
  let synced = 0;

  for (const ch of channels) {
    if (!ch.id || !ch.title) continue;
    try {
      const existing = db.prepare('SELECT id FROM channels WHERE id = ?').get(ch.id);
      if (existing) {
        db.prepare(`
          UPDATE channels
          SET title = ?, avatar_url = COALESCE(?, avatar_url),
              refresh_token = COALESCE(?, refresh_token),
              access_token = COALESCE(?, access_token),
              token_expiry = COALESCE(?, token_expiry),
              status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          ch.title,
          ch.avatar_url || null,
          ch.refresh_token || null,
          ch.access_token || null,
          ch.token_expiry || null,
          ch.status || 'active',
          now,
          ch.id
        );
      } else {
        db.prepare(`
          INSERT INTO channels (id, title, avatar_url, refresh_token, access_token, token_expiry, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ch.id,
          ch.title,
          ch.avatar_url || null,
          ch.refresh_token || '',
          ch.access_token || null,
          ch.token_expiry || null,
          ch.status || 'active',
          ch.created_at || now,
          now
        );
      }
      synced++;
    } catch (err: any) {
      console.warn('Channel sync error:', err.message);
    }
  }

  res.json({ success: true, synced });
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
