import { WordTimestamp } from './transcriber.js';
import fs from 'fs';

/**
 * Format seconds into ASS subtitle timestamp format: H:MM:SS.cs (centiseconds)
 */
function formatAssTime(seconds: number): string {
  const totalSeconds = Math.max(0, seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const cs = Math.floor((totalSeconds % 1) * 100);

  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  const csStr = String(cs).padStart(2, '0');

  return `${h}:${mStr}:${sStr}.${csStr}`;
}

export interface SubtitleOptions {
  wordsPerChunk?: number; // words per caption burst (default: 3-4)
  fontSize?: number;      // default: 78
  activeColor?: string;   // ASS hex BGR (default: Yellow &H002BF7&)
  normalColor?: string;   // ASS hex BGR (default: White &H00FFFFFF&)
  outlineColor?: string;  // ASS hex BGR (default: Black &H00000000&)
}

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file with word-by-word animated highlights
 * tailored for vertical 9:16 YouTube Shorts (1080x1920).
 */
export function generateAssSubtitles(
  words: WordTimestamp[],
  clipStart: number,
  clipEnd: number,
  outputPath: string,
  options?: SubtitleOptions
): string {
  const wordsPerChunk = options?.wordsPerChunk || 3;
  const fontSize = options?.fontSize || 78;
  const activeColor = options?.activeColor || '&H002BF7&'; // Vibrant Yellow/Gold in ASS (BBGGRR)
  const normalColor = options?.normalColor || '&H00FFFFFF&'; // Pure White
  const outlineColor = options?.outlineColor || '&H00000000&'; // Solid Black

  // Filter words that belong to this clip segment and normalize times relative to clip start (0)
  const clipWords = words
    .filter((w) => w.end >= clipStart && w.start <= clipEnd)
    .map((w) => ({
      word: w.word.trim(),
      start: Math.max(0, w.start - clipStart),
      end: Math.max(0.1, w.end - clipStart)
    }))
    .filter((w) => w.word.length > 0);

  // Group words into short chunks of 3-4 words for high readability on vertical screens
  interface WordGroup {
    words: { word: string; start: number; end: number }[];
    startTime: number;
    endTime: number;
  }

  const groups: WordGroup[] = [];
  for (let i = 0; i < clipWords.length; i += wordsPerChunk) {
    const chunk = clipWords.slice(i, i + wordsPerChunk);
    if (chunk.length > 0) {
      groups.push({
        words: chunk,
        startTime: chunk[0].start,
        endTime: chunk[chunk.length - 1].end + 0.15 // slight pad for trailing eye contact
      });
    }
  }

  // Generate ASS script header
  const header = `[Script Info]
Title: ShortsForge Animated Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,${fontSize},${normalColor},&H00000000,${outlineColor},&H90000000,-1,0,0,0,100,100,0,0,1,9,4,2,60,60,620,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];

  // For each group, create active-word highlight events
  for (const group of groups) {
    const totalInGroup = group.words.length;

    for (let activeIdx = 0; activeIdx < totalInGroup; activeIdx++) {
      const activeWord = group.words[activeIdx];
      const startT = activeWord.start;
      // The highlight stays until next word starts, or until group ends
      const endT = (activeIdx < totalInGroup - 1)
        ? Math.max(activeWord.end, group.words[activeIdx + 1].start)
        : group.endTime;

      if (endT <= startT) continue;

      // Construct the formatted string with the active word styled in gold/yellow
      const formattedWords = group.words.map((w, idx) => {
        const cleanWord = w.word.toUpperCase().replace(/[{}]/g, '');
        if (idx === activeIdx) {
          return `{\\c${activeColor}\\b1\\fscx108\\fscy108}${cleanWord}{\\r\\c${normalColor}}`;
        }
        return `{\\c${normalColor}\\b1}${cleanWord}`;
      });

      const text = formattedWords.join(' ');
      const startAss = formatAssTime(startT);
      const endAss = formatAssTime(endT);

      dialogueLines.push(`Dialogue: 0,${startAss},${endAss},Default,,0,0,0,,${text}`);
    }
  }

  const assContent = header + dialogueLines.join('\n') + '\n';
  fs.writeFileSync(outputPath, assContent, 'utf-8');

  return outputPath;
}
