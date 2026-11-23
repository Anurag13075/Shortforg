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
   * Helper to construct a UTC Date for an exact Indian Standard Time (IST, UTC+5:30) slot
   */
  static getIstSlotDate(dayOffset: number, istHour: number, istMinute: number = 0): Date {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffsetMs = 5.5 * 3600 * 1000;
    const istNow = new Date(utcMs + istOffsetMs);

    const targetYear = istNow.getFullYear();
    const targetMonth = istNow.getMonth();
    const targetDay = istNow.getDate() + dayOffset;

    const targetUtcMs = Date.UTC(targetYear, targetMonth, targetDay, istHour, istMinute, 0, 0) - istOffsetMs;
    return new Date(targetUtcMs);
  }

  
  static autoScheduleApproved(channelId: string, clipsPerDay: number = 2, projectId?: string): { scheduledCount: number } {
    let query = `
      SELECT c.* FROM clips c
      WHERE (c.status = 'approved' OR (c.status = 'draft' AND c.video_path IS NOT NULL))
      AND c.id NOT IN (SELECT clip_id FROM schedule_queue WHERE status IN ('scheduled', 'posting', 'posted'))
    `;
    const params: any[] = [];

    if (projectId && projectId !== 'all') {
      query += ' AND c.project_id = ? ';
      params.push(projectId);
    }

    query += ' ORDER BY c.virality_score DESC ';
    const unscheduledClips = db.prepare(query).all(...params) as ClipRecord[];

    if (unscheduledClips.length === 0) {
      return { scheduledCount: 0 };
    }

    // Peak IST slots: [Hour, Minute]
    const istSlots: [number, number][] = clipsPerDay === 1
      ? [[18, 30]] // 6:30 PM IST
      : clipsPerDay === 2
      ? [[13, 30], [18, 30]] // 1:30 PM and 6:30 PM IST
      : clipsPerDay === 3
      ? [[9, 0], [13, 30], [18, 30]] // 9:00 AM, 1:30 PM, 6:30 PM IST
      : [[9, 0], [13, 30], [18, 30], [21, 0]]; // 9:00 AM, 1:30 PM, 6:30 PM, 9:00 PM IST

    // Find the latest scheduled post to continue spacing from there
    const latestQueue = db.prepare(`
      SELECT scheduled_time FROM schedule_queue
      WHERE channel_id = ? AND status = 'scheduled'
      ORDER BY scheduled_time DESC LIMIT 1
    `).get(channelId) as { scheduled_time: string } | undefined;

    let dayOffset = 0;
    const now = new Date();

    if (latestQueue) {
      const latestDate = new Date(latestQueue.scheduled_time);
      const diffDays = Math.ceil((latestDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
      dayOffset = Math.max(0, diffDays);
    }

    let slotIdx = 0;
    // Find the first upcoming slot today or move to tomorrow
    while (slotIdx < istSlots.length) {
      const candidateDate = this.getIstSlotDate(dayOffset, istSlots[slotIdx][0], istSlots[slotIdx][1]);
      if (candidateDate.getTime() > now.getTime() + 15 * 60 * 1000) {
        break;
      }
      slotIdx++;
    }
    if (slotIdx >= istSlots.length) {
      dayOffset++;
      slotIdx = 0;
    }

    const nowIso = new Date().toISOString();
    let scheduledCount = 0;

    const insertStmt = db.prepare(`
      INSERT INTO schedule_queue (id, clip_id, channel_id, scheduled_time, status, retry_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'scheduled', 0, ?, ?)
    `);

    db.transaction(() => {
      for (const clip of unscheduledClips) {
        const [slotH, slotM] = istSlots[slotIdx];
        const targetDate = this.getIstSlotDate(dayOffset, slotH, slotM);

        insertStmt.run(
          uuidv4(),
          clip.id,
          channelId,
          targetDate.toISOString(),
          nowIso,
          nowIso
        );

        db.prepare("UPDATE clips SET status = 'scheduled', assigned_channel_id = ?, updated_at = ? WHERE id = ?")
          .run(channelId, nowIso, clip.id);

        scheduledCount++;

        // Advance to next slot
        slotIdx++;
        if (slotIdx >= istSlots.length) {
          slotIdx = 0;
          dayOffset++;
        }
      }
    })();

    return { scheduledCount };
  }
}

