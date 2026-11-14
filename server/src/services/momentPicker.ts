import Groq from 'groq-sdk';
import { CONFIG } from '../config.js';
import { WordTimestamp } from './transcriber.js';

export interface ViralMoment {
  start: number;
  end: number;
  virality_score: number;
  reason: string;
  hook_line: string;
  title: string;
  caption: string;
  hashtags: string[];
}

/**
 * Analyzes video transcript with a Groq LLM to identify 5-10 viral, standalone Shorts clips
 */
export async function pickViralMoments(
  fullText: string,
  words: WordTimestamp[],
  videoDuration: number,
  targetCount: number = 8
): Promise<ViralMoment[]> {
  const apiKey = CONFIG.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in .env');
  }

  const groq = new Groq({ apiKey });

  // Format transcript segments with timestamps to guide the LLM
  // Group words by ~10-second intervals so the prompt isn't overwhelmed
  const timestampedChunks: string[] = [];
  const chunkSize = 25; // ~25 words per interval
  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize);
    const start = slice[0].start.toFixed(1);
    const end = slice[slice.length - 1].end.toFixed(1);
    const text = slice.map((w) => w.word).join(' ');
    timestampedChunks.push(`[${start}s - ${end}s]: ${text}`);
  }

  const systemPrompt = `You are a world-class YouTube Shorts viral producer and content strategist.
Your task is to analyze video transcripts and pick exactly ${targetCount} of the most viral, standalone moments suitable for high-performing 9:16 vertical YouTube Shorts.

CRITICAL CRITERIA FOR VIRAL SHORTS:
1. Clip Length: STRICTLY between 20 and 55 seconds (end - start must be between 20 and 55).
2. First 3 Seconds: Must open with an irresistible hook, controversial statement, curiosity gap, or explosive question.
3. Payoff: Must deliver a satisfying, surprising, hilarious, or high-value emotional/informational payoff.
4. Standalone Context: The viewer should NOT need prior context to understand and enjoy the clip. Clean start (at the beginning of a thought/sentence) and clean end (at the end of a punchline or thought).
5. Virality Score: Realistic 1-100 score based on retention potential, emotional charge, and shareability.
6. Title: High-CTR YouTube Shorts title STRICTLY UNDER 70 characters (NO quotes).
7. Hook Line: Catchy 3-8 word phrase summarizing the opening hook (for video overlays and thumbnails).
8. Caption: 2-3 engaging lines prompting comments/shares.
9. Hashtags: Exactly 5 viral hashtags (e.g., #shorts, #mindblown, #podcast, etc.).

YOU MUST RETURN VALID JSON WITH THIS EXACT STRUCTURE:
{
  "moments": [
    {
      "start": 12.5,
      "end": 48.0,
      "virality_score": 94,
      "reason": "Intense personal story with a shock twist at 35s that guarantees high retention.",
      "hook_line": "The Truth Nobody Tells You",
      "title": "Why 99% Of People Fail Before Day 30",
      "caption": "Most people give up right before the breakthrough. Are you making this mistake?",
      "hashtags": ["#shorts", "#mindset", "#success", "#motivation", "#lifeadvice"]
    }
  ]
}`;

  const userPrompt = `Video Duration: ${videoDuration.toFixed(1)} seconds.
Analyze this timestamped transcript and select ${targetCount} top viral standalone moments (each 20-55s duration):

${timestampedChunks.join('\n\n')}`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  });

  const responseContent = completion.choices[0]?.message?.content || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(responseContent);
  } catch (err: any) {
    throw new Error(`Failed to parse LLM moments JSON: ${err.message}. Raw: ${responseContent.slice(0, 300)}`);
  }

  const momentsRaw: any[] = parsed.moments || parsed.clips || parsed.viral_moments || [];
  if (!Array.isArray(momentsRaw) || momentsRaw.length === 0) {
    throw new Error('LLM did not return any viral moments in JSON format');
  }

  // Validate and sanitize moments
  const sanitizedMoments: ViralMoment[] = momentsRaw.map((m: any, index: number) => {
    let start = Math.max(0, parseFloat(m.start) || 0);
    let end = Math.min(videoDuration > 0 ? videoDuration : 9999, parseFloat(m.end) || (start + 30));

    // Ensure 20-55 second bounds
    let dur = end - start;
    if (dur < 20) {
      end = Math.min(videoDuration, start + 30);
      dur = end - start;
    }
    if (dur > 55) {
      end = start + 55;
    }

    const title = (m.title || `Viral Short #${index + 1}`).trim().substring(0, 70);
    const hook_line = (m.hook_line || 'Watch This').trim().substring(0, 50);
    const reason = (m.reason || 'High engagement segment').trim();
    const caption = (m.caption || title).trim();
    const virality_score = Math.max(1, Math.min(100, parseInt(m.virality_score, 10) || 85));

    let hashtags: string[] = Array.isArray(m.hashtags)
      ? m.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).slice(0, 5)
      : ['#shorts', '#viral', '#trending', '#foryou', '#reels'];

    if (hashtags.length < 5) {
      const fallback = ['#shorts', '#viral', '#explore', '#mustwatch', '#clip'];
      for (const f of fallback) {
        if (!hashtags.includes(f) && hashtags.length < 5) hashtags.push(f);
      }
    }

    return {
      start,
      end,
      virality_score,
      reason,
      hook_line,
      title,
      caption,
      hashtags
    };
  });

  // Sort by virality score descending
  sanitizedMoments.sort((a, b) => b.virality_score - a.virality_score);

  return sanitizedMoments;
}
