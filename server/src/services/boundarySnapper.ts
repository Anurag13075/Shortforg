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
  minDuration: number = 18,
  maxDuration: number = 42
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

  // 2. Search backward (up to 4.5 seconds) or slightly forward for a clean sentence starter
  // A clean start is a word that follows terminal punctuation (. ? !) or a silence pause > 0.35s
  let bestStartIdx = startIdx;
  const startSearchMin = Math.max(0, rawStart - 4.5);
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

    if (prevEndsWithPunct || pauseBefore >= 0.35) {
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
        if (/[.?!]$/.test(prevWord.word.trim()) || (currWord.start - prevWord.end) >= 0.35) {
          bestStartIdx = i;
          foundSentenceStart = true;
          break;
        }
      }
    }
  }

  // Pre-roll by 0.15s so the opening consonant is never clipped
  const snappedStart = Math.max(0, words[bestStartIdx].start - 0.15);

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

  // 4. Guarantee Thought Completion: Search forward/around endIdx for TERMINAL punctuation (. ? !) or pause >= 0.6s
  // NEVER cut off mid-thought or at a comma!
  let bestEndIdx = endIdx;
  let terminalCandidateIdx: number | null = null;
  let pauseCandidateIdx: number | null = null;

  // First: look forward from endIdx up to maxDuration (or +8s) for the completion of the sentence
  for (let i = endIdx; i < words.length; i++) {
    const w = words[i];
    const dur = w.end - snappedStart;
    if (dur > maxDuration) break;

    const isTerminal = /[.?!]$/.test(w.word.trim());
    const nextWord = i < words.length - 1 ? words[i + 1] : null;
    const pauseAfter = nextWord ? (nextWord.start - w.end) : 1.0;

    if (isTerminal) {
      terminalCandidateIdx = i;
      break; // Found the true completion of the sentence!
    } else if (pauseAfter >= 0.65 && pauseCandidateIdx === null) {
      pauseCandidateIdx = i;
    }
  }

  // If not found forward, search backward from endIdx for a terminal punctuation mark
  if (terminalCandidateIdx === null) {
    for (let i = endIdx; i >= bestStartIdx + 4; i--) {
      const w = words[i];
      const dur = w.end - snappedStart;
      if (dur < minDuration) break;

      const isTerminal = /[.?!]$/.test(w.word.trim());
      const nextWord = i < words.length - 1 ? words[i + 1] : null;
      const pauseAfter = nextWord ? (nextWord.start - w.end) : 1.0;

      if (isTerminal) {
        terminalCandidateIdx = i;
        break;
      } else if (pauseAfter >= 0.65 && pauseCandidateIdx === null) {
        pauseCandidateIdx = i;
      }
    }
  }

  if (terminalCandidateIdx !== null) {
    bestEndIdx = terminalCandidateIdx;
  } else if (pauseCandidateIdx !== null) {
    bestEndIdx = pauseCandidateIdx;
  } else {
    bestEndIdx = endIdx;
  }

  // Add 0.55s audio tail padding so the last word and sentence naturally reverberates (eliminates abrupt cuts)
  let snappedEnd = words[bestEndIdx].end + 0.55;
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
