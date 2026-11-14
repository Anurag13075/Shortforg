import cron from 'node-cron';
import { db, QueueRecord, ClipRecord } from '../db/index.js';
import { YouTubeService } from './youtube.js';
import { v4 as uuidv4 } from 'uuid';

export class SchedulerService {
  private static isRunning = false;

  /**
   * Start the 1-minute cron worker for YouTube Shorts auto-posting
   */
  static startScheduler() {
    // Run every minute: * * * * *
    cron.schedule('* * * * *', async () => {
      if (this.isRunning) return;
      this.isRunning = true;
      try {
        await this.processDuePosts();
      } catch (err: any) {
        console.error('Error in scheduler job:', err.message);
      } finally {
        this.isRunning = false;
      }
    });

    console.log('⏰ ShortsForge YouTube upload scheduler active (every 1 min).');
  }

  /**
   * Process all clips currently due for publication
   */
  static async processDuePosts() {
    const nowIso = new Date().toISOString();

    // Query pending posts that are due
    const dueItems = db.prepare(`
      SELECT q.*, c.video_path, c.thumbnail_path, c.title as clip_title, c.caption, c.hashtags
      FROM schedule_queue q
      JOIN clips c ON q.clip_id = c.id
      WHERE q.status = 'scheduled' AND q.scheduled_time <= ?
      ORDER BY q.scheduled_time ASC
      LIMIT 5
    `).all(nowIso) as (QueueRecord & {
      video_path: string;
      thumbnail_path: string | null;
      clip_title: string;
      caption: string | null;
      hashtags: string | null;
    })[];

    for (const item of dueItems) {
      await this.uploadQueueItem(item);
    }
  }

  /**
   * Upload an individual queue item with retry logic (up to 3 times)
   */
  static async uploadQueueItem(item: QueueRecord & {
    video_path: string;
    thumbnail_path: string | null;
    clip_title: string;
    caption: string | null;
    hashtags: string | null;
  }) {
    const now = new Date().toISOString();

    // Mark as posting
    db.prepare("UPDATE schedule_queue SET status = 'posting', updated_at = ? WHERE id = ?")
      .run(now, item.id);

    try {
      let parsedHashtags: string[] = [];
      if (item.hashtags) {
        try {
          parsedHashtags = JSON.parse(item.hashtags);
        } catch {
          parsedHashtags = item.hashtags.split(',').map((s) => s.trim());
        }
      }

      console.log(`🚀 Uploading Short "${item.clip_title}" to YouTube channel ${item.channel_id}...`);

      const result = await YouTubeService.uploadShort({
        channelId: item.channel_id,
        videoPath: item.video_path,
        thumbnailPath: item.thumbnail_path,
        title: item.clip_title,
        caption: item.caption,
        hashtags: parsedHashtags
      });

      // Mark posted
      db.prepare(`
        UPDATE schedule_queue
        SET status = 'posted',
            youtube_video_id = ?,
            posted_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(result.videoId, new Date().toISOString(), new Date().toISOString(), item.id);

      console.log(`✅ Successfully published Short: ${result.videoUrl}`);
    } catch (err: any) {
      const newRetryCount = item.retry_count + 1;
      const errorMsg = err.message || 'Unknown upload failure';
      console.error(`❌ Upload failed for queue item ${item.id} (Attempt ${newRetryCount}/3): ${errorMsg}`);

      if (newRetryCount >= 3) {
        // Exceeded retries, mark as failed
        db.prepare(`
          UPDATE schedule_queue
          SET status = 'failed',
              retry_count = ?,
              error_message = ?,
              updated_at = ?
          WHERE id = ?
        `).run(newRetryCount, errorMsg, new Date().toISOString(), item.id);
      } else {
        // Re-schedule for retry in 5 minutes
        const nextRetry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.prepare(`
          UPDATE schedule_queue
          SET status = 'scheduled',
              scheduled_time = ?,
              retry_count = ?,
              error_message = ?,
              updated_at = ?
          WHERE id = ?
        `).run(nextRetry, newRetryCount, errorMsg, new Date().toISOString(), item.id);
      }
    }
  }

  /**
   * Auto-schedule approved clips that are not yet in the queue
   * Spreads them 1-2 per day at optimal Shorts engagement windows (10:00 AM & 6:00 PM)
   */
  static autoScheduleApproved(channelId: string, clipsPerDay: number = 2): { scheduledCount: number } {
    // Find approved clips not yet in schedule_queue
    const unscheduledClips = db.prepare(`
      SELECT c.* FROM clips c
      WHERE c.status = 'approved'
      AND c.id NOT IN (SELECT clip_id FROM schedule_queue WHERE status IN ('scheduled', 'posting', 'posted'))
      ORDER BY c.virality_score DESC
    `).all() as ClipRecord[];

    if (unscheduledClips.length === 0) {
      return { scheduledCount: 0 };
    }

    // Determine starting date: find the latest scheduled item or start tomorrow
    const latestQueue = db.prepare(`
      SELECT scheduled_time FROM schedule_queue
      WHERE channel_id = ? AND status = 'scheduled'
      ORDER BY scheduled_time DESC LIMIT 1
    `).get(channelId) as { scheduled_time: string } | undefined;

    let cursorDate = new Date();
    if (latestQueue && new Date(latestQueue.scheduled_time) > cursorDate) {
      cursorDate = new Date(latestQueue.scheduled_time);
      cursorDate.setDate(cursorDate.getDate() + 1);
    } else {
      cursorDate.setDate(cursorDate.getDate() + 1); // Start tomorrow
    }
    cursorDate.setHours(10, 0, 0, 0); // 10:00 AM

    const slotsPerDay = clipsPerDay === 1 ? [14] : [10, 18]; // 10:00 AM and 6:00 PM
    let currentSlotIdx = 0;

    const now = new Date().toISOString();
    let scheduledCount = 0;

    const insertStmt = db.prepare(`
      INSERT INTO schedule_queue (id, clip_id, channel_id, scheduled_time, status, retry_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'scheduled', 0, ?, ?)
    `);

    db.transaction(() => {
      for (const clip of unscheduledClips) {
        const slotHour = slotsPerDay[currentSlotIdx];
        cursorDate.setHours(slotHour, 0, 0, 0);

        insertStmt.run(
          uuidv4(),
          clip.id,
          channelId,
          cursorDate.toISOString(),
          now,
          now
        );

        scheduledCount++;
        currentSlotIdx++;
        if (currentSlotIdx >= slotsPerDay.length) {
          currentSlotIdx = 0;
          cursorDate.setDate(cursorDate.getDate() + 1);
        }
      }
    })();

    return { scheduledCount };
  }
}
