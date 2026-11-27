import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';
import { ObjectStorageService } from '../services/objectStorage.js';

export const cookiesRouter = Router();

/**
 * GET /api/cookies - Status of YouTube cookies
 */
cookiesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const cookiePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    let exists = fs.existsSync(cookiePath);
    if (!exists && ObjectStorageService.isEnabled()) {
      const restored = await ObjectStorageService.downloadText('system/cookies.txt').catch(() => null);
      if (restored && restored.trim().length > 20) {
        fs.writeFileSync(cookiePath, restored.trim(), 'utf-8');
        exists = true;
      }
    }
    let size = 0;
    let cookieCount = 0;

    if (exists) {
      const content = fs.readFileSync(cookiePath, 'utf-8');
      size = content.length;
      const validLines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      cookieCount = validLines.length;
    }

    res.json({
      success: true,
      data: {
        hasCookies: exists && size > 50,
        cookieCount,
        cookiePath
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/cookies - Save or update YouTube cookies
 */
cookiesRouter.post('/', async (req: Request, res: Response) => {
  const { cookiesText } = req.body;
  if (!cookiesText || typeof cookiesText !== 'string' || cookiesText.trim().length < 20) {
    return res.status(400).json({
      success: false,
      error: 'Please paste valid Netscape-format cookies.txt text from YouTube'
    });
  }

  const hasYoutube = cookiesText.includes('youtube.com') || cookiesText.includes('VISITOR_INFO1_LIVE');
  if (!hasYoutube) {
    return res.status(400).json({
      success: false,
      error: 'The pasted cookies do not contain youtube.com! Make sure you are viewing youtube.com in your browser before clicking the extension icon.'
    });
  }

  try {
    const cookiePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    const trimmed = cookiesText.trim();
    fs.writeFileSync(cookiePath, trimmed, 'utf-8');
    if (ObjectStorageService.isEnabled()) {
      await ObjectStorageService.uploadText('system/cookies.txt', trimmed);
    }
    res.json({ success: true, message: 'YouTube cookies successfully saved to vault!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/cookies - Clear saved cookies
 */
cookiesRouter.delete('/', async (_req: Request, res: Response) => {
  try {
    const cookiePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
      fs.unlinkSync(cookiePath);
    }
    if (ObjectStorageService.isEnabled()) {
      await ObjectStorageService.deletePrefix('system/cookies.txt').catch(() => {});
    }
    res.json({ success: true, message: 'YouTube cookies cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
