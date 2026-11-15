import Groq from 'groq-sdk';
import fs from 'fs';
import { CONFIG } from '../config.js';

export interface WordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface SegmentTimestamp {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  words?: WordTimestamp[];
}

export interface TranscriptionResult {
  text: string;
  words: WordTimestamp[];
  segments?: SegmentTimestamp[];
}

/**
 * Groq Whisper audio transcriber with word-level timestamps & resilient segment fallback
 */
export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  const apiKey = CONFIG.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in .env');
  }

  const groq = new Groq({ apiKey });

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at: ${audioPath}`);
  }

  let transcription: any;

  // Try request with word timestamps; fall back to verbose_json segments if word granularity is rejected
  try {
    transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    });
  } catch (err: any) {
    console.warn('Word-level granularity not accepted by Groq Whisper, retrying with verbose_json:', err.message);
    try {
      transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-large-v3',
        response_format: 'verbose_json'
      });
    } catch (turboErr: any) {
      console.warn('whisper-large-v3 verbose_json failed, retrying with whisper-large-v3-turbo:', turboErr.message);
      transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-large-v3-turbo',
        response_format: 'verbose_json'
      });
    }
  }

  const fullText = transcription.text || '';
  let words: WordTimestamp[] = [];

  if (Array.isArray(transcription.words) && transcription.words.length > 0) {
    words = transcription.words.map((w: any) => ({
      word: (w.word || '').trim(),
      start: parseFloat(w.start ?? 0),
      end: parseFloat(w.end ?? 0)
    })).filter((w: WordTimestamp) => w.word.length > 0);
  } else if (Array.isArray(transcription.segments)) {
    // Generate word timestamps by interpolating words across each segment
    for (const seg of transcription.segments) {
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        for (const w of seg.words) {
          words.push({
            word: (w.word || '').trim(),
            start: parseFloat(w.start ?? seg.start ?? 0),
            end: parseFloat(w.end ?? seg.end ?? 0)
          });
        }
      } else {
        const segText = (seg.text || '').trim();
        const splitWords = segText.split(/\s+/).filter(Boolean);
        const segDuration = Math.max(0.1, (seg.end || 0) - (seg.start || 0));
        const timePerWord = segDuration / Math.max(1, splitWords.length);

        splitWords.forEach((word: string, idx: number) => {
          const start = (seg.start || 0) + idx * timePerWord;
          const end = start + timePerWord;
          words.push({ word, start, end });
        });
      }
    }
  }

  return {
    text: fullText,
    words,
    segments: transcription.segments
  };
}
