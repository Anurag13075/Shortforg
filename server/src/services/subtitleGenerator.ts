import { WordTimestamp } from './transcriber.js';
import fs from 'fs';

export type CaptionPreset = 'hormozi_gold' | 'neon_green' | 'cyber_cyan' | 'sunset_punch' | 'electric_purple' | 'custom';

export interface SubtitleOptions {
  wordsPerChunk?: number;     // 1 to 3 words per burst (default: 2-3)
  fontSize?: number;          // default: 80
  preset?: CaptionPreset;     // preset name
  activeColorHex?: string;    // e.g. '#FFE600' or '#00FF66'
  baseColorHex?: string;      // e.g. '#FFFFFF'
  outlineColorHex?: string;   // e.g. '#000000'
  animation?: 'bounce' | 'glow' | 'simple';
}

/**
 * Converts standard Web Hex (#RRGGBB) to ASS color format (&H00BBGGRR&)
 */
export function hexToAssColor(hex: string): string {
  const clean = hex.replace(/^#/, '').trim();
  if (clean.length === 6) {
    const r = clean.substring(0, 2).toUpperCase();
    const g = clean.substring(2, 4).toUpperCase();
    const b = clean.substring(4, 6).toUpperCase();
    return `&H00${b}${g}${r}&`;
  }
  return '&H0000FFFF&'; // fallback yellow
}

export const CAPTION_PRESETS: Record<CaptionPreset, { active: string; base: string; outline: string; label: string }> = {
  hormozi_gold: {
    active: '#FFE600',
    base: '#FFFFFF',
    outline: '#000000',
    label: 'Hormozi Gold'
  },
  neon_green: {
    active: '#00FF66',
    base: '#FFFFFF',
    outline: '#000000',
    label: 'Neon Beast'
  },
  cyber_cyan: {
    active: '#00F0FF',
    base: '#FFFFFF',
    outline: '#000000',
    label: 'Cyber Cyan'
  },
  sunset_punch: {
    active: '#FF2E63',
    base: '#FFFFFF',
    outline: '#000000',
    label: 'Sunset Punch'
  },
  electric_purple: {
    active: '#B026FF',
    base: '#FFFFFF',
    outline: '#000000',
    label: 'Electric Purple'
  },
  custom: {
    active: '#FFE600',
    base: '#FFFFFF',
    outline: '#000000',
    label: 'Custom Colors'
  }
};

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

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file with Videocaptions.ai style
 * word-by-word kinetic pop animations and customizable color palettes.
 */
export function generateAssSubtitles(
  words: WordTimestamp[],
  clipStart: number,
  clipEnd: number,
  outputPath: string,
  options?: SubtitleOptions
): string {
  const presetKey = options?.preset || 'hormozi_gold';
  const presetConfig = CAPTION_PRESETS[presetKey] || CAPTION_PRESETS.hormozi_gold;

  const activeColor = hexToAssColor(options?.activeColorHex || presetConfig.active);
  const baseColor = hexToAssColor(options?.baseColorHex || presetConfig.base);
  const outlineColor = hexToAssColor(options?.outlineColorHex || presetConfig.outline);

  const wordsPerChunk = Math.max(1, Math.min(4, options?.wordsPerChunk || 2));
  const fontSize = options?.fontSize || 82;
  const animation = options?.animation || 'bounce';

  // Filter words that belong to this clip segment and normalize times relative to clip start (0)
  const clipWords = words
    .filter((w) => w.end >= clipStart && w.start <= clipEnd)
    .map((w) => ({
      word: w.word.trim(),
      start: Math.max(0, w.start - clipStart),
      end: Math.max(0.08, w.end - clipStart)
    }))
    .filter((w) => w.word.length > 0);

  // Group words into short chunks (1-3 words) for rapid visual flow like Videocaptions.ai
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
        endTime: chunk[chunk.length - 1].end + 0.12
      });
    }
  }

  // Generate ASS script header with high-impact font and heavy outline
  const header = `[Script Info]
Title: ShortsForge Kinetic Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Impact,${fontSize},${baseColor},&H00000000,${outlineColor},&H80000000,-1,0,0,0,100,100,1,0,1,10,4,2,60,60,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];

  // For each group, generate the active-word highlight events with kinetic bounce animation
  for (const group of groups) {
    const totalInGroup = group.words.length;

    for (let activeIdx = 0; activeIdx < totalInGroup; activeIdx++) {
      const activeWord = group.words[activeIdx];
      const startT = activeWord.start;
      const endT = activeIdx < totalInGroup - 1
        ? Math.max(activeWord.end, group.words[activeIdx + 1].start)
        : group.endTime;

      if (endT <= startT) continue;

      // Construct formatted string
      const formattedWords = group.words.map((w, idx) => {
        const cleanWord = w.word.toUpperCase().replace(/[{}]/g, '');
        if (idx === activeIdx) {
          if (animation === 'bounce') {
            // Videocaptions.ai kinetic zoom pop: word pops up to 120% scale with active color
            return `{\\c${activeColor}\\b1\\fscx120\\fscy120}${cleanWord}{\\r\\c${baseColor}}`;
          }
          return `{\\c${activeColor}\\b1}${cleanWord}{\\r\\c${baseColor}}`;
        }
        return `{\\c${baseColor}\\b1}${cleanWord}`;
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
