import { Request, Response } from 'express';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { CONFIG } from '../config.js';

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  if (!CONFIG.S3_ENDPOINT || !CONFIG.S3_ACCESS_KEY_ID || !CONFIG.S3_SECRET_ACCESS_KEY) {
    throw new Error('Object Storage (S3) is not configured');
  }
  cachedClient = new S3Client({
    endpoint: CONFIG.S3_ENDPOINT,
    region: CONFIG.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: CONFIG.S3_ACCESS_KEY_ID,
      secretAccessKey: CONFIG.S3_SECRET_ACCESS_KEY
    },
    forcePathStyle: true // Required for Zerops / MinIO S3-compatible storage
  });
  return cachedClient;
}

export class ObjectStorageService {
  static isEnabled(): boolean {
    return Boolean(
      CONFIG.S3_ENDPOINT &&
      CONFIG.S3_ACCESS_KEY_ID &&
      CONFIG.S3_SECRET_ACCESS_KEY &&
      CONFIG.S3_BUCKET
    );
  }

  static isS3Uri(p?: string | null): boolean {
    return Boolean(p && p.startsWith('s3://'));
  }

  static keyFromUri(uri: string): string {
    return uri.replace(/^s3:\/\//, '');
  }

  /**
   * Upload a local file to Zerops Object Storage (S3) and return its s3:// URI
   */
  static async uploadFile(localPath: string, key: string, contentType?: string): Promise<string> {
    if (!this.isEnabled()) return localPath;
    if (!fs.existsSync(localPath)) {
      throw new Error(`Cannot upload missing file: ${localPath}`);
    }

    const client = getClient();
    const cleanKey = key.replace(/^\/+/, '');
    const fileStream = fs.createReadStream(localPath);

    await client.send(
      new PutObjectCommand({
        Bucket: CONFIG.S3_BUCKET,
        Key: cleanKey,
        Body: fileStream,
        ContentType: contentType || (cleanKey.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4')
      })
    );

    return `s3://${cleanKey}`;
  }

  /**
   * Upload raw text (e.g. cookies.txt) directly to S3
   */
  static async uploadText(key: string, text: string): Promise<void> {
    if (!this.isEnabled()) return;
    const client = getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: CONFIG.S3_BUCKET,
        Key: key.replace(/^\/+/, ''),
        Body: Buffer.from(text, 'utf-8'),
        ContentType: 'text/plain; charset=utf-8'
      })
    );
  }

  /**
   * Download text (e.g. cookies.txt) from S3 if present
   */
  static async downloadText(key: string): Promise<string | null> {
    if (!this.isEnabled()) return null;
    try {
      const client = getClient();
      const res = await client.send(
        new GetObjectCommand({
          Bucket: CONFIG.S3_BUCKET,
          Key: key.replace(/^\/+/, '')
        })
      );
      if (!res.Body) return null;
      return await res.Body.transformToString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Download an S3 object to a local file path (used before YouTube upload or FFmpeg re-render)
   */
  static async downloadToFile(s3UriOrKey: string, localDest: string): Promise<string> {
    const key = this.keyFromUri(s3UriOrKey);
    const client = getClient();
    const dir = path.dirname(localDest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const res = await client.send(
      new GetObjectCommand({
        Bucket: CONFIG.S3_BUCKET,
        Key: key
      })
    );

    if (!res.Body) {
      throw new Error(`Empty S3 body for ${key}`);
    }

    const nodeStream = res.Body as Readable;
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(localDest);
      nodeStream.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      nodeStream.on('error', reject);
    });

    return localDest;
  }

  /**
   * Check object size/metadata (for HEAD & Range streaming)
   */
  static async headObject(s3UriOrKey: string): Promise<{ size: number; contentType: string } | null> {
    if (!this.isEnabled()) return null;
    try {
      const client = getClient();
      const res = await client.send(
        new HeadObjectCommand({
          Bucket: CONFIG.S3_BUCKET,
          Key: this.keyFromUri(s3UriOrKey)
        })
      );
      return {
        size: res.ContentLength || 0,
        contentType: res.ContentType || 'application/octet-stream'
      };
    } catch {
      return null;
    }
  }

  /**
   * Stream object from S3 with optional HTTP Range header (supports 206 video seeking)
   */
  static async getObjectStream(
    s3UriOrKey: string,
    range?: string
  ): Promise<{ stream: Readable; contentLength: number; contentRange?: string; contentType: string }> {
    const client = getClient();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: CONFIG.S3_BUCKET,
        Key: this.keyFromUri(s3UriOrKey),
        Range: range
      })
    );

    return {
      stream: res.Body as Readable,
      contentLength: res.ContentLength || 0,
      contentRange: res.ContentRange,
      contentType: res.ContentType || 'application/octet-stream'
    };
  }

  /**
   * Delete all objects under a prefix (e.g. projects/<id>/ or longform/<id>/)
   */
  static async deletePrefix(prefix: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const client = getClient();
      const cleanPrefix = prefix.replace(/^\/+/, '');
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: CONFIG.S3_BUCKET,
          Prefix: cleanPrefix
        })
      );
      const keys = (list.Contents || []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: CONFIG.S3_BUCKET,
            Delete: { Objects: keys }
          })
        );
      }
    } catch (err: any) {
      console.warn('S3 deletePrefix warning:', err.message);
    }
  }

  /**
   * Stream an S3 video to Express with full HTTP Range (206) & HEAD support
   */
  static async streamVideoToResponse(
    s3Uri: string,
    req: Request,
    res: Response,
    downloadFilename?: string
  ): Promise<void> {
    const head = await this.headObject(s3Uri);
    if (!head) {
      res.status(404).json({ success: false, error: 'Video not found in cloud storage' });
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': head.size,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      });
      res.end();
      return;
    }

    const range = req.headers.range;
    if (downloadFilename) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    }

    if (range) {
      const { stream, contentLength, contentRange } = await this.getObjectStream(s3Uri, range);
      res.writeHead(206, {
        'Content-Range': contentRange || `bytes 0-${Math.max(0, head.size - 1)}/${head.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache'
      });
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      res.on('close', () => stream.destroy());
    } else {
      const { stream, contentLength } = await this.getObjectStream(s3Uri);
      res.writeHead(200, {
        'Content-Length': contentLength || head.size,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      res.on('close', () => stream.destroy());
    }
  }

  /**
   * Stream an S3 JPEG thumbnail to Express
   */
  static async streamImageToResponse(s3Uri: string, res: Response): Promise<void> {
    const head = await this.headObject(s3Uri);
    if (!head) {
      res.status(404).send('Thumbnail not found');
      return;
    }
    const { stream, contentLength } = await this.getObjectStream(s3Uri);
    res.setHeader('Content-Type', 'image/jpeg');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
    stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  }
}
