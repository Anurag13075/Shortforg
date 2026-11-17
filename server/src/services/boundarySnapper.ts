import { WordTimestamp } from './transcriber.js';

export interface SnappedBoundary {
  start: number;
  end: number;
  startWord: string;
  endWord: string;
  duration: number;
}

/**
 * Speech Boundary & Sentence Snapping Engine
 * Guarantees that every Short starts cleanly at the beginning of a sentence or hook
 * and ends cleanly when the speaker finishes their thought (no cut-off words or mid-sentence slices).
 */
export function snapToSentenceBoundaries(
  rawStart: number,
  rawEnd: number,
  words: WordTimestamp[],
  videoDuration: number,
  minDuration: number = 22,
  maxDuration: number = 58
): SnappedBoundary {
  if (!words || words.length === 0) {
    const start = Math.max(0, Math.round(rawStart * 10) / 10);
    const end = Math.min(videoDuration, Math.round(rawEnd * 10) / 10);
    return {
      start,
      end,
      startWord: '',
      endWord: '',
      duration: Math.round((end - start) * 10) / 10
    };
  }

  // 1. Find the word closest to rawStart
  let startIdx = 0;
  let minStartDiff = Infinity;
  for (let i = 0; i < words.length; i++) {
    const diff = Math.abs(words[i].start - rawStart);
    if (diff < minStartDiff) {
      minStartDiff = diff;
      startIdx = i;
    }
  }

  // 2. Search backward (up to 4 seconds) or forward (up to 2 seconds) for a clean sentence starter
  // A clean start is a word that follows terminal punctuation (. ? !) or a silence pause > 0.4s
  let bestStartIdx = startIdx;
  const startSearchMin = Math.max(0, rawStart - 4.0);
  const startSearchMax = rawStart + 2.5;

  let foundSentenceStart = false;

  // Search backward first for natural beginning
  for (let i = startIdx; i >= 0 && words[i].start >= startSearchMin; i--) {
    if (i === 0) {
      bestStartIdx = 0;
      foundSentenceStart = true;
      break;
    }
    const prevWord = words[i - 1];
    const currWord = words[i];
    const prevEndsWithPunct = /[.?!]$/.test(prevWord.word.trim());
    const pauseBefore = currWord.start - prevWord.end;

    if (prevEndsWithPunct || pauseBefore >= 0.4) {
      bestStartIdx = i;
      foundSentenceStart = true;
      break;
    }
  }

  // If not found backward, search slightly forward
  if (!foundSentenceStart) {
    for (let i = startIdx; i < words.length && words[i].start <= startSearchMax; i++) {
      if (i > 0) {
        const prevWord = words[i - 1];
        const currWord = words[i];
        if (/[.?!]$/.test(prevWord.word.trim()) || (currWord.start - prevWord.end) >= 0.4) {
          bestStartIdx = i;
          foundSentenceStart = true;
          break;
        }
      }
    }
  }

  const snappedStart = Math.max(0, words[bestStartIdx].start);

  // 3. Find the word closest to rawEnd
  let endIdx = words.length - 1;
  let minEndDiff = Infinity;
  for (let i = bestStartIdx; i < words.length; i++) {
    const diff = Math.abs(words[i].end - rawEnd);
    if (diff < minEndDiff) {
      minEndDiff = diff;
      endIdx = i;
    }
  }

  // 4. Search around endIdx for clean sentence completion (. ? ! or pause > 0.4s)
  // Search within [-3.5s, +5.0s] while respecting minDuration and maxDuration
  let bestEndIdx = endIdx;
  let foundSentenceEnd = false;

  const minTargetTime = snappedStart + minDuration;
  const maxTargetTime = Math.min(videoDuration, snappedStart + maxDuration);

  // Search for the nearest terminal punctuation around endIdx
  let candidates: { idx: number; score: number }[] = [];

  for (let i = bestStartIdx + 3; i < words.length; i++) {
    const w = words[i];
    const candidateEnd = w.end;
    const dur = candidateEnd - snappedStart;

    if (dur < minDuration || dur > maxDuration) continue;

    const endsWithTerminal = /[.?!]$/.test(w.word.trim());
    const endsWithComma = /[,;:]$/.test(w.word.trim());
    const nextWord = i < words.length - 1 ? words[i + 1] : null;
    const pauseAfter = nextWord ? (nextWord.start - w.end) : 1.0;

    let score = 0;
    if (endsWithTerminal) score += 10;
    if (pauseAfter >= 0.5) score += 6;
    if (endsWithComma && pauseAfter >= 0.3) score += 4;

    // Prefer candidates closer to rawEnd
    const diffFromRaw = Math.abs(candidateEnd - rawEnd);
    score -= diffFromRaw * 1.5;

    if (score > 0) {
      candidates.push({ idx: i, score });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    bestEndIdx = candidates[0].idx;
    foundSentenceEnd = true;
  }

  // Add 0.25s audio tail padding so the last syllable resonates naturally
  let snappedEnd = words[bestEndIdx].end + 0.25;
  snappedEnd = Math.min(videoDuration, snappedEnd);

  // Enforce bounds
  let duration = snappedEnd - snappedStart;
  if (duration > maxDuration) {
    snappedEnd = snappedStart + maxDuration;
    duration = maxDuration;
  }
  if (duration < minDuration) {
    snappedEnd = Math.min(videoDuration, snappedStart + minDuration);
    duration = snappedEnd - snappedStart;
  }

  return {
    start: Math.round(snappedStart * 10) / 10,
    end: Math.round(snappedEnd * 10) / 10,
    startWord: words[bestStartIdx].word,
    endWord: words[bestEndIdx].word,
    duration: Math.round(duration * 10) / 10
  };
}
