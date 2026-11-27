import Groq from 'groq-sdk';
import { CONFIG } from '../config.js';
import { WordTimestamp } from './transcriber.js';
import { snapToSentenceBoundaries } from './boundarySnapper.js';

export interface ViralMoment {
  start: number;
  end: number;
  virality_score: number;
  reason: string;
  hook_line: string;  
  title: string;
  title_options: string[];
  caption: string;
  caption_options: string[];
  hashtags: string[]; // 
}

const NICHE_PROMPTS: Record<string, string> = {
  high_energy: 'Highlight explosive hooks, shocking confessions, dramatic confrontations, and high-retention twists.',
  storytelling: 'Highlight compelling personal stories, relatable journeys, unexpected turns, and dramatic revelations.',
  gaming: 'Highlight clutch plays, hilarious fails, insane reactions, and peak gameplay hype.',
  podcast: 'Highlight thought-provoking debates, raw personal opinions, and high-value takeaways.',
  comedy: 'Highlight peak comedic timing, sarcastic roasts, funny punchlines, and relatable moments.',
  finance_tech: 'Highlight counter-intuitive advice, insider industry secrets, and practical actionable insights.'
};

/**
 * Uses Groq LLMs to analyze transcript timestamps and select the highest-retention,
 * hyper-specific viral moments for 9:16 vertical YouTube Shorts.
 * Every clip is snapped to natural sentence boundaries so dialogue is never cut off mid-thought.
 */
