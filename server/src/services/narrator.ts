import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config.js';
import { FFmpegService } from './ffmpeg.js';

export const NARRATOR_VOICES: Record<string, { label: string; edgeVoice: string; elevenLabsId: string }> = {
  'en-US-AndrewMultilingualNeural': {
    label: 'Andrew — Warm Documentary',
    edgeVoice: 'en-US-AndrewMultilingualNeural',
    elevenLabsId: 'pNInz6obpgDQGcFmaJgB' // Adam
  },
  'en-US-BrianNeural': {
    label: 'Brian — Deep Storyteller',
    edgeVoice: 'en-US-BrianNeural',
    elevenLabsId: 'VR6AewLTigWG4xSOukaG' // Arnold
  },
  'en-US-EmmaMultilingualNeural': {
    label: 'Emma — Crisp Analyst',
    edgeVoice: 'en-US-EmmaMultilingualNeural',
    elevenLabsId: '21m00Tcm4TlvDq8ikWAM' // Rachel
  }
};

export class NarratorService {
  /**
   * Synthesize natural, studio-paced documentary narration to MP3.
   * Uses ElevenLabs if ELEVENLABS_API_KEY is set; otherwise uses free neural edge-tts.
   */
  public static async synthesizeSpeech(
    text: string,
    outputMp3Path: string,
    voiceKey: string = 'en-US-AndrewMultilingualNeural'
  ): Promise<{ audioPath: string; duration: number } | null> {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!cleanText || cleanText.length < 4) return null;

    const dir = path.dirname(outputMp3Path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const voiceCfg = NARRATOR_VOICES[voiceKey] || NARRATOR_VOICES['en-US-AndrewMultilingualNeural'];

    // 1. Optional ElevenLabs (highest realism when user provides ELEVENLABS_API_KEY)
    if (CONFIG.ELEVENLABS_API_KEY) {
      try {
        const res = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceCfg.elevenLabsId}`,
          {
            text: cleanText,
            model_id: 'eleven_flash_v2_5',
            voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.25 }
          },
          {
            headers: {
              'xi-api-key': CONFIG.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg'
            },
            responseType: 'arraybuffer',
            timeout: 30000
          }
        );
        fs.writeFileSync(outputMp3Path, Buffer.from(res.data));
        if (fs.existsSync(outputMp3Path) && fs.statSync(outputMp3Path).size > 1000) {
          const meta = await FFmpegService.getVideoMetadata(outputMp3Path);
          return { audioPath: outputMp3Path, duration: Math.max(1.5, meta.duration || 4) };
        }
      } catch (err: any) {
        console.warn('ElevenLabs TTS failed, falling back to edge-tts:', err.message);
      }
    }

    // 2. Zero-cost neural edge-tts (runs via python3 -m edge_tts or edge-tts CLI)
    const commands: Array<{ bin: string; args: string[] }> = [
      {
        bin: 'python3',
        args: ['-m', 'edge_tts', '--voice', voiceCfg.edgeVoice, '--rate=+4%', '--text', cleanText, '--write-media', outputMp3Path]
      },
      {
        bin: 'python',
        args: ['-m', 'edge_tts', '--voice', voiceCfg.edgeVoice, '--rate=+4%', '--text', cleanText, '--write-media', outputMp3Path]
      },
      {
        bin: 'edge-tts',
        args: ['--voice', voiceCfg.edgeVoice, '--rate=+4%', '--text', cleanText, '--write-media', outputMp3Path]
      }
    ];

    for (const cmd of commands) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const child = spawn(cmd.bin, cmd.args);
          const timer = setTimeout(() => {
            try { child.kill(); } catch {}
            resolve(false);
          }, 25000);

          child.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0 && fs.existsSync(outputMp3Path) && fs.statSync(outputMp3Path).size > 1000);
          });
          child.on('error', () => {
            clearTimeout(timer);
            resolve(false);
          });
        });

        if (ok) {
          const meta = await FFmpegService.getVideoMetadata(outputMp3Path);
          return { audioPath: outputMp3Path, duration: Math.max(1.5, meta.duration || 4) };
        }
      } catch {}
    }

    return null;
  }
}
