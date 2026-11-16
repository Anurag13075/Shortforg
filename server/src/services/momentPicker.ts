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
 * Uses Groq LLMs to analyze transcript timestamps and select the highest-retention,
 * hyper-specific viral moments for 9:16 vertical YouTube Shorts.
 * Every title, hook, and caption is strictly grounded in the exact dialogue of the clip.
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

  // Format transcript segments with timestamps to guide the LLM.
  // Strictly budget tokens to stay under Groq's 7,000-8,000 Input Tokens Per Minute (ITPM) limit.
  const totalWords = words.length;
  let chunkSize = 35;
  if (totalWords > 800) chunkSize = 50;
  if (totalWords > 1800) chunkSize = 65;

  const rawSlices: { start: string; end: string; text: string }[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize);
    const start = slice[0].start.toFixed(1);
    const end = slice[slice.length - 1].end.toFixed(1);
    const text = slice.map((w) => w.word).join(' ');
    rawSlices.push({ start, end, text });
  }

  // If transcript is long, sample at most 22 chunks across the video timeline.
  // 22 chunks * ~60 words = ~1,300 words (~1,700 tokens), well under Groq's 7,000 ITPM limit.
  let selectedSlices = rawSlices;
  if (rawSlices.length > 22) {
    const maxChunks = 22;
    const step = rawSlices.length / maxChunks;
    selectedSlices = [];
    for (let i = 0; i < maxChunks; i++) {
      const idx = Math.min(rawSlices.length - 1, Math.floor(i * step));
      selectedSlices.push(rawSlices[idx]);
    }
  }

  const timestampedChunks = selectedSlices.map((s) => `[${s.start}s - ${s.end}s]: ${s.text}`);

  const systemPrompt = `You are an elite YouTube Shorts producer and virality editor.
Your task is to analyze timestamped video transcripts and extract exactly ${targetCount} of the most viral, standalone moments for 9:16 vertical Shorts.

STRICT ACCURACY & CONTENT-MATCHING RULES (NO GENERIC AI SLOP):
1. Clip Length: STRICTLY between 20 and 55 seconds (end - start must be between 20 and 55).
2. The First 3 Seconds: Must open with an explosive hook, dramatic story start, controversy, or curiosity gap.
3. TITLE MUST MATCH THE EXACT CONTENT IN THE CLIP:
   - The title MUST name the specific subject, action, person, or question discussed in THAT exact clip.
   - Example good titles matching transcript: "I Got Fired For Automating My Job", "Why Don Threatened My Mom", "Honeydeck School Shutting Down?", "Paying $20 To Pass AI Interviews".
   - STRICTLY FORBIDDEN: Do NOT generate generic self-help clichés like "Why 99% Of People Fail", "The Truth Nobody Tells You", "The Secret To Success", or "Never Give Up" unless the speaker is literally saying those exact words.
   - Under 70 characters, no quotation marks.
4. HOOK LINE MUST BE THE LITERAL SPOKEN HOOK:
   - 3 to 8 words capturing the actual first sentence or statement spoken at the start of this clip.
5. CAPTION MUST SUMMARIZE THE EXACT SCENE:
   - 2-3 sentences describing exactly what happens or is revealed in this specific clip.
   - Include a direct quote from the speaker in quotation marks.
   - Include an engaging question directly tied to the topic.
6. HASHTAGS:
   - 5 hashtags matching the real subject (e.g. #storytime, #tech, #career, #coding, #school, #podcast, etc.) rather than generic tags.
7. Clean In/Out Boundaries:
   - Start cleanly at the beginning of a sentence.
   - End cleanly after a punchline, realization, or completed thought.

RETURN VALID JSON WITH THIS EXACT STRUCTURE:
{
  "moments": [
    {
      "start": 14.2,
      "end": 48.5,
      "virality_score": 93,
      "reason": "Direct emotional confrontation in the first 5 seconds with a surprising resolution.",
      "hook_line": "DON THREATENED ME, MOM SAVED ME",
      "title": "Why Don Threatened My Mom",
      "caption": "The terrifying moment things almost went too far. 'She looked him dead in the eye and didn\\'t blink.' Would you have stood your ground?",
      "hashtags": ["#shorts", "#storytime", "#truestory", "#family", "#podcast"]
    }
  ]
}`;

  const userPrompt = `Video Duration: ${videoDuration.toFixed(1)} seconds.
Analyze this timestamped transcript and select ${targetCount} top viral standalone moments (each 20-55s duration). Ensure every title and description matches what is actually said in that excerpt:

${timestampedChunks.join('\n\n')}`;

  const candidateModels = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'
  ];

  let completion: any;
  let lastError: any;

  for (const model of candidateModels) {
    try {
      completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      });
      if (completion?.choices?.[0]?.message?.content) {
        break;
      }
    } catch (err: any) {
      console.warn(`Groq model ${model} failed, trying next fallback:`, err.message);
      lastError = err;
    }
  }

  if (!completion?.choices?.[0]?.message?.content) {
    throw new Error(`All Groq LLM models failed to pick viral moments: ${lastError?.message || 'No response'}`);
  }

  const responseContent = completion.choices[0]?.message?.content || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(responseContent);
  } catch (err: any) {
    throw new Error(`Failed to parse LLM moments JSON: ${err.message}. Raw: ${responseContent.slice(0, 300)}`);
  }

  const momentsRaw: any[] = parsed.moments || parsed.clips || parsed.viral_moments || [];
  if (!Array.isArray(momentsRaw) || momentsRaw.length === 0) {
    throw new Error('LLM did not return an array of viral moments in JSON.');
  }

  // Validate and sanitize each moment
  const validatedMoments: ViralMoment[] = [];
  for (const m of momentsRaw) {
    let start = parseFloat(m.start);
    let end = parseFloat(m.end);

    if (isNaN(start) || isNaN(end) || start >= end) {
      continue;
    }

    start = Math.max(0, start);
    end = Math.min(videoDuration, end);

    // Ensure clip duration is between 15s and 60s
    let duration = end - start;
    if (duration < 15) {
      end = Math.min(videoDuration, start + 30);
      duration = end - start;
    }
    if (duration > 60) {
      end = start + 58;
    }

    const title = (m.title || 'Untitled Short')
      .replace(/["'\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 70);

    const hook_line = (m.hook_line || title)
      .replace(/["'\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 45);

    const caption = (m.caption || title).trim().substring(0, 300);

    let hashtags = m.hashtags;
    if (typeof hashtags === 'string') {
      try {
        hashtags = JSON.parse(hashtags);
      } catch {
        hashtags = hashtags.split(/[,\s]+/).map((h: string) => h.startsWith('#') ? h : `#${h}`);
      }
    }
    if (!Array.isArray(hashtags) || hashtags.length === 0) {
      hashtags = ['#shorts', '#viral'];
    }

    validatedMoments.push({
      start: Math.round(start * 10) / 10,
      end: Math.round(end * 10) / 10,
      virality_score: Math.min(100, Math.max(1, parseInt(m.virality_score || '85', 10))),
      reason: m.reason || 'High retention potential and engaging opening hook.',
      hook_line,
      title,
      caption,
      hashtags: hashtags.slice(0, 5)
    });
  }

  // Sort by virality score descending
  validatedMoments.sort((a, b) => b.virality_score - a.virality_score);
  return validatedMoments.slice(0, targetCount);
}

/**
 * Regenerates hyper-specific title, hook, and caption for an individual clip
 * based on its exact spoken transcript segment.
 */
export async function regenerateClipMetadata(
  clipTranscriptText: string
): Promise<{ title: string; hook_line: string; caption: string; hashtags: string[] }> {
  const apiKey = CONFIG.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in .env');
  }

  const groq = new Groq({ apiKey });

  const prompt = `You are a YouTube Shorts title & description specialist.
Analyze this exact dialogue spoken in a 30-50 second clip and generate a viral, hyper-specific title and description matching EXACTLY what is said:

EXACT CLIP TRANSCRIPT:
"${clipTranscriptText}"

RULES:
1. Title: Under 70 characters. Must describe the exact topic, question, or story in the transcript (e.g. "I Sold My First Car At 16"). NO generic clichés.
2. Hook Line: 3-8 words capturing the first spoken sentence.
3. Caption: 2-3 sentences summarizing the exact scene with a direct quote.
4. Hashtags: 5 specific tags matching the topic.

RETURN STRICT JSON:
{
  "title": "...",
  "hook_line": "...",
  "caption": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;

  const candidateModels = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'
  ];

  let completion: any;
  let lastError: any;
  for (const model of candidateModels) {
    try {
      completion = await groq.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      });
      if (completion?.choices?.[0]?.message?.content) break;
    } catch (e: any) {
      lastError = e;
    }
  }

  if (!completion?.choices?.[0]?.message?.content) {
    throw new Error(`Failed to generate clip metadata: ${lastError?.message || 'No response'}`);
  }

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    title: (parsed.title || 'Untitled Short').replace(/["'\\]/g, '').trim().substring(0, 70),
    hook_line: (parsed.hook_line || parsed.title || 'HOOK').replace(/["'\\]/g, '').trim().substring(0, 45),
    caption: (parsed.caption || '').trim().substring(0, 300),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 5) : ['#shorts', '#viral']
  };
}
