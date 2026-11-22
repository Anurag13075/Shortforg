import { WordTimestamp } from './transcriber.js';
import fs from 'fs';

export type CaptionPreset = 'hormozi_gold' | 'neon_green' | 'cyber_cyan' | 'sunset_punch' | 'electric_purple' | 'custom';

export interface SubtitleOptions {
  wordsPerChunk?: number;     
  fontSize?: number;          
  preset?: CaptionPreset;     
  activeColorHex?: string;    
  baseColorHex?: string;     
  outlineColorHex?: string;   
  animation?: 'bounce' | 'glow' | 'simple';
  hookText?: string;          // Spoken hook line to burn in top banner
  includeHookOverlay?: boolean; // Default: true (shows for first 2.5s)
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

const VIRAL_EMOJI_MAP: Record<string, string> = {
  MONEY: '💰',
  CASH: '💵',
  DOLLAR: '💵',
  DOLLARS: '💵',
  RICH: '🤑',
  FIRE: '🔥',
  CRAZY: '🤯',
  INSANE: '⚡',
  POLICE: '🚨',
  COP: '🚨',
  COPS: '🚨',
  JAIL: '🔒',
  PRISON: '🔒',
  SECRET: '🤫',
  DEAD: '💀',
  KILL: '💀',
  KILLED: '💀',
  WIN: '🏆',
  BEST: '🥇',
  WARNING: '⚠️',
  DANGER: '⚠️',
  LOVE: '❤️',
  FAST: '⚡',
  ROCKET: '🚀',
  TARGET: '🎯',
  TIME: '⏳',
  STOP: '🛑',
  TRUTH: '👁️',
  GAME: '🎮',
  CAR: '🏎️',
  SHOCK: '😱',
  WOW: '🤯',
  HYPE: '🔥'
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
  const fontSize = options?.fontSize || 88;
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

  // Generate ASS script header with high-impact Anton typography, sweet-spot eyeline positioning (MarginV: 860 avoids mobile UI), and Hook Banner
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
Style: Default,Anton,${fontSize},${baseColor},&H00000000,${outlineColor},&H80000000,-1,0,0,0,100,100,1,0,1,10,4,2,60,60,860,1
Style: HookBanner,Anton,74,&H0000FFFF,&H00000000,&H00000000,&HA0000000,-1,0,0,0,100,100,1,0,1,8,4,8,40,40,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];

  // 1. Burn-in Hook Headline Banner for the first 2.2 seconds (instant pattern interrupt)
  if (options?.includeHookOverlay !== false && options?.hookText && options.hookText.trim()) {
    const rawHook = options.hookText.replace(/[\r\n\t]+/g, ' ').replace(/[{}]/g, '').trim().toUpperCase();
    if (rawHook.length > 0) {
      // Split into lines if longer than 20 chars so it stays centered
      const hookWords = rawHook.split(/\s+/);
      const hookLines: string[] = [];
      let curLine = '';
      for (const hw of hookWords) {
        if ((curLine + ' ' + hw).trim().length > 20) {
          if (curLine) hookLines.push(curLine.trim());
          curLine = hw;
        } else {
          curLine = (curLine + ' ' + hw).trim();
        }
      }
      if (curLine) hookLines.push(curLine.trim());
      const cleanHook = hookLines.join('\\N');

      dialogueLines.push(
        `Dialogue: 1,0:00:00.00,0:00:02.20,HookBanner,,0,0,0,,{\\b1\\c&H0000FFFF&\\3c&H00000000&\\bord9\\shad4}${cleanHook}`
      );
    }
  }

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

      // Construct formatted string with contextual emoji pop
      const formattedWords = group.words.map((w, idx) => {
        const cleanWord = w.word.toUpperCase().replace(/[{}]/g, '');
        const alphaOnly = cleanWord.replace(/[^A-Z]/g, '');
        const emoji = VIRAL_EMOJI_MAP[alphaOnly] ? ' ' + VIRAL_EMOJI_MAP[alphaOnly] : '';

        if (idx === activeIdx) {
          if (animation === 'bounce') {
            // Videocaptions.ai kinetic zoom pop: word pops up to 122% scale with active color & emoji
            return `{\\c${activeColor}\\b1\\fscx122\\fscy122}${cleanWord}${emoji}{\\r\\c${baseColor}}`;
          }
          return `{\\c${activeColor}\\b1}${cleanWord}${emoji}{\\r\\c${baseColor}}`;
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
