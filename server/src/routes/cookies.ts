import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

export const cookiesRouter = Router();

/**
 * GET /api/cookies - Status of YouTube cookies
 */
cookiesRouter.get('/', (_req: Request, res: Response) => {
  try {
    const cookiePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    const exists = fs.existsSync(cookiePath);
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
cookiesRouter.post('/', (req: Request, res: Response) => {
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
    fs.writeFileSync(cookiePath, cookiesText.trim(), 'utf-8');
    res.json({ success: true, message: 'YouTube cookies successfully saved to vault!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/cookies - Clear saved cookies
 */
cookiesRouter.delete('/', (_req: Request, res: Response) => {
  try {
    const cookiePath = path.join(CONFIG.STORAGE_DIR, 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
      fs.unlinkSync(cookiePath);
    }
    res.json({ success: true, message: 'YouTube cookies cleared' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
