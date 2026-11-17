import Groq from 'groq-sdk';
import { CONFIG } from '../config.js';
import { db, ClipRecord, ChannelRecord, QueueRecord } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface CopilotAction {
  type: 'schedule' | 'approve' | 'reject' | 'reschedule' | 'delete_queue';
  clip_id?: string;
  clip_title?: string;
  channel_id?: string;
  channel_title?: string;
  scheduled_time?: string;
  queue_id?: string;
  virality_score?: number;
  reason?: string;
}

export interface CopilotResponse {
  reply: string;
  actions: CopilotAction[];
  summary?: string;
  executed?: boolean;
}

export class CopilotService {
  /**
   * Process a conversational scheduling command with full studio context
   */
  static async processMessage(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<CopilotResponse> {
    const apiKey = CONFIG.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured in .env');
    }

    const groq = new Groq({ apiKey });

    // 1. Gather all studio data context
    const channels = db.prepare(`
      SELECT c.id, c.title, c.avatar_url, c.status,
        (SELECT COUNT(*) FROM schedule_queue WHERE channel_id = c.id AND status = 'posted') as total_posted
      FROM channels c
      ORDER BY c.created_at ASC
    `).all() as any[];

    const projects = db.prepare(`
      SELECT p.id, p.title, p.status, p.created_at,
        (SELECT COUNT(*) FROM clips WHERE project_id = p.id) as clip_count
      FROM projects p
      ORDER BY p.created_at DESC
    `).all() as any[];

    const clips = db.prepare(`
      SELECT
        c.id, c.project_id, c.title, c.hook_line, c.virality_score, c.status,
        c.start_time, c.end_time, c.assigned_channel_id,
        p.title as project_title,
        ch.title as assigned_channel_title
      FROM clips c
      JOIN projects p ON c.project_id = p.id
      LEFT JOIN channels ch ON c.assigned_channel_id = ch.id
      ORDER BY c.virality_score DESC, c.created_at DESC
    `).all() as any[];

    const queue = db.prepare(`
      SELECT
        q.id, q.clip_id, q.channel_id, q.scheduled_time, q.status, q.retry_count,
        c.title as clip_title, c.virality_score,
        ch.title as channel_title
      FROM schedule_queue q
      JOIN clips c ON q.clip_id = c.id
      JOIN channels ch ON q.channel_id = ch.id
      ORDER BY q.scheduled_time ASC
    `).all() as any[];

    const now = new Date();
    const istDateStr = now.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const istTimeStr = now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const currentIso = now.toISOString();

    const systemPrompt = `You are ShortsForge Master Studio Copilot, an elite AI automation strategist and scheduler for YouTube Shorts.
You have COMPLETE operational control over all video clips, connected YouTube channels, and publishing queues.

CURRENT SYSTEM TIME (INDIAN STANDARD TIME - IST, UTC+5:30):
- Local Indian Date: ${istDateStr}
- Local Indian Time: ${istTimeStr}
- System ISO UTC: ${currentIso}

PEAK YOUTUBE SHORTS CONSUMPTION WINDOWS (IST):
- Morning Boost: 09:00 AM IST (03:30 UTC)
- Lunch Prime: 01:30 PM IST (08:00 UTC)
- Evening Viral: 06:30 PM IST (13:00 UTC)
- Night Prime: 09:00 PM IST (15:30 UTC)

CRITICAL SCHEDULING RULES:
1. Always schedule clips in Indian Standard Time (IST) peak slots (09:00 AM, 01:30 PM, 06:30 PM, or 09:00 PM IST).
2. STRICTLY FORBIDDEN: NEVER schedule at odd late night hours like 11:00 PM or 03:00 AM IST when viewer retention drops to zero.
3. Spacing: Distribute clips evenly, exactly 1 clip per slot. Convert the target IST slot to a valid UTC ISO 8601 string (e.g. 18:30 IST = 13:00:00.000Z).
4. Relative Dates:
   - "tomorrow" = next calendar day from current IST date.
   - "next 3 days" = 3 consecutive days starting tomorrow (or today's remaining slots).
${channels.map((ch) => `  - Channel ID: "${ch.id}" | Title: "${ch.title}" | Status: ${ch.status} | Posted: ${ch.total_posted || 0}`).join('\n') || '  (No channels connected)'}

2. PROJECTS (${projects.length}):
${projects.map((p) => `  - Project ID: "${p.id}" | Title: "${p.title}" | Status: ${p.status} | Clips: ${p.clip_count}`).join('\n') || '  (No projects)'}

3. CLIPS IN STUDIO (${clips.length}):
${clips.map((c) => `  - Clip ID: "${c.id}" | Score: ${c.virality_score}/100 | Status: ${c.status} | Project: "${c.project_title}" | Title: "${c.title}" | Hook: "${c.hook_line}" | Assigned: ${c.assigned_channel_title || 'None'}`).join('\n') || '  (No clips)'}

4. CURRENT PUBLISHING QUEUE (${queue.length}):
${queue.map((q) => `  - Queue ID: "${q.id}" | Clip: "${q.clip_title}" (Score: ${q.virality_score}) | Channel: "${q.channel_title}" | Scheduled: ${q.scheduled_time} | Status: ${q.status}`).join('\n') || '  (Queue is currently empty)'}

INSTRUCTIONS FOR MASTER SCHEDULING:
1. Listen carefully to the user's intent regarding days (e.g. "next 4 days", "tomorrow", "this weekend"), times (e.g. "10am and 6pm", "every day at 2pm"), target channels (e.g. "VICECLIPS", "CodeNerd"), and clips (e.g. "approved clips", "score > 85", "top 3").
2. Relative Dates:
   - "tomorrow" = next calendar day from current system date.
   - "next 4 days" = 4 consecutive days starting tomorrow (or today if time hasn't passed).
   - "10am" = 10:00:00 local time; "6pm" = 18:00:00 local time.
   - Always convert scheduled times into valid ISO 8601 strings (e.g., "2026-11-17T10:00:00.000Z").
3. Handling Missing or Insufficient Approved Clips:
   - If user asks to schedule approved clips but none or too few are approved:
     - Check if there are draft clips available!
     - Offer to approve the highest virality drafts and schedule them, OR include "approve" actions followed by "schedule" actions.
4. Channel Selection:
   - If the user specifies a channel name (e.g. "VICECLIPS"), match it to the Channel ID.
   - If user doesn't specify a channel:
     - Use the clip's assigned channel if present.
     - Otherwise default to the first active channel (e.g. "${channels[0]?.title || 'default'}") and notify the user.
5. Action Types Supported:
   - "schedule": { type: "schedule", clip_id, clip_title, channel_id, channel_title, scheduled_time, virality_score, reason }
   - "approve": { type: "approve", clip_id, clip_title, channel_id }
   - "reschedule": { type: "reschedule", queue_id, clip_title, channel_title, scheduled_time, reason }
   - "delete_queue": { type: "delete_queue", queue_id, clip_title }

RESPONSE FORMAT:
You MUST output strictly valid JSON matching this schema:
{
  "reply": "Conversational, clear, confident explanation of what you analyzed and proposed, written in professional studio style without cheesy AI words.",
  "actions": [
    {
      "type": "schedule",
      "clip_id": "...",
      "clip_title": "...",
      "channel_id": "...",
      "channel_title": "...",
      "scheduled_time": "YYYY-MM-DDTHH:MM:SS.000Z",
      "virality_score": 90,
      "reason": "Top scoring hook scheduled for peak morning retention slot"
    }
  ],
  "summary": "Brief 1-sentence summary of the batch operation (e.g. '4 Shorts scheduled to VICECLIPS across Nov 17 - Nov 20')."
}`;

    const candidateModels = [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b'
    ];

    let completion: any;
    let lastError: any;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage }
    ];

    for (const model of candidateModels) {
      try {
        completion = await groq.chat.completions.create({
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.2
        });
        if (completion?.choices?.[0]?.message?.content) {
          break;
        }
      } catch (err: any) {
        console.warn(`Groq Copilot model ${model} failed, trying next:`, err.message);
        lastError = err;
      }
    }

    if (!completion?.choices?.[0]?.message?.content) {
      throw new Error(`Master Copilot failed to generate a response: ${lastError?.message || 'No response'}`);
    }

    const content = completion.choices[0].message.content;
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      throw new Error(`Failed to parse Copilot JSON output: ${err.message}. Content: ${content.substring(0, 200)}`);
    }

    return {
      reply: parsed.reply || 'I have analyzed your studio and prepared the scheduling actions.',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      summary: parsed.summary || 'Scheduled operations prepared.'
    };
  }

  /**
   * Execute confirmed copilot actions atomically in SQLite
   */
  static async executeActions(actions: CopilotAction[]): Promise<{
    success: boolean;
    executedCount: number;
    message: string;
  }> {
    const now = new Date().toISOString();
    let scheduledCount = 0;
    let approvedCount = 0;
    let deletedCount = 0;
    let rescheduledCount = 0;

    const insertQueueStmt = db.prepare(`
      INSERT INTO schedule_queue (id, clip_id, channel_id, scheduled_time, status, retry_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'scheduled', 0, ?, ?)
    `);

    const updateClipStatusStmt = db.prepare(`
      UPDATE clips
      SET status = ?,
          assigned_channel_id = COALESCE(?, assigned_channel_id),
          updated_at = ?
      WHERE id = ?
    `);

    const updateQueueTimeStmt = db.prepare(`
      UPDATE schedule_queue
      SET scheduled_time = ?,
          status = 'scheduled',
          updated_at = ?
      WHERE id = ?
    `);

    const deleteQueueStmt = db.prepare(`
      DELETE FROM schedule_queue WHERE id = ?
    `);

    db.transaction(() => {
      for (const act of actions) {
        if (act.type === 'schedule' && act.clip_id && act.channel_id && act.scheduled_time) {
          // Check if already in queue with status 'scheduled'
          const existing = db.prepare(`
            SELECT id FROM schedule_queue
            WHERE clip_id = ? AND channel_id = ? AND status = 'scheduled'
          `).get(act.clip_id, act.channel_id);

          if (existing) {
            // Update time
            updateQueueTimeStmt.run(act.scheduled_time, now, (existing as any).id);
          } else {
            // Insert new queue record
            insertQueueStmt.run(
              uuidv4(),
              act.clip_id,
              act.channel_id,
              act.scheduled_time,
              now,
              now
            );
          }

          // Mark clip as scheduled and assigned
          updateClipStatusStmt.run('scheduled', act.channel_id, now, act.clip_id);
          scheduledCount++;
        } else if (act.type === 'approve' && act.clip_id) {
          updateClipStatusStmt.run('approved', act.channel_id || null, now, act.clip_id);
          approvedCount++;
        } else if (act.type === 'reschedule' && act.queue_id && act.scheduled_time) {
          updateQueueTimeStmt.run(act.scheduled_time, now, act.queue_id);
          rescheduledCount++;
        } else if (act.type === 'delete_queue' && act.queue_id) {
          deleteQueueStmt.run(act.queue_id);
          deletedCount++;
        }
      }
    })();

    const parts: string[] = [];
    if (scheduledCount > 0) parts.push(`${scheduledCount} Shorts queued for publication`);
    if (approvedCount > 0) parts.push(`${approvedCount} clips approved`);
    if (rescheduledCount > 0) parts.push(`${rescheduledCount} slots rescheduled`);
    if (deletedCount > 0) parts.push(`${deletedCount} queue items removed`);

    return {
      success: true,
      executedCount: scheduledCount + approvedCount + rescheduledCount + deletedCount,
      message: parts.length > 0 ? parts.join(', ') : 'Actions executed successfully'
    };
  }
}
