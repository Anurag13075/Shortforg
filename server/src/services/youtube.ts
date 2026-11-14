import { google } from 'googleapis';
import fs from 'fs';
import { CONFIG } from '../config.js';
import { db, ChannelRecord } from '../db/index.js';

export class YouTubeService {
  /**
   * Create an OAuth2 client configured with application credentials
   */
  static getOAuth2Client() {
    if (!CONFIG.GOOGLE_CLIENT_ID || !CONFIG.GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env');
    }

    return new google.auth.OAuth2(
      CONFIG.GOOGLE_CLIENT_ID,
      CONFIG.GOOGLE_CLIENT_SECRET,
      CONFIG.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate Google OAuth authorization URL
   */
  static getAuthUrl(): string {
    const oauth2Client = this.getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // ensures refresh_token is returned
      prompt: 'consent',     // forces consent screen to guarantee refresh_token
      scope: scopes
    });
  }

  /**
   * Handle OAuth callback: exchange code for tokens, fetch channel details, save to SQLite
   */
  static async handleAuthCallback(code: string): Promise<ChannelRecord> {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      // If refresh token wasn't returned because the app was previously authorized,
      // prompt: 'consent' above ensures it is returned.
      console.warn('Warning: Google did not return a refresh token.');
    }

    // Fetch user channel information
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true
    });

    const channelItem = channelRes.data.items?.[0];
    if (!channelItem || !channelItem.id) {
      throw new Error('No YouTube channel found for this Google account.');
    }

    const channelId = channelItem.id;
    const channelTitle = channelItem.snippet?.title || 'YouTube Channel';
    const avatarUrl = channelItem.snippet?.thumbnails?.default?.url || null;

    const now = new Date().toISOString();

    // Check if channel already exists in DB
    const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as ChannelRecord | undefined;

    const refreshTokenToSave = tokens.refresh_token || existing?.refresh_token;
    if (!refreshTokenToSave) {
      throw new Error('No refresh token received. Please revoke permissions in Google Account and reconnect.');
    }

    if (existing) {
      db.prepare(`
        UPDATE channels
        SET title = ?, avatar_url = ?, refresh_token = ?, access_token = ?, token_expiry = ?, status = 'active', updated_at = ?
        WHERE id = ?
      `).run(
        channelTitle,
        avatarUrl,
        refreshTokenToSave,
        tokens.access_token || null,
        tokens.expiry_date || null,
        now,
        channelId
      );
    } else {
      db.prepare(`
        INSERT INTO channels (id, title, avatar_url, refresh_token, access_token, token_expiry, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        channelId,
        channelTitle,
        avatarUrl,
        refreshTokenToSave,
        tokens.access_token || null,
        tokens.expiry_date || null,
        now,
        now
      );
    }

    return db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as ChannelRecord;
  }

  /**
   * Get an authorized OAuth2 client for a stored channel, refreshing the access token if needed
   */
  static async getAuthenticatedClient(channelId: string) {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as ChannelRecord | undefined;
    if (!channel) {
      throw new Error(`Channel with ID ${channelId} not found in database`);
    }

    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: channel.refresh_token,
      access_token: channel.access_token || undefined,
      expiry_date: channel.token_expiry || undefined
    });

    // Handle token refresh events automatically
    oauth2Client.on('tokens', (newTokens) => {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE channels
        SET access_token = COALESCE(?, access_token),
            refresh_token = COALESCE(?, refresh_token),
            token_expiry = COALESCE(?, token_expiry),
            status = 'active',
            updated_at = ?
        WHERE id = ?
      `).run(
        newTokens.access_token || null,
        newTokens.refresh_token || null,
        newTokens.expiry_date || null,
        now,
        channelId
      );
    });

    try {
      // Force token check/refresh
      await oauth2Client.getAccessToken();
    } catch (err: any) {
      // If refresh fails, mark channel as reconnect_needed
      db.prepare("UPDATE channels SET status = 'reconnect_needed', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), channelId);
      throw new Error(`Channel ${channel.title} authentication failed: ${err.message}. Reconnect needed.`);
    }

    return oauth2Client;
  }

  /**
   * Upload video as YouTube Short with metadata and thumbnail
   */
  static async uploadShort(params: {
    channelId: string;
    videoPath: string;
    thumbnailPath?: string | null;
    title: string;
    caption?: string | null;
    hashtags?: string[] | null;
  }): Promise<{ videoId: string; videoUrl: string }> {
    const { channelId, videoPath, thumbnailPath, title, caption, hashtags } = params;

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const auth = await this.getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: 'v3', auth });

    // Format title and description for Shorts
    // Shorts are automatically identified by vertical aspect ratio + #shorts tag
    const tags = Array.isArray(hashtags) ? hashtags.map((h) => h.replace(/^#/, '')) : ['shorts'];
    if (!tags.includes('shorts')) tags.push('shorts');

    const hashtagString = tags.map((t) => `#${t}`).join(' ');
    const shortTitle = title.includes('#Shorts') ? title : `${title} #Shorts`;
    const description = `${caption || title}\n\n${hashtagString}`;

    // 1. Upload Video
    const videoFileSize = fs.statSync(videoPath).size;
    const res = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: shortTitle.substring(0, 100),
            description,
            tags,
            categoryId: '22' // People & Blogs
          },
          status: {
            privacyStatus: 'public', // public Short
            selfDeclaredMadeForKids: false
          }
        },
        media: {
          body: fs.createReadStream(videoPath)
        }
      },
      {
        // Custom request configuration for file upload
        maxBodyLength: videoFileSize + 1024 * 1024 * 10,
        maxContentLength: videoFileSize + 1024 * 1024 * 10
      }
    );

    const videoId = res.data.id;
    if (!videoId) {
      throw new Error('YouTube API did not return a video ID upon upload.');
    }

    // 2. Upload Custom Thumbnail if provided
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        await youtube.thumbnails.set({
          videoId,
          media: {
            mimeType: 'image/jpeg',
            body: fs.createReadStream(thumbnailPath)
          }
        });
      } catch (thumbErr: any) {
        console.warn(`Could not upload custom thumbnail for video ${videoId}: ${thumbErr.message}`);
        // Non-fatal: YouTube assigns an auto-generated thumbnail from the video
      }
    }

    return {
      videoId,
      videoUrl: `https://youtube.com/shorts/${videoId}`
    };
  }
}