export async function pickViralMoments(
  fullText: string,
  words: WordTimestamp[],
  videoDuration: number,
  targetCount: number = 8,
  niche: string = 'high_energy'
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

  // If transcript is long, sample at most 22 chunks across the video timeline (~1,300 words / ~1,700 tokens)
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
  const nicheInstruction = NICHE_PROMPTS[niche] || NICHE_PROMPTS.high_energy;

  const systemPrompt = `You are an elite YouTube Shorts producer and virality editor.
Your task is to analyze timestamped video transcripts and extract exactly ${targetCount} of the most viral, standalone moments for 9:16 vertical Shorts.
CHANNEL TONE / NICHE: ${nicheInstruction}

MANDATORY QUANTITY REQUIREMENT:
You MUST return between 6 and ${targetCount} moments in the "moments" JSON array. Returning only 1, 2, or 3 moments is strictly unacceptable.
If the source video is concise, choose multiple compelling quotes, revelations, dramatic statements, or punchlines (each 18 to 48 seconds). Moments may highlight different parts across the entire transcript.

STRICT ACCURACY & CONTENT-MATCHING RULES (NO GENERIC AI SLOP):
1. Clip Length: Target 18 to 38 seconds (optimal for 100%+ YouTube Shorts completion rate and algorithmic loop virality). Never exceed 45 seconds unless a continuous story strictly requires it.
2. The First 1.5 Seconds (CRITICAL PATTERN INTERRUPT): Must open with an immediate hook, high-energy statement, shocking fact, bold claim, or intrigue gap with ZERO dead air or throat-clearing.
3. TITLE MUST MATCH THE EXACT CONTENT IN THE CLIP:
   - The title MUST name the specific subject, action, person, or question discussed in THAT exact clip.
   - Example good titles matching transcript: "I Got Fired For Automating My Job", "Why Don Threatened My Mom", "Honeydeck School Shutting Down?", "Paying $20 To Pass AI Interviews".
   - STRICTLY FORBIDDEN: Do NOT generate generic self-help clichés like "Why 99% Of People Fail", "The Truth Nobody Tells You", "The Secret To Success", or "Never Give Up" unless the speaker is literally saying those exact words.
   - Under 70 characters, no quotation marks.
   - Provide 3 distinct title options:
     * Option 1: Direct spoken quote hook
     * Option 2: Curiosity gap / intrigue
     * Option 3: Conflict or revelation
4. HOOK LINE MUST BE THE LITERAL SPOKEN HOOK:
   - 3 to 8 words capturing the actual first sentence or statement spoken at the start of this clip.
5. CAPTION MUST SUMMARIZE THE EXACT SCENE:
   - 2-3 sentences describing exactly what happens or is revealed in this specific clip.
   - Include a direct quote from the speaker in quotation marks.
   - Include an engaging question directly tied to the topic.
   - Provide 2 caption options (one punchy & one narrative).
6. HASHTAGS:
   - 5 hashtags matching the real subject (e.g. #storytime, #tech, #career, #coding, #school, #podcast, etc.) rather than generic tags.
7. Clean Thought Boundaries:
   - Each moment must begin where a thought begins and conclude where a realization, punchline, or point is completed.
8. SEAMLESS LOOP VIRALITY:
   - Prioritize moments where the concluding sentence naturally flows or links back to the opening hook sentence.
   - When viewers don't notice the clip ended and re-watch the opening seconds, retention surges over 100%, triggering YouTube's viral recommendation engine.

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
      "title_options": [
        "Why Don Threatened My Mom",
        "The Terrifying Encounter At The Door",
        "Mom Didn\\'t Flinch For A Second"
      ],
      "caption": "The terrifying moment things almost went too far. 'She looked him dead in the eye and didn\\'t blink.' Would you have stood your ground?",
      "caption_options": [
        "The terrifying moment things almost went too far. 'She looked him dead in the eye and didn\\'t blink.' Would you have stood your ground?",
        "Don thought he could intimidate us until Mom stepped in. Never underestimate a mother protecting her kid. Drop your thoughts below!"
      ],
      "hashtags": ["#shorts", "#storytime", "#truestory", "#family", "#podcast"]
    }
  ]
}`;

  const userPrompt = `Video Duration: ${videoDuration.toFixed(1)} seconds.
Analyze this timestamped transcript and select ${targetCount} top viral standalone moments (each 20-50s duration). You must provide between 6 and ${targetCount} moments in the JSON array:

${timestampedChunks.join('\n\n')}`;

  const candidateModels = [
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b'
  ];

  let completion: any;
  let parsed: any;
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
        max_tokens: 4096,
        temperature: 0.2
      });
      if (completion?.choices?.[0]?.message?.content) {
        try {
          parsed = JSON.parse(completion.choices[0].message.content);
          if (parsed && (parsed.moments || parsed.clips || parsed.viral_moments)) {
            break;
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn(`Groq model ${model} failed, checking error recovery:`, err.message);
      lastError = err;

      // Extract failed_generation from Groq validation errors to salvage moments
      const failedGen = err?.error?.failed_generation || (typeof err?.message === 'string' && err.message.includes('failed_generation') ? err.message : null);
      if (failedGen) {
        try {
          const match = failedGen.match(/\{[\s\S]*\}/);
          if (match) {
            let repaired = match[0]
              .replace(/#([a-zA-Z0-9_]+)/g, '"#$1"')
              .replace(/,\s*([}\]])/g, '$1');
            const recovered = JSON.parse(repaired);
            if (recovered?.moments?.length > 0) {
              parsed = recovered;
              break;
            }
          }
        } catch {}
      }
    }
  }

  const momentsRaw: any[] = parsed?.moments || parsed?.clips || parsed?.viral_moments || [];

  // Validate, snap to natural sentence boundaries, and sanitize each moment
  const validatedMoments: ViralMoment[] = [];
  for (const m of momentsRaw) {
    const rawStart = parseFloat(m.start);
    const rawEnd = parseFloat(m.end);

    if (isNaN(rawStart) || isNaN(rawEnd) || rawStart >= rawEnd) {
      continue;
    }

    // Snap to natural sentence beginnings and conclusions so words are never cut off
    const snapped = snapToSentenceBoundaries(rawStart, rawEnd, words, videoDuration, 18, 42);

    const title = (m.title || 'Untitled Short')
      .replace(/["'\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 70);

    const titleOptions: string[] = Array.isArray(m.title_options) && m.title_options.length > 0
      ? m.title_options.map((t: string) => String(t).replace(/["'\\]/g, '').trim().substring(0, 70))
      : [title];
    if (!titleOptions.includes(title)) {
      titleOptions.unshift(title);
    }

    const hook_line = (m.hook_line || title)
      .replace(/["'\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 45);

    const caption = (m.caption || title).trim().substring(0, 400);

    const captionOptions: string[] = Array.isArray(m.caption_options) && m.caption_options.length > 0
      ? m.caption_options.map((c: string) => String(c).trim().substring(0, 400))
      : [caption];
    if (!captionOptions.includes(caption)) {
      captionOptions.unshift(caption);
    }

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
      start: snapped.start,
      end: snapped.end,
      virality_score: Math.min(100, Math.max(1, parseInt(m.virality_score || '85', 10))),
      reason: m.reason || 'High retention potential and engaging opening hook.',
      hook_line,
      title,
      title_options: titleOptions.slice(0, 3),
      caption,
      caption_options: captionOptions.slice(0, 2),
      hashtags: hashtags.slice(0, 5)
    });
  }

  // GUARANTEE: If fewer than desired moments (targetCount = 8), intelligently partition speech timeline
  const desiredMin = Math.min(6, targetCount);
  if (validatedMoments.length < targetCount && words.length > 10) {
    const totalSlots = Math.max(16, targetCount * 3);
    const stepDuration = Math.max(15, (videoDuration - 20) / totalSlots);

    for (let slot = 0; slot < totalSlots && validatedMoments.length < targetCount; slot++) {
      const approxStart = Math.min(Math.max(0, videoDuration - 25), slot * stepDuration);
      const approxEnd = Math.min(videoDuration, approxStart + 28);
      if (approxEnd - approxStart < 14) continue;

      const snapped = snapToSentenceBoundaries(approxStart, approxEnd, words, videoDuration, 18, 42);

      // Check overlap with existing moments: must not significantly overlap (> 8s)
      const isOverlapping = validatedMoments.some(
        (vm) => vm.start < (snapped.end - 8) && vm.end > (snapped.start + 8)
      );
      if (isOverlapping) continue;

      const segmentWords = words.filter((w) => w.start >= snapped.start && w.end <= snapped.end);
      if (segmentWords.length < 5) continue;

      const spokenSample = segmentWords.slice(0, 8).map((w) => w.word).join(' ').replace(/["'\\]/g, '').trim();
      const generatedTitle = spokenSample ? `${spokenSample.slice(0, 48)}...` : `Viral Moment Part ${validatedMoments.length + 1}`;
      const hook = segmentWords.slice(0, 6).map((w) => w.word).join(' ').replace(/["'\\]/g, '').trim().toUpperCase();

      validatedMoments.push({
        start: snapped.start,
        end: snapped.end,
        virality_score: Math.max(78, 92 - validatedMoments.length * 2),
        reason: 'Peak dialogue segment with natural sentence hook and thought completion.',
        hook_line: hook || generatedTitle.slice(0, 35),
        title: generatedTitle,
        title_options: [
          generatedTitle,
          `Why Nobody Noticed ${generatedTitle.slice(0, 25)}`,
          `The Untold Truth About ${generatedTitle.slice(0, 22)}`
        ],
        caption: `Highlight from the video: "${spokenSample}" What do you think about this?`,
        caption_options: [
          `Highlight: "${spokenSample}" What are your thoughts?`,
          `Must-see moment: "${spokenSample}"`
        ],
        hashtags: ['#shorts', '#viral', '#trending', '#gaming']
      });
    }
  }

  // Sort by virality score descending
  validatedMoments.sort((a, b) => b.virality_score - a.virality_score);
  return validatedMoments.slice(0, targetCount);
}

/**
 * Regenerates hyper-specific title options, hook, and caption for an individual clip
 * based on its exact spoken transcript segment.
 */
export async function regenerateClipMetadata(
  clipTranscriptText: string
): Promise<{
  title: string;
  title_options: string[];
  hook_line: string;
  caption: string;
  caption_options: string[];
  hashtags: string[];
}> {
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
   Provide 3 distinct title options:
   - Option 1: Direct quote / spoken hook
   - Option 2: Intrigue / curiosity gap
   - Option 3: Action / revelation
2. Hook Line: 3-8 words capturing the first spoken sentence.
3. Caption: 2-3 sentences summarizing the exact scene with a direct quote. Provide 2 caption options.
4. Hashtags: 5 specific tags matching the topic.

RETURN STRICT JSON:
{
  "title": "...",
  "title_options": ["...", "...", "..."],
  "hook_line": "...",
  "caption": "...",
  "caption_options": ["...", "..."],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;

  const candidateModels = [
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b'
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
  const title = (parsed.title || 'Untitled Short').replace(/["'\\]/g, '').trim().substring(0, 70);
  const titleOptions: string[] = Array.isArray(parsed.title_options) && parsed.title_options.length > 0
    ? parsed.title_options.map((t: string) => String(t).replace(/["'\\]/g, '').trim().substring(0, 70))
    : [title];
  if (!titleOptions.includes(title)) titleOptions.unshift(title);

  const caption = (parsed.caption || '').trim().substring(0, 400);
  const captionOptions: string[] = Array.isArray(parsed.caption_options) && parsed.caption_options.length > 0
    ? parsed.caption_options.map((c: string) => String(c).trim().substring(0, 400))
    : [caption];
  if (!captionOptions.includes(caption)) captionOptions.unshift(caption);

  return {
    title,
    title_options: titleOptions.slice(0, 3),
    hook_line: (parsed.hook_line || parsed.title || 'HOOK').replace(/["'\\]/g, '').trim().substring(0, 45),
    caption,
    caption_options: captionOptions.slice(0, 2),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 5) : ['#shorts', '#viral']
  };
}
