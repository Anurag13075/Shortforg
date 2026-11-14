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
 * Groq Whisper audio transcriber with word-level timestamps
 */
export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  const apiKey = CONFIG.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in .env');
  }

  const groq = new Groq({ apiKey });

  // Verify file existence
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at: ${audioPath}`);
  }

  const fileStream = fs.createReadStream(audioPath);

  // Call Groq Whisper endpoint with word-level timestamps
  const transcription: any = await groq.audio.transcriptions.create({
    file: fileStream,
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    temperature: 0.0
  });

  const fullText = transcription.text || '';
  let words: WordTimestamp[] = [];

  if (Array.isArray(transcription.words)) {
    words = transcription.words.map((w: any) => ({
      word: (w.word || '').trim(),
      start: parseFloat(w.start ?? 0),
      end: parseFloat(w.end ?? 0)
    })).filter((w: WordTimestamp) => w.word.length > 0);
  } else if (Array.isArray(transcription.segments)) {
    // Fallback if words array wasn't directly populated
    for (const seg of transcription.segments) {
      if (Array.isArray(seg.words)) {
        for (const w of seg.words) {
          words.push({
            word: (w.word || '').trim(),
            start: parseFloat(w.start ?? seg.start ?? 0),
            end: parseFloat(w.end ?? seg.end ?? 0)
          });
        }
      }
    }
  }

  return {
    text: fullText,
    words,
    segments: transcription.segments
  };
}
