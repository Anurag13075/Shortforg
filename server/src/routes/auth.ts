import { Router, Request, Response } from 'express';
import { YouTubeService } from '../services/youtube.js';
import { CONFIG } from '../config.js';

export const authRouter =  Router();

/**
 * GET /auth/google - Initiate Google OAuth2 flow for YouTube Data API
 */
authRouter.get('/google', (_req: Request, res: Response) => {
  try {
    const authUrl = YouTubeService.getAuthUrl();
    res.redirect(authUrl);
  } catch (err: any) {
    res.status(500).send(`Failed to initiate Google authentication: ${err.message}`);
  }
});

/**
 * GET /auth/google/callback - Google OAuth2 callback endpoint
 */
authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    return res.redirect(`${CONFIG.APP_URL}/schedule?auth=error&message=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${CONFIG.APP_URL}/schedule?auth=error&message=Missing+authorization+code`);
  }

  try {
    const channel = await YouTubeService.handleAuthCallback(code);
    return res.redirect(`${CONFIG.APP_URL}/schedule?auth=success&channel=${encodeURIComponent(channel.title)}`);
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return res.redirect(`${CONFIG.APP_URL}/schedule?auth=error&message=${encodeURIComponent(err.message)}`);
  }
});
